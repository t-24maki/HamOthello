import { test } from "node:test";
import assert from "node:assert/strict";
import { createOnlineSession } from "../src/online-game.js";
import { ONLINE_VERSION } from "../src/card-rules.js";

function fakeTransport(peers) {
  let self;
  let subscription;
  const handlers = {},
    sent = [],
    channels = [];
  let removed = false;
  const channel = {
    presenceState: () => ({ room: [self, ...peers].filter(Boolean) }),
    on(type, options, callback) {
      handlers[type] = callback;
      return channel;
    },
    subscribe(callback) {
      subscription = callback;
      queueMicrotask(() => callback("SUBSCRIBED"));
    },
    async track(value) {
      self = value;
    },
    async untrack() {},
    async send(value) {
      sent.push(value);
      return "ok";
    },
  };
  return {
    handlers,
    sent,
    channels,
    status: (value) => subscription(value),
    self: () => self,
    removed: () => removed,
    factory: () => ({
      channel: (name) => {
        channels.push(name);
        return channel;
      },
      async removeChannel() {
        removed = true;
      },
    }),
  };
}
globalThis.window = { setTimeout, clearTimeout };

test("guest adopts host card rules and color through presence, without contacting Supabase", async () => {
  const transport = fakeTransport([
    {
      clientId: "host",
      role: "host",
      player: 2,
      ruleMode: "cards",
      version: ONLINE_VERSION,
      joinedAt: 0,
    },
  ]);
  const ready = [],
    messages = [];
  const session = await createOnlineSession({
    role: "guest",
    roomCode: "HAMU-ABC234",
    hostPlayer: 1,
    ruleMode: "classic",
    clientFactory: transport.factory,
    onReady: (value) => ready.push(value),
    onMessage: (value) => messages.push(value),
  });
  assert.deepEqual(ready, [{ localPlayer: 1, remotePlayer: 2, ruleMode: "cards" }]);
  assert.equal(transport.self().version, ONLINE_VERSION);
  transport.handlers.broadcast({ payload: { senderId: "stranger", type: "state" } });
  assert.equal(messages.length, 0);
  transport.handlers.broadcast({ payload: { senderId: "host", type: "state" } });
  assert.equal(messages.length, 1);
  await session.send({ type: "state-request", version: ONLINE_VERSION });
  assert.equal(transport.sent[0].payload.senderRole, "guest");
  await session.close();
  assert.ok(transport.removed());
});

test("incompatible clients get a reload message instead of starting different rules", async () => {
  const transport = fakeTransport([{ clientId: "old-guest", role: "guest", joinedAt: 0 }]);
  const errors = [],
    ready = [];
  const session = await createOnlineSession({
    role: "host",
    roomCode: "HAMU-ABC234",
    hostPlayer: 1,
    ruleMode: "cards",
    clientFactory: transport.factory,
    onReady: (value) => ready.push(value),
    onError: (error) => errors.push(error.message),
  });
  assert.equal(ready.length, 0);
  assert.match(errors[0], /読み込み直して/);
  await session.close();
});

test("poker reuses room transport with its own channel and protocol, independent of Othello", async () => {
  const transport = fakeTransport([
    {
      clientId: "host",
      role: "host",
      player: 1,
      ruleMode: "poker",
      version: "mini-poker-1",
      joinedAt: 0,
    },
  ]);
  const ready = [];
  const session = await createOnlineSession({
    role: "guest",
    roomCode: "HAMU-ABC234",
    hostPlayer: 1,
    ruleMode: "poker",
    protocolVersion: "mini-poker-1",
    channelPrefix: "takumegu-mini-poker",
    supportedRules: ["poker"],
    clientFactory: transport.factory,
    onReady: (value) => ready.push(value),
  });
  assert.deepEqual(transport.channels, ["takumegu-mini-poker:HAMU-ABC234"]);
  assert.equal(transport.self().version, "mini-poker-1");
  assert.equal(ready[0].localPlayer, 2);
  assert.equal(ready[0].ruleMode, "poker");
  await session.close();
});

test("a channel failure after connection notifies the game and removes its subscription", async () => {
  const transport = fakeTransport([]),
    errors = [];
  const session = await createOnlineSession({
    role: "host",
    roomCode: "HAMU-ABC234",
    hostPlayer: 1,
    clientFactory: transport.factory,
    onError: (error) => errors.push(error.message),
  });
  await transport.status("CHANNEL_ERROR");
  assert.match(errors[0], /通信が切れた/);
  await session.close();
  assert.ok(transport.removed());
});
