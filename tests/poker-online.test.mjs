import test from "node:test";
import assert from "node:assert/strict";
import {
  createOnlineRound,
  applyOnlineAction,
  playerView,
  validView,
  POKER_PROTOCOL,
} from "../poker/online-rules.js";
import { createPokerMatch } from "../poker/online.js";
import { roundResult } from "../poker/rules.js";
const act = (s, type, indices) => ({ matchId: s.matchId, roundId: s.roundId, type, indices });
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("online snapshots disclose only the recipient hand until both players are ready", () => {
  let state = createOnlineRound("table");
  for (const player of [0, 1]) {
    const view = playerView(state, player);
    assert.ok(validView(view, player));
    assert.equal(view.hands[1 - player], null);
    assert.equal(view.hands[player].length, 3);
    assert.equal(Object.hasOwn(view, "deck"), false);
    assert.equal(Object.hasOwn(view, "discards"), false);
  }
  for (const player of [1, 0]) {
    state = applyOnlineAction(state, player, act(state, "exchange", [0, 1, 2]));
    state = applyOnlineAction(state, player, act(state, "ready"));
    if (player === 1) assert.equal(playerView(state, 1).hands[0], null);
  }
  const views = [playerView(state, 0), playerView(state, 1)];
  assert.deepEqual(views[0], views[1]);
  assert.ok(views.every((view, player) => validView(view, player)));
  assert.equal(state.deck.length, 15);
  assert.equal(new Set(state.hands.flat().map((card) => card.id)).size, 6);
  assert.equal(roundResult(views[0]).winner, roundResult(views[1]).winner);
});

test("one exchange and one ready per seat; stale, duplicate, malformed, or premature actions are rejected", () => {
  let state = createOnlineRound("table");
  assert.equal(applyOnlineAction(state, 0, act(state, "ready")), null);
  for (const indices of [[0, 0], [3], [0.5], ["0"], [0, 1, 2, 3], null])
    assert.equal(applyOnlineAction(state, 1, act(state, "exchange", indices)), null);
  assert.equal(applyOnlineAction(state, 2, act(state, "exchange", [])), null);
  assert.equal(
    applyOnlineAction(state, 0, { ...act(state, "exchange", []), matchId: "other" }),
    null,
  );
  state = applyOnlineAction(state, 0, act(state, "exchange", []));
  assert.equal(applyOnlineAction(state, 0, act(state, "exchange", [1])), null);
  state = applyOnlineAction(state, 0, act(state, "ready"));
  assert.equal(applyOnlineAction(state, 0, act(state, "ready")), null);
  assert.equal(state.phase, "choose");
  assert.equal(state.hands[0].length, 3);
  assert.equal(applyOnlineAction(state, 0, act(state, "rematch")), null);
});

test("guest snapshot validation rejects hidden-card leaks, impossible counts and inconsistent showdown state", () => {
  const view = playerView(createOnlineRound("table"), 1);
  const leak = structuredClone(view);
  leak.hands[0] = leak.hands[1];
  const badReady = structuredClone(view);
  badReady.ready[0] = true;
  for (const invalid of [
    leak,
    badReady,
    { ...view, protocol: "othello" },
    { ...view, deckCount: 0 },
    { ...view, discardCount: 4 },
    { ...view, phase: "result" },
    { ...view, hands: [null, []] },
    { ...view, revision: -1 },
  ])
    assert.equal(validView(invalid), false);
});

function network() {
  const entries = [],
    messages = [],
    intervals = new Set();
  let dropAction = false,
    dropView = false;
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
    const entry = { options, id: `seat-${entries.length}`, closed: false };
    entries.push(entry);
    if (entries.length === 2)
      queueMicrotask(() => {
        for (const item of entries) {
          item.options.onPeerChange(true, {
            peerId: entries.find((e) => e !== item).id,
            previousPeerId: null,
          });
          item.options.onReady();
        }
      });
    return {
      clientId: entry.id,
      async send(message) {
        messages.push({ from: options.role, message: structuredClone(message) });
        if (message.type === "action" && dropAction) {
          dropAction = false;
          return true;
        }
        if (message.type === "view" && dropView) {
          dropView = false;
          return true;
        }
        const peer = entries.find((item) => item !== entry && !item.closed);
        if (peer) peer.options.onMessage(structuredClone(message));
        return Boolean(peer);
      },
      async close() {
        entry.closed = true;
      },
    };
  };
  return {
    factory,
    timers,
    entries,
    messages,
    intervals,
    dropNextAction() {
      dropAction = true;
    },
    dropNextView() {
      dropView = true;
    },
    retry() {
      for (const fn of intervals) fn();
    },
  };
}
async function pair() {
  const wire = network(),
    hostViews = [],
    guestViews = [],
    errors = [];
  const base = {
    roomCode: "HAMU-ABC234",
    sessionFactory: wire.factory,
    timers: wire.timers,
    onError: (e) => errors.push(e.message),
  };
  const host = await createPokerMatch({ ...base, role: "host", onView: (v) => hostViews.push(v) });
  const guest = await createPokerMatch({
    ...base,
    role: "guest",
    onView: (v) => guestViews.push(v),
  });
  await tick();
  return {
    wire,
    host,
    guest,
    hostViews,
    guestViews,
    errors,
    h: () => hostViews.at(-1),
    g: () => guestViews.at(-1),
  };
}

test("two connected clients exchange independently, reveal together, and rematch only on mutual consent", async () => {
  const p = await pair();
  try {
    for (const { options } of p.wire.entries) {
      assert.equal(options.channelPrefix, "takumegu-mini-poker");
      assert.equal(options.protocolVersion, POKER_PROTOCOL);
    }
    assert.ok(validView(p.h(), 0));
    assert.ok(validView(p.g(), 1));
    assert.equal(p.guest.submit("ready"), false);
    assert.ok(p.guest.submit("exchange", [0, 2]));
    assert.ok(p.host.submit("exchange", []));
    assert.deepEqual(p.h().exchanges, [0, 2]);
    assert.deepEqual(p.h().exchanges, p.g().exchanges);
    assert.equal(p.guest.submit("exchange", []), false);
    assert.ok(p.guest.submit("ready"));
    assert.equal(p.g().hands[0], null);
    assert.ok(p.host.submit("ready"));
    assert.equal(p.h().phase, "result");
    assert.deepEqual(p.h(), p.g());
    const previous = p.h();
    assert.ok(p.host.submit("rematch"));
    assert.equal(p.h().roundId, previous.roundId);
    assert.ok(p.guest.submit("rematch"));
    assert.equal(p.h().roundId, previous.roundId + 1);
    assert.equal(p.g().roundId, p.h().roundId);
    assert.deepEqual(p.h().exchanges, [null, null]);
    assert.equal(p.g().hands[0], null);
    p.wire.entries[0].options.onMessage({
      protocol: POKER_PROTOCOL,
      type: "action",
      action: act(previous, "rematch"),
    });
    assert.equal(p.h().roundId, previous.roundId + 1);
  } finally {
    p.host.close();
    p.guest.close();
  }
  assert.equal(p.wire.intervals.size, 0);
});

test("lost requests and replies recover by retrying without drawing a second time or rolling back", async () => {
  const p = await pair();
  try {
    const first = structuredClone(p.g());
    p.wire.dropNextAction();
    assert.ok(p.guest.submit("exchange", [0, 1, 2]));
    assert.equal(p.guest.submit("exchange", [0]), false);
    assert.deepEqual(p.g(), first);
    p.wire.retry();
    assert.deepEqual(p.g().exchanges, [null, 3]);
    const committed = structuredClone(p.g());
    const action = p.wire.messages.find((m) => m.message.type === "action").message;
    p.wire.entries[0].options.onMessage(action);
    assert.deepEqual(p.g(), committed);
    p.wire.entries[1].options.onMessage({ protocol: POKER_PROTOCOL, type: "view", view: first });
    assert.deepEqual(p.g(), committed);
    p.wire.dropNextView();
    assert.ok(p.guest.submit("ready"));
    assert.equal(p.g().ready[1], false);
    p.wire.retry();
    assert.equal(p.g().ready[1], true);
    assert.deepEqual(p.g().hands, committed.hands);
    const hiddenSnapshots = p.wire.messages
      .filter((m) => m.message.type === "view")
      .map((m) => m.message.view);
    assert.ok(hiddenSnapshots.every((v) => v.hands[0] === null));
  } finally {
    p.host.close();
    p.guest.close();
  }
});

test("peer disconnection freezes the match and cleans up retries", async () => {
  const p = await pair();
  p.wire.entries[0].options.onPeerChange(false, { previousPeerId: "seat-1", peerId: null });
  assert.match(p.errors[0], /通信が切れた/);
  assert.equal(p.host.submit("exchange", [0]), false);
  assert.equal(p.wire.entries[0].closed, true);
  p.guest.close();
  assert.equal(p.wire.intervals.size, 0);
});
