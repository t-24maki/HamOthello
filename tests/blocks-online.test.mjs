import test from "node:test";
import assert from "node:assert/strict";
import {
  createRound,
  applyAction,
  roundView,
  validateRound,
  PROTOCOL,
} from "../blocks/online-rules.js";
import { createBlocksMatch } from "../blocks/online.js";
import { completePacking } from "./blocks-fixtures.mjs";
import { legalMoves } from "../blocks/rules.js";
const request = (s, type, action) => ({
  type,
  action,
  matchId: s.matchId,
  roundId: s.roundId,
  revision: s.revision,
});
const firstMove = (s) => legalMoves(s.game).next().value;
function finish(s) {
  while (s.game.status === "playing") {
    const r = applyAction(s, s.game.turn, request(s, "play", firstMove(s)));
    assert.ok(r.ok);
    s = r.state;
    assert.deepEqual(validateRound(structuredClone(roundView(s))), s);
  }
  return s;
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
function network() {
  const peers = [],
    intervals = new Set(),
    messages = [];
  let dropAction = false,
    dropState = false;
  const timers = {
    setInterval(fn) {
      intervals.add(fn);
      return fn;
    },
    clearInterval(fn) {
      intervals.delete(fn);
    },
  };
  const factory = async (options) => {
    const self = { options, id: `seat-${peers.length}`, closed: false };
    peers.push(self);
    if (peers.length === 2)
      queueMicrotask(() =>
        peers.forEach((p) => {
          p.options.onPeerChange(true, { peerId: peers.find((q) => q !== p).id });
          p.options.onReady();
        }),
      );
    return {
      clientId: self.id,
      async send(message) {
        messages.push({ from: options.role, message: structuredClone(message) });
        if (message.type === "action" && dropAction) {
          dropAction = false;
          return true;
        }
        if (message.type === "state" && dropState) {
          dropState = false;
          return true;
        }
        const peer = peers.find((p) => p !== self && !p.closed);
        if (peer) peer.options.onMessage(structuredClone(message));
        return !!peer;
      },
      async close() {
        self.closed = true;
      },
    };
  };
  return {
    peers,
    timers,
    factory,
    intervals,
    messages,
    dropAction() {
      dropAction = true;
    },
    dropState() {
      dropState = true;
    },
    retry() {
      for (const fn of intervals) fn();
    },
  };
}
async function pair(options = {}) {
  const wire = network(),
    h = [],
    g = [],
    errors = [],
    states = [];
  const base = {
    roomCode: "HAMU-ABC234",
    sessionFactory: wire.factory,
    timers: wire.timers,
    random: () => 0.99,
    onError: (e) => errors.push(e.message),
  };
  const host = await createBlocksMatch({
    ...base,
    ...options,
    role: "host",
    onState: (s) => h.push(s),
  });
  const guest = await createBlocksMatch({
    ...base,
    role: "guest",
    onState: (s) => g.push(s),
    onStatus: (s) => states.push(s),
  });
  await tick();
  return { wire, host, guest, h: () => h.at(-1), g: () => g.at(-1), errors, states };
}
test("online blocks: replay reconstructs both inventories, placements and automatic winner", () => {
  const state = finish(createRound("test", 1, () => 0.5));
  assert.equal(state.game.status, "won");
  assert.deepEqual(validateRound(roundView(state)), state);
});
test("online blocks: out-of-turn, stale, reflected, duplicate and wrong-match requests are rejected", () => {
  const state = createRound("test"),
    before = structuredClone(state),
    action = firstMove(state);
  for (const [player, r] of [
    [1, request(state, "play", action)],
    [0, { ...request(state, "play", action), revision: 8 }],
    [0, request(state, "play", { ...action, flip: true })],
    [0, request(state, "play", { ...action, x: 8 })],
    [0, { ...request(state, "play", action), matchId: "other" }],
    [0, request(state, "rematch")],
  ])
    assert.equal(applyAction(state, player, r).ok, false);
  const r = request(state, "play", action),
    next = applyAction(state, 0, r).state;
  assert.equal(applyAction(next, 0, r).ok, false);
  assert.deepEqual(state, before);
});
test("online blocks: invalid seeds, forged histories, excessive actions and old protocols are rejected", () => {
  const s = createRound("test"),
    v = roundView(s);
  for (const bad of [
    null,
    { ...v, protocol: "shogi" },
    { ...v, seed: -1 },
    { ...v, seed: 2 ** 32 },
    { ...v, seed: 0.1 },
    { ...v, roundId: 0 },
    { ...v, revision: 1 },
    { ...v, actions: [firstMove(s), firstMove(s)], revision: 2 },
    { ...v, actions: Array(15).fill(firstMove(s)), revision: 15 },
    { ...v, rematch: [true, false], revision: 1 },
    { ...v, rematch: [0, false] },
  ])
    assert.equal(validateRound(bad), null);
});
test("online blocks: rematch needs both votes, redraws black cells and swaps the starting player", () => {
  let s = finish(createRound("test", 1, () => 0.5));
  const original = s,
    blocked = s.game.board.map((v) => v === -1);
  s = applyAction(s, 0, request(s, "rematch")).state;
  assert.equal(s.roundId, 1);
  assert.deepEqual(validateRound(roundView(s)), s);
  assert.equal(applyAction(s, 0, request(s, "rematch")).ok, false);
  s = applyAction(s, 1, request(original, "rematch"), () => 0.1).state;
  assert.equal(s.roundId, 2);
  assert.equal(s.game.starter, 1);
  assert.equal(s.game.turn, 1);
  assert.notDeepEqual(
    s.game.board.map((v) => v === -1),
    blocked,
  );
  assert.deepEqual(validateRound(roundView(s)), s);
  assert.equal(applyAction(s, 0, request(s, "play", firstMove(s))).ok, false);
});
test("online blocks: dropped placements, state packets and duplicate acknowledgements recover once", async () => {
  const p = await pair();
  try {
    assert.deepEqual(p.h(), p.g());
    for (const peer of p.wire.peers) {
      assert.equal(peer.options.channelPrefix, "takumegu-blocks");
      assert.equal(peer.options.protocolVersion, PROTOCOL);
    }
    p.wire.dropState();
    assert.ok(p.host.submit("play", firstMove(p.h())));
    assert.notEqual(p.h().revision, p.g().revision);
    p.wire.retry();
    assert.deepEqual(p.h(), p.g());
    p.wire.dropAction();
    assert.ok(p.guest.submit("play", firstMove(p.g())));
    assert.equal(p.guest.submit("play", firstMove(p.g())), false);
    p.wire.dropState();
    p.wire.retry();
    assert.equal(p.h().revision, 2);
    assert.equal(p.g().revision, 1);
    p.wire.retry();
    assert.deepEqual(p.h(), p.g());
    const duplicate = p.wire.messages.find((m) => m.message.type === "action").message;
    p.wire.peers[0].options.onMessage(duplicate);
    assert.equal(p.h().revision, 2);
    assert.equal(p.states.at(-1), "connected");
    while (p.h().game.status === "playing")
      (p.h().game.turn === 0 ? p.host : p.guest).submit("play", firstMove(p.h()));
    assert.deepEqual(p.h(), p.g());
    p.guest.submit("rematch");
    p.host.submit("rematch");
    assert.equal(p.h().roundId, 2);
    assert.equal(p.h().game.turn, 1);
    assert.deepEqual(p.h(), p.g());
    assert.ok(p.guest.submit("play", firstMove(p.g())));
    assert.deepEqual(p.h(), p.g());
  } finally {
    p.host.close();
    p.guest.close();
  }
  assert.equal(p.wire.intervals.size, 0);
});
test("online blocks: stale snapshots and changed seeds cannot replace the current board", async () => {
  const p = await pair();
  try {
    const old = roundView(p.h());
    p.host.submit("play", firstMove(p.h()));
    const current = structuredClone(p.g());
    for (const state of [
      old,
      { ...roundView(p.h()), seed: 1234 },
      { ...roundView(p.h()), matchId: "other" },
    ])
      p.wire.peers[1].options.onMessage({ protocol: PROTOCOL, type: "state", state });
    assert.deepEqual(p.g(), current);
  } finally {
    p.host.close();
    p.guest.close();
  }
});
test("online blocks: disconnect stops play and closes the retry timer", async () => {
  const p = await pair();
  try {
    p.wire.peers[0].options.onPeerChange(false);
    assert.equal(p.host.submit("play", firstMove(p.h())), false);
    assert.equal(p.errors.length, 1);
    assert.match(p.errors[0], /通信が切れ/);
    assert.equal(p.wire.peers[0].closed, true);
  } finally {
    p.host.close();
    p.guest.close();
  }
  assert.equal(p.wire.intervals.size, 0);
});
test("online blocks: missing acknowledgement eventually reports a timeout", async () => {
  let time = 0;
  const wire = network(),
    errors = [];
  let state;
  const base = {
    roomCode: "HAMU-ABC234",
    sessionFactory: wire.factory,
    timers: wire.timers,
    now: () => time,
    onError: (e) => errors.push(e.message),
  };
  const host = await createBlocksMatch({
    ...base,
    role: "host",
    onState: (s) => {
      state = s;
    },
  });
  const guest = await createBlocksMatch({ ...base, role: "guest" });
  try {
    await tick();
    host.submit("play", firstMove(state));
    wire.dropAction();
    guest.submit("play", firstMove(state));
    time = 15001;
    wire.retry();
    assert.equal(errors.length, 1);
    assert.match(errors[0], /返事が届かない/);
    assert.equal(guest.submit("play", firstMove(state)), false);
  } finally {
    host.close();
    guest.close();
  }
  assert.equal(wire.intervals.size, 0);
});

for (const roundId of [1, 2])
  test(`online blocks: all pieces placed awards the second player after replay (round ${roundId})`, () => {
    let s = createRound("complete", roundId, () => 14590 / 4294967296);
    for (const action of completePacking) {
      const result = applyAction(s, s.game.turn, request(s, "play", action));
      assert.ok(result.ok);
      s = result.state;
      assert.deepEqual(validateRound(roundView(s)), s);
    }
    assert.equal(s.game.reason, "all-placed");
    assert.equal(s.game.winner, roundId % 2);
    assert.equal(s.game.board.filter((v) => v === 0).length, 4);
  });
