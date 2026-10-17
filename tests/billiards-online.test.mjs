import test from "node:test";
import assert from "node:assert/strict";
import {
  createRound,
  applyAction,
  settleRound,
  roundView,
  validateRound,
  PROTOCOL,
} from "../billiards/online-rules.js";
import { createBilliardsMatch } from "../billiards/online.js";
import { advance, findCuePlacement } from "../billiards/physics.js";
const request = (state, type, action) => ({
  matchId: state.matchId,
  roundId: state.roundId,
  revision: state.revision,
  type,
  action,
});
const shot = { dx: 83, dy: -100 };
function apply(state, type, action) {
  const result = applyAction(state, state.game.turn, request(state, type, action));
  assert.ok(result.ok, result.message);
  return result.state;
}
function playOut(state) {
  while (state.game.phase !== "finished") {
    if (state.game.phase === "placing") state = apply(state, "place", findCuePlacement(state.game));
    state = apply(state, "shot", shot);
    assert.deepEqual(validateRound(roundView(state)), state);
    state = settleRound(state);
    assert.deepEqual(validateRound(roundView(state)), state);
  }
  return state;
}
test("seeded openings and complete shot histories reproduce positions, scores, scratches and results", () => {
  const initial = createRound("seeded", 1, () => 0.99);
  assert.deepEqual(validateRound(roundView(initial)), initial);
  const end = playOut(initial);
  assert.equal(end.game.phase, "finished");
  assert.deepEqual(end.game.shots, [5, 5]);
  assert.ok(end.game.pots.length > 0);
  const moving = apply(initial, "shot", shot);
  const displayed = structuredClone(moving.game);
  while (displayed.phase === "moving") advance(displayed, 1 / 60);
  assert.deepEqual(displayed.balls, settleRound(moving).game.balls);
});
test("wrong players, old rounds, duplicate shots and invalid vectors/placements are rejected without mutation", () => {
  const s = createRound("safe"),
    before = structuredClone(s);
  for (const [player, r] of [
    [1, request(s, "shot", shot)],
    [0, { ...request(s, "shot", shot), revision: 2 }],
    [0, { ...request(s, "shot", shot), matchId: "other" }],
    [0, { ...request(s, "shot", shot), roundId: 2 }],
    [0, request(s, "shot", { dx: NaN, dy: 1 })],
    [0, request(s, "shot", { dx: Infinity, dy: 1 })],
    [0, request(s, "shot", { dx: 1e8, dy: 1 })],
    [0, request(s, "shot", { dx: 0, dy: 0 })],
    [0, request(s, "place", { x: 360, y: 360 })],
    [0, request(s, "rematch")],
    [2, request(s, "shot", shot)],
  ])
    assert.equal(applyAction(s, player, r).ok, false);
  const moving = apply(s, "shot", shot);
  assert.equal(applyAction(moving, 0, request(moving, "shot", shot)).ok, false);
  assert.deepEqual(s, before);
});
test("scratch placement belongs to the next player and does not consume a shot", () => {
  const s = createRound("scratch", 1, () => 0.99);
  let scratched;
  for (let i = 0; i < 36; i++) {
    const angle = (i * Math.PI) / 18;
    const candidate = settleRound(
      apply(s, "shot", { dx: Math.cos(angle) * 132, dy: Math.sin(angle) * 132 }),
    );
    if (candidate.game.phase === "placing") {
      scratched = candidate;
      break;
    }
  }
  assert.ok(scratched, "fixture must scratch the cue");
  const spot = findCuePlacement(scratched.game);
  assert.equal(applyAction(scratched, 0, request(scratched, "place", spot)).ok, false);
  for (const pos of [
    { x: 0, y: 0 },
    scratched.game.pockets[0],
    scratched.game.balls.find((b) => b.active && b.kind === "color"),
  ])
    assert.equal(applyAction(scratched, 1, request(scratched, "place", pos)).ok, false);
  const next = apply(scratched, "place", spot);
  assert.deepEqual(next.game.shots, scratched.game.shots);
  assert.equal(next.game.phase, "aiming");
  assert.deepEqual(validateRound(roundView(next)), next);
});
test("wire views reject malformed, oversized, impossible and out-of-order histories", () => {
  const v = roundView(createRound("validation"));
  for (const bad of [
    null,
    { ...v, protocol: "poker" },
    { ...v, seed: -1 },
    { ...v, roundId: 0 },
    { ...v, rolling: true },
    { ...v, revision: 1 },
    { ...v, actions: Array(21).fill({ type: "shot", ...shot }) },
    { ...v, actions: [{ type: "place", x: 360, y: 360 }], revision: 1 },
    { ...v, rematch: [true, false], revision: 1 },
    { ...v, rematch: [true, true], revision: 2 },
  ])
    assert.equal(validateRound(bad), null);
});
test("both players must agree to a rematch; starter alternates and the table is freshly seeded", () => {
  const s = playOut(createRound("rematch", 1, () => 0.99));
  const voted = applyAction(s, 0, request(s, "rematch")).state;
  assert.equal(voted.roundId, 1);
  assert.deepEqual(validateRound(roundView(voted)), voted);
  assert.equal(applyAction(voted, 0, request(voted, "rematch")).ok, false);
  const next = applyAction(voted, 1, request(s, "rematch"), () => 0.25).state;
  assert.equal(next.roundId, 2);
  assert.equal(next.game.turn, 1);
  assert.deepEqual(next.game.shots, [0, 0]);
  assert.deepEqual(next.game.scores, [0, 0]);
  assert.notEqual(next.seed, s.seed);
  assert.deepEqual(validateRound(roundView(next)), next);
});
const tick = () => new Promise((resolve) => setImmediate(resolve));
function network() {
  const peers = [],
    intervals = new Set(),
    messages = [];
  let dropAction = false,
    dropState = false,
    dropSettled = false;
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
        if (message.type === "settled" && dropSettled) {
          dropSettled = false;
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
    dropSettled() {
      dropSettled = true;
    },
    retry() {
      for (const fn of intervals) fn();
    },
  };
}

async function pair(now = () => Date.now()) {
  const wire = network(),
    h = [],
    g = [],
    errors = [],
    statuses = [];
  const base = {
    roomCode: "HAMU-ABC234",
    now,
    sessionFactory: wire.factory,
    timers: wire.timers,
    random: () => 0.99,
    onError: (e) => errors.push(e.message),
  };
  const host = await createBilliardsMatch({ ...base, role: "host", onState: (s) => h.push(s) });
  const guest = await createBilliardsMatch({
    ...base,
    role: "guest",
    onState: (s) => g.push(s),
    onStatus: (s) => statuses.push(s),
  });
  await tick();
  return { wire, host, guest, h: () => h.at(-1), g: () => g.at(-1), errors, statuses };
}
test("two clients animate each shot once and wait for BOTH screens before handing over", async () => {
  const p = await pair();
  try {
    assert.deepEqual(p.h(), p.g());
    for (const peer of p.wire.peers) {
      assert.equal(peer.options.channelPrefix, "takumegu-billiards");
      assert.equal(peer.options.protocolVersion, PROTOCOL);
    }
    assert.equal(p.guest.submit("shot", shot), false);
    assert.ok(p.host.submit("shot", shot));
    assert.deepEqual(p.h(), p.g());
    assert.equal(p.h().game.phase, "moving");
    assert.ok(p.host.settled());
    assert.equal(p.h().game.phase, "moving");
    assert.equal(p.guest.submit("shot", shot), false);
    assert.ok(p.guest.settled());
    assert.notEqual(p.h().game.phase, "moving");
    assert.deepEqual(p.h(), p.g());
    while (p.h().game.phase !== "finished") {
      const client = p.h().game.turn === 0 ? p.host : p.guest;
      if (p.h().game.phase === "placing")
        assert.ok(client.submit("place", findCuePlacement(p.h().game)));
      assert.ok(client.submit("shot", shot));
      p.guest.settled();
      assert.equal(p.h().game.phase, "moving");
      p.host.settled();
      assert.deepEqual(p.h(), p.g());
    }
    assert.deepEqual(p.h().game.shots, [5, 5]);
    p.guest.submit("rematch");
    p.host.submit("rematch");
    assert.equal(p.h().roundId, 2);
    assert.equal(p.h().game.turn, 1);
    assert.deepEqual(p.h(), p.g());
  } finally {
    p.host.close();
    p.guest.close();
  }
  assert.equal(p.wire.intervals.size, 0);
});
test("lost shots, state acknowledgements and animation receipts retry without duplicate scoring", async () => {
  const p = await pair();
  try {
    p.wire.dropState();
    p.host.submit("shot", shot);
    assert.notEqual(p.h().revision, p.g().revision);
    p.wire.retry();
    assert.deepEqual(p.h(), p.g());
    p.host.settled();
    p.wire.dropSettled();
    p.guest.settled();
    assert.equal(p.h().game.phase, "moving");
    p.wire.dropState();
    p.wire.retry(); // final result is lost; guest repeats its receipt
    assert.notEqual(p.h().revision, p.g().revision);
    p.wire.retry();
    assert.deepEqual(p.h(), p.g());
    if (p.g().game.phase === "placing") p.guest.submit("place", findCuePlacement(p.g().game));
    p.wire.dropAction();
    assert.ok(p.guest.submit("shot", shot));
    assert.equal(p.guest.submit("shot", shot), false);
    p.wire.dropState();
    p.wire.retry();
    p.wire.retry();
    assert.deepEqual(p.h(), p.g());
    assert.deepEqual(p.h().game.shots, [1, 1]);
    const duplicate = p.wire.messages.find(
      (m) => m.message.type === "action" && m.message.action.type === "shot",
    ).message;
    p.wire.peers[0].options.onMessage(duplicate);
    assert.deepEqual(p.h().game.shots, [1, 1]);
    p.host.settled();
    p.guest.settled();
    assert.deepEqual(p.h(), p.g());
    assert.equal(p.statuses.at(-1), "connected");
  } finally {
    p.host.close();
    p.guest.close();
  }
});
test("disconnects and replacement peers freeze the match and release retry timers", async () => {
  const p = await pair();
  p.host.submit("shot", shot);
  p.wire.peers[0].options.onPeerChange(false, { previousPeerId: "seat-1" });
  assert.match(p.errors[0], /通信が切れた/);
  assert.equal(p.host.settled(), false);
  assert.equal(p.host.submit("shot", shot), false);
  p.guest.close();
  assert.equal(p.wire.intervals.size, 0);
});

test("old snapshots and old rolling receipts cannot rewind or unlock a later shot", async () => {
  const p = await pair();
  try {
    p.host.submit("shot", shot);
    const staleState = structuredClone(
      p.wire.messages.find((m) => m.message.type === "state").message,
    );
    const staleReceipt = {
      protocol: PROTOCOL,
      type: "settled",
      matchId: p.h().matchId,
      roundId: p.h().roundId,
      revision: p.h().revision,
    };
    p.host.settled();
    p.guest.settled();
    if (p.g().game.phase === "placing") p.guest.submit("place", findCuePlacement(p.g().game));
    p.guest.submit("shot", shot);
    p.wire.peers[1].options.onMessage(staleState);
    assert.deepEqual(p.h(), p.g());
    p.wire.peers[0].options.onMessage(staleReceipt);
    p.host.settled();
    assert.equal(p.h().game.phase, "moving");
    p.guest.settled();
    assert.notEqual(p.h().game.phase, "moving");
    assert.deepEqual(p.h(), p.g());
  } finally {
    p.host.close();
    p.guest.close();
  }
});
test("unanswered submissions time out and release the pending input lock safely", async () => {
  let clock = 0;
  const p = await pair(() => clock);
  try {
    p.host.submit("shot", shot);
    p.host.settled();
    p.guest.settled();
    if (p.g().game.phase === "placing") p.guest.submit("place", findCuePlacement(p.g().game));
    p.wire.dropAction();
    p.guest.submit("shot", shot);
    clock = 16000;
    p.wire.retry();
    assert.match(p.errors[0], /返事が届かない/);
    assert.equal(p.guest.submit("shot", shot), false);
    assert.deepEqual(p.h().game.shots, [1, 0]);
  } finally {
    p.host.close();
    p.guest.close();
  }
  assert.equal(p.wire.intervals.size, 0);
});
