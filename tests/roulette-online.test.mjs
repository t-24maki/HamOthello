import test from "node:test";
import assert from "node:assert/strict";
import { createRouletteMatch } from "../roulette/online.js";
import {
  createRound,
  applyAction,
  playerView,
  validView,
  finished,
  PROTOCOL,
} from "../roulette/rules.js";
const tick = () => new Promise((resolve) => setImmediate(resolve));
const bet = [{ id: "n1", amount: 1 }];
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
async function pair(random = Math.random, characters = ["tak", "meg"]) {
  const wire = network(),
    hostViews = [],
    guestViews = [],
    errors = [],
    statuses = [];
  const base = {
    roomCode: "HAMU-ABC234",
    random,
    sessionFactory: wire.factory,
    timers: wire.timers,
    onError: (e) => errors.push(e.message),
    onStatus: (status) => statuses.push(status),
  };
  const host = await createRouletteMatch({
    ...base,
    role: "host",
    character: characters[0],
    onView: (v) => hostViews.push(v),
  });
  const guest = await createRouletteMatch({
    ...base,
    role: "guest",
    character: characters[1],
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
    statuses,
    h: () => hostViews.at(-1),
    g: () => guestViews.at(-1),
  };
}

test("two humans choose characters, commit bets, see the same result and mutually advance", async () => {
  const p = await pair(() => 0.5, ["tapi", "tapi"]);
  try {
    assert.deepEqual(p.h().characters, ["tapi", "tapi", "tak", "meg"]);
    assert.deepEqual(p.h().coins, [20, 20, 20, 20]);
    assert.deepEqual(p.g().coins, [20, 20, 20, 20]);
    assert.equal(p.wire.entries[0].options.channelPrefix, "takumegu-mini-roulette");
    assert.ok(validView(p.g()));
    assert.equal(p.host.submit("next"), false);
    assert.ok(p.guest.submit("bet", bet));
    assert.equal(p.h().phase, "bet");
    // Committed bets are public before the other human decides. CPU bets are
    // already public at round start; uncommitted local edits stay local.
    assert.deepEqual(p.h().bets[1], bet);
    assert.equal(p.h().bets[0], null);
    assert.deepEqual(p.h().bets.slice(2), p.g().bets.slice(2));
    assert.ok(p.host.submit("bet", bet));
    assert.equal(p.h().phase, "result");
    assert.deepEqual(p.h().results, [3]);
    assert.deepEqual(p.h(), p.g());
    assert.ok(validView(p.h()));
    assert.equal(p.host.submit("next"), false);
    p.host.submit("seen");
    assert.equal(p.host.submit("next"), false);
    p.guest.submit("seen");
    p.host.submit("next");
    assert.equal(p.h().roundId, 1);
    p.guest.submit("next");
    assert.equal(p.h().roundId, 2);
    assert.deepEqual(p.h().results, [3]);
    assert.deepEqual(p.h(), p.g());
    assert.equal(p.h().coins[0], 19);
    assert.deepEqual(p.errors, []);
  } finally {
    p.host.close();
    p.guest.close();
  }
  assert.equal(p.wire.intervals.size, 0);
});
test("lost bet/reply retries never duplicate stakes, spins or settlements; stale snapshots are rejected", async () => {
  const p = await pair(() => 0.9);
  try {
    const before = structuredClone(p.g());
    p.wire.dropNextAction();
    p.guest.submit("bet", bet);
    assert.deepEqual(p.g(), before);
    assert.equal(p.guest.submit("bet", bet), false);
    p.wire.retry();
    const committed = structuredClone(p.g());
    p.wire.entries[0].options.onMessage(
      p.wire.messages.find((m) => m.message.type === "action").message,
    );
    assert.deepEqual(p.g(), committed);
    p.wire.dropNextView();
    p.host.submit("bet", bet);
    const result = structuredClone(p.h());
    p.wire.retry();
    assert.deepEqual(p.h(), result);
    assert.deepEqual(p.g(), result);
    p.wire.entries[1].options.onMessage({ type: "view", protocol: PROTOCOL, view: before });
    assert.deepEqual(p.g(), result);
    p.wire.retry();
    assert.deepEqual(p.h(), result);
  } finally {
    p.host.close();
    p.guest.close();
  }
});
test("bust results require both animation acknowledgements and both rematch votes; ids never repeat", async () => {
  const p = await pair(() => 0.9);
  try {
    for (const client of [p.host, p.guest]) client.submit("bet", [{ id: "n1", amount: 20 }]);
    assert.ok(finished(p.h()));
    assert.deepEqual(p.g().coins.slice(0, 2), [0, 0]);
    assert.equal(p.host.submit("rematch"), false);
    p.host.submit("seen");
    p.guest.submit("seen");
    p.guest.submit("rematch");
    assert.equal(p.h().roundId, 1);
    p.host.submit("rematch");
    assert.equal(p.h().roundId, 2);
    assert.equal(p.h().roundNumber, 1);
    assert.deepEqual(p.h().coins, [20, 20, 20, 20]);
    assert.deepEqual(p.h().results, []);
    assert.deepEqual(p.h().characters, ["tak", "meg", "ham", "tapi"]);
    assert.ok(validView(p.g()));
  } finally {
    p.host.close();
    p.guest.close();
  }
});
test("disconnection, old protocol and invalid data cannot mutate a match", async () => {
  const p = await pair();
  const first = structuredClone(p.h());
  p.wire.entries[0].options.onMessage({
    protocol: "mini-roulette-20261030-3",
    type: "action",
    action: { type: "bet", bets: bet, matchId: first.matchId, roundId: 1 },
  });
  assert.deepEqual(p.h(), first);
  p.wire.entries[1].options.onMessage({
    protocol: PROTOCOL,
    type: "view",
    view: { ...first, coins: [999, 10, 10, 10] },
  });
  assert.deepEqual(p.g(), first);
  p.wire.entries[0].options.onPeerChange(false, { previousPeerId: "seat-1", peerId: null });
  assert.match(p.errors[0], /通信が切れた/);
  assert.equal(p.host.submit("bet", bet), false);
  p.guest.close();
  assert.equal(p.wire.intervals.size, 0);
});
test("routine synchronization does not redraw an uncommitted bet", async () => {
  const p = await pair();
  try {
    const lengths = [p.hostViews.length, p.guestViews.length, p.statuses.length];
    p.wire.retry();
    p.wire.retry();
    assert.deepEqual([p.hostViews.length, p.guestViews.length, p.statuses.length], lengths);
  } finally {
    p.host.close();
    p.guest.close();
  }
});
test("view validation rejects impossible balances, bets, prematurely revealed outcomes and acknowledgements", () => {
  const s = createRound("test", 1, () => 0.3, null, undefined, 2);
  for (const bad of [
    { ...s, coins: [9, 10, 10, 10] },
    { ...s, pocket: 0 },
    { ...s, bets: [[{ id: "bogus", amount: 1 }], ...s.bets.slice(1)] },
    { ...s, seen: [true, false] },
    { ...s, proceed: [true, false] },
    { ...s, characters: ["x", "meg", "ham", "tapi"] },
    { ...s, bank: [0, 10, 10, 10] },
    { ...s, protocol: "old" },
    { ...s, protocol: "mini-roulette-20261030-2" },
    { ...s, protocol: "mini-roulette-20261030-3" },
    { ...s, bets: [[{ id: "n7", amount: 1 }], ...s.bets.slice(1)] },
    { ...s, bets: [[{ id: "trio8", amount: 1 }], ...s.bets.slice(1)] },
    { ...s, results: [0] },
    { ...s, results: undefined },
  ])
    assert.equal(validView(bad), false);
  let result = s;
  for (const p of [0, 1])
    result = applyAction(
      result,
      p,
      { type: "bet", bets: bet, matchId: "test", roundId: 1 },
      () => 0,
    );
  assert.ok(validView(playerView(result)));
  assert.equal(validView({ ...result, results: [1] }), false);
  for (const n of [7, 8, 9]) {
    assert.equal(validView({ ...result, results: [n] }), false);
    assert.equal(validView({ ...result, pocket: n }), false);
  }
  assert.equal(validView({ ...result, coins: [...result.coins.slice(0, 3), 99] }), false);
});
