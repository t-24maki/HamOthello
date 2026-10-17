import test from "node:test";
import assert from "node:assert/strict";
import {
  createRound,
  applyAction,
  roundView,
  validateRound,
  ownerForPlayer,
  PROTOCOL,
} from "../shogi/online-rules.js";
import { createShogiMatch } from "../shogi/online.js";
import { positionKey } from "../shogi/rules.js";
const move = (from, to) => ({ kind: "move", from, to });
const request = (s, type, action) => ({
  type,
  action,
  matchId: s.matchId,
  roundId: s.roundId,
  revision: s.revision,
});
function step(s, action) {
  const result = applyAction(s, s.game.turn, request(s, "play", action));
  assert.ok(result.ok, result.message);
  return result.state;
}

test("online shogi replays promotion, captures, hands and drops with identical history", () => {
  let s = createRound("test", 1, () => 0.99); // king 12, taku 13, megu 14, ham 15, tapi 11
  for (const a of [move(11, 7), move(4, 8), move(7, 3)]) {
    s = step(s, a);
    const restored = validateRound(structuredClone(roundView(s)));
    assert.deepEqual(restored, s);
  }
  assert.equal(s.game.status, "won");
  assert.equal(s.game.winner, 0);
  assert.equal(s.game.board[3].promoted, true);
});
test("online repetition keeps rollback, history and restrictions in sync", () => {
  let s = createRound("repeat", 1, () => 0.99);
  for (let i = 0; i < 3; i++)
    for (const a of [move(12, 8), move(3, 7), move(8, 12), move(7, 3)]) s = step(s, a);
  assert.equal(s.event.type, "repetition");
  assert.equal(s.event.offender, 0);
  assert.equal(s.event.rewound, 1);
  assert.equal(s.revision, 12);
  assert.equal(s.game.moves.length, 10);
  assert.deepEqual(validateRound(roundView(s)), s);
  const rejected = step(s, move(8, 12));
  assert.equal(rejected.game.moves.length, 10);
  assert.deepEqual(validateRound(roundView(rejected)), rejected);
  const changed = step(rejected, move(8, 9));
  assert.equal(changed.game.restriction, null);
  assert.deepEqual(validateRound(roundView(changed)), changed);
});
test("invalid, stale, duplicate and wrong-player requests cannot change a round", () => {
  const s = createRound("test", 1, () => 0.99),
    before = structuredClone(s);
  for (const [player, r] of [
    [1, request(s, "play", move(11, 7))],
    [0, { ...request(s, "play", move(11, 7)), revision: 1 }],
    [0, request(s, "play", { kind: "drop", type: "king", to: 5 })],
    [0, request(s, "play", move(11, 100))],
    [0, { ...request(s, "play", move(11, 7)), matchId: "wrong" }],
    [0, request(s, "rematch")],
  ])
    assert.equal(applyAction(s, player, r).ok, false);
  const r = request(s, "play", move(11, 7)),
    next = applyAction(s, 0, r).state;
  assert.equal(applyAction(next, 0, r).ok, false);
  assert.deepEqual(s, before);
});
test("snapshots reject invented moves, opening positions and protocol mismatches", () => {
  const s = createRound("test", 1, () => 0.99),
    v = roundView(s);
  const badOpening = structuredClone(v);
  badOpening.opening[12].type = "tapi";
  for (const bad of [
    null,
    { ...v, protocol: "poker" },
    badOpening,
    { ...v, actions: [move(12, 0)], revision: 1 },
    { ...v, rematch: [true, false], revision: 1 },
    { ...v, revision: 4 },
  ])
    assert.equal(validateRound(bad), null);
});
test("rematch needs two votes and swaps the players sides without changing the normal opening turn", () => {
  let s = createRound("test", 1, () => 0.99);
  for (const a of [move(11, 7), move(4, 8), move(7, 3)]) s = step(s, a);
  const old = s;
  s = applyAction(s, 0, request(s, "rematch")).state;
  assert.equal(s.roundId, 1);
  assert.equal(s.game.status, "won");
  assert.deepEqual(validateRound(roundView(s)), s);
  s = applyAction(s, 1, request(old, "rematch"), () => 0.99).state;
  assert.equal(s.roundId, 2);
  assert.equal(ownerForPlayer(s, 0), 1);
  assert.equal(ownerForPlayer(s, 1), 0);
  assert.equal(s.game.turn, 0);
  assert.deepEqual(validateRound(roundView(s)), s);
  assert.equal(applyAction(s, 0, request(s, "play", move(11, 7))).ok, false);
  assert.equal(applyAction(s, 1, request(s, "play", move(11, 7))).ok, true);
});

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
  const host = await createShogiMatch({
    ...base,
    ...options,
    role: "host",
    onState: (s) => h.push(s),
  });
  const guest = await createShogiMatch({
    ...base,
    role: "guest",
    onState: (s) => g.push(s),
    onStatus: (s) => states.push(s),
  });
  await tick();
  return { wire, host, guest, h: () => h.at(-1), g: () => g.at(-1), errors, states };
}
test("two clients share moves, recover lost packets and acknowledgements without duplicate moves", async () => {
  const p = await pair();
  try {
    assert.deepEqual(p.h(), p.g());
    for (const peer of p.wire.peers) {
      assert.equal(peer.options.channelPrefix, "takumegu-shogi");
      assert.equal(peer.options.protocolVersion, PROTOCOL);
    }
    p.wire.dropState();
    assert.ok(p.host.submit("play", move(11, 7)));
    assert.notEqual(p.h().revision, p.g().revision);
    p.wire.retry();
    assert.deepEqual(p.h(), p.g());
    p.wire.dropAction();
    assert.ok(p.guest.submit("play", move(4, 8)));
    assert.equal(p.guest.submit("play", move(4, 8)), false);
    p.wire.dropState();
    p.wire.retry();
    assert.equal(p.h().revision, 2);
    assert.equal(p.g().revision, 1);
    p.wire.retry();
    assert.deepEqual(p.h(), p.g());
    assert.equal(p.h().game.moves.length, 2);
    assert.equal(p.states.at(-1), "connected");
    const duplicate = p.wire.messages.find((m) => m.message.type === "action").message;
    p.wire.peers[0].options.onMessage(duplicate);
    assert.equal(p.h().revision, 2);
    p.host.submit("play", move(7, 3));
    assert.equal(p.h().game.status, "won");
    assert.deepEqual(p.h(), p.g());
    p.guest.submit("rematch");
    p.host.submit("rematch");
    assert.equal(p.h().roundId, 2);
    assert.deepEqual(p.h(), p.g());
    assert.equal(p.host.submit("play", move(11, 7)), false);
    assert.equal(p.guest.submit("play", move(11, 7)), true);
    assert.deepEqual(p.h(), p.g());
  } finally {
    p.host.close();
    p.guest.close();
  }
  assert.equal(p.wire.intervals.size, 0);
});
test("both network clients apply repetition rewind and the banned retry exactly once", async () => {
  const p = await pair();
  try {
    for (let i = 0; i < 3; i++)
      for (const [client, a] of [
        [p.host, move(12, 8)],
        [p.guest, move(3, 7)],
        [p.host, move(8, 12)],
        [p.guest, move(7, 3)],
      ])
        assert.ok(client.submit("play", a));
    assert.equal(p.h().game.turn, 0);
    assert.equal(p.h().event.type, "repetition");
    assert.deepEqual(p.h(), p.g());
    assert.ok(p.host.submit("play", move(8, 9)));
    assert.deepEqual(p.h(), p.g());
    assert.equal(positionKey(p.h().game), positionKey(p.g().game));
  } finally {
    p.host.close();
    p.guest.close();
  }
});
test("disconnect and unexpected peer changes freeze input and stop retries", async () => {
  const p = await pair();
  p.wire.peers[0].options.onPeerChange(false, { previousPeerId: "seat-1" });
  assert.match(p.errors[0], /通信が切れた/);
  assert.equal(p.host.submit("play", move(11, 7)), false);
  p.guest.close();
  assert.equal(p.wire.intervals.size, 0);
});

test("network replay preserves captured promoted pieces returning to normal hands and drops", () => {
  let s = createRound("hands", 1, () => 0.99);
  for (const action of [
    move(11, 7),
    move(4, 8),
    move(12, 9),
    move(8, 12),
    move(9, 5),
    move(12, 13),
    move(5, 1),
    move(13, 14),
    move(1, 2),
    move(14, 13),
    move(2, 6),
    move(13, 9),
    move(6, 9),
    move(3, 7),
  ]) {
    s = step(s, action);
    assert.deepEqual(validateRound(roundView(s)), s);
  }
  assert.equal(s.game.hands[0].tapi, 1);
  s = step(s, { kind: "drop", type: "tapi", to: 10 });
  assert.deepEqual(s.game.board[10], { owner: 0, type: "tapi", promoted: false });
  assert.equal(s.game.hands[0].tapi, 0);
  assert.deepEqual(validateRound(roundView(s)), s);
});

test("host-selected handicaps reach both clients and cannot change during the room", async () => {
  for (const hamlessPlayer of [0, 1]) {
    const p = await pair({ hamlessPlayer });
    try {
      assert.deepEqual(p.h(), p.g());
      assert.equal(p.g().hamlessPlayer, hamlessPlayer);
      assert.equal(p.g().game.board.filter((piece) => piece?.type === "ham").length, 1);
      const before = p.g();
      const different = createRound(before.matchId, 2, () => 0.99, 1 - hamlessPlayer);
      p.wire.peers[1].options.onMessage({
        protocol: PROTOCOL,
        type: "state",
        state: roundView(different),
      });
      assert.deepEqual(p.g(), before);
      assert.equal(p.h().game.turn, hamlessPlayer);
      const clients = [p.host, p.guest];
      const firstMove = hamlessPlayer === 0 ? move(11, 7) : move(4, 8);
      assert.equal(clients[1 - hamlessPlayer].submit("play", firstMove), false);
      assert.ok(clients[hamlessPlayer].submit("play", firstMove));
      assert.ok(
        clients[1 - hamlessPlayer].submit("play", hamlessPlayer === 0 ? move(4, 8) : move(11, 7)),
      );
      assert.ok(
        clients[hamlessPlayer].submit("play", hamlessPlayer === 0 ? move(7, 3) : move(8, 12)),
      );
      assert.deepEqual(p.h(), p.g());
      p.host.submit("rematch");
      p.guest.submit("rematch");
      assert.equal(p.g().roundId, 2);
      assert.equal(p.g().hamlessPlayer, hamlessPlayer);
      assert.equal(p.g().game.turn, ownerForPlayer(p.g(), hamlessPlayer));
      assert.deepEqual(p.h(), p.g());
      assert.ok(
        clients[hamlessPlayer].submit("play", hamlessPlayer === 0 ? move(4, 8) : move(11, 7)),
      );
      assert.deepEqual(p.h(), p.g());
    } finally {
      p.host.close();
      p.guest.close();
    }
  }
});
