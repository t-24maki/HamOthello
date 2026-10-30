import test from "node:test";
import assert from "node:assert/strict";
import {
  WHEEL,
  SPOTS,
  SPOT,
  validBets,
  payout,
  stake,
  createRound,
  applyAction,
  finished,
  ranking,
  cpuBets,
  visibleResults,
} from "../roulette/rules.js";
import {
  landingRotation,
  chipPoint,
  boardMarkup,
  chipsMarkup,
  wheelMarkup,
} from "../roulette/board.js";
const action = (s, type, bets) => ({ matchId: s.matchId, roundId: s.roundId, type, bets });
test("seven equiprobable pockets, one zero, red/black probability and all legal board adjacencies", () => {
  assert.deepEqual(WHEEL, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(SPOTS.length, 27);
  assert.equal(SPOT.n0.weight, 1);
  assert.equal(SPOT.red.weight, 3);
  assert.equal(SPOT.black.weight, 3);
  assert.deepEqual(SPOT.edge6.numbers, [6, 1]);
  assert.deepEqual(SPOT.trio6.numbers, [0, 6, 1]);
  for (const s of SPOTS) {
    assert.equal(s.weight, WHEEL.filter((n) => s.numbers.includes(n)).length);
    assert.equal(s.numbers.length, s.kind === "color" ? 3 : s.kind);
  }
});
for (const s of SPOTS)
  test(`payouts for ${s.id}: all 7 pockets and 1–10 coins`, () => {
    for (let amount = 1; amount <= 10; amount++)
      for (const n of WHEEL) {
        assert.equal(
          payout([{ id: s.id, amount }], n),
          s.numbers.includes(n) ? amount * (s.kind === 1 ? 6 : s.kind === 2 ? 3 : 2) : 0,
        );
      }
  });
test("integer returns add overlapping winning bets without rounding", () => {
  assert.equal(payout([{ id: "red", amount: 1 }], 1), 2);
  assert.equal(payout([{ id: "red", amount: 2 }], 1), 4);
  assert.equal(
    payout(
      [
        { id: "red", amount: 1 },
        { id: "trio1", amount: 1 },
      ],
      1,
    ),
    4,
  );
  assert.equal(
    payout(
      [
        { id: "zero1", amount: 1 },
        { id: "trio1", amount: 1 },
      ],
      0,
    ),
    5,
  );
  assert.equal(
    payout(
      [
        { id: "n0", amount: 1 },
        { id: "zero1", amount: 2 },
      ],
      0,
    ),
    12,
  );
});
test("all spots have the same 6/7 expected return; red+black+zero is no longer lossless", () => {
  for (const s of SPOTS) {
    assert.ok(Number.isInteger(s.multiplier));
    for (const amount of [1, 2, 7, 50]) {
      const returns = WHEEL.map((n) => payout([{ id: s.id, amount }], n));
      assert.equal(
        returns.reduce((sum, n) => sum + n, 0),
        6 * amount,
      );
    }
  }
  const cover = ["red", "black", "n0"].map((id) => ({ id, amount: 1 }));
  assert.equal(payout(cover, 1) - stake(cover), -1);
  assert.equal(payout(cover, 0) - stake(cover), 3);
});
test("empty, malformed, repeated, overspent and fractional stakes are rejected", () => {
  for (const b of [
    null,
    [],
    [{ id: "red", amount: 0 }],
    [{ id: "red", amount: -1 }],
    [{ id: "red", amount: 1.5 }],
    [{ id: "x", amount: 1 }],
    [{ id: "red", amount: 11 }],
    [
      { id: "red", amount: 1 },
      { id: "red", amount: 1 },
    ],
    [{ id: "__proto__", amount: 1 }],
    [null],
  ])
    assert.equal(validBets(b, 10), false);
  assert.ok(
    validBets(
      [
        { id: "n1", amount: 3 },
        { id: "black", amount: 7 },
      ],
      10,
    ),
  );
});
test("settlement deducts every stake once, returns including stake and changes no old state", () => {
  let s = createRound("local", 1, () => 0.1);
  assert.deepEqual(s.coins, [20, 20, 20, 20]);
  assert.deepEqual(s.bank, [20, 20, 20, 20]);
  const before = structuredClone(s);
  const a = action(s, "bet", [
    { id: "n1", amount: 2 },
    { id: "black", amount: 3 },
  ]);
  const n = applyAction(s, 0, a, () => 0.15);
  assert.deepEqual(s, before);
  assert.equal(n.coins[0], 27);
  assert.equal(n.pocket, 1);
  assert.equal(applyAction(n, 0, a), null);
  assert.equal(applyAction(s, 0, { ...a, roundId: 2 }), null);
});
test("only settled zero or above 50 ends game; exactly 50 continues; tie ranks match", () => {
  for (const [coins, phase, end] of [
    [[0, 10, 10, 10], "bet", false],
    [[0, 10, 10, 10], "result", true],
    [[50, 1, 2, 3], "result", false],
    [[51, 10, 10, 10], "result", true],
  ])
    assert.equal(finished({ coins, phase }), end);
  assert.deepEqual(
    ranking([15, 10, 15, 0]).map((r) => [r.player, r.rank]),
    [
      [0, 1],
      [2, 1],
      [1, 3],
      [3, 4],
    ],
  );
});
test("animation completes before next round; entire bankroll can still win after being placed", () => {
  let s = createRound("all-in", 1, () => 0.2);
  s = applyAction(s, 0, action(s, "bet", [{ id: "n1", amount: 20 }]), () => 0.15);
  assert.equal(s.coins[0], 120);
  assert.ok(finished(s));
  assert.equal(applyAction(s, 0, action(s, "rematch")), null);
  s = applyAction(s, 0, action(s, "seen"));
  s = applyAction(s, 0, action(s, "rematch"), () => 0.2);
  assert.deepEqual(s.coins, [20, 20, 20, 20]);
  assert.equal(s.roundId, 2);
  assert.equal(s.roundNumber, 1);
});
test("CPU never overspends, never uses a future outcome, and survives all bankrolls/characters", () => {
  for (let bank = 1; bank <= 50; bank++)
    for (const c of ["tak", "meg", "ham", "tapi"])
      for (const r of [0, 0.1, 0.4, 0.7, 0.999])
        assert.ok(
          validBets(
            cpuBets(bank, c, () => r),
            bank,
          ),
        );
});
test("all seven drawn pockets and wheel landing angles match the single-zero wheel", () => {
  const source = createRound("pockets", 1, () => 0.1);
  for (let i = 0; i < 7; i++) {
    for (const offset of [0.0001, 0.5, 0.9999]) {
      const s = applyAction(
        source,
        0,
        action(source, "bet", [{ id: "n0", amount: 1 }]),
        () => (i + offset) / 7,
      );
      assert.equal(s.pocket, i);
      assert.deepEqual(s.results, [i]);
    }
    const angle = landingRotation(i) + (i * 360) / 7;
    assert.ok(Math.abs(angle / 360 - Math.round(angle / 360)) < 1e-10);
    assert.ok(landingRotation(i) >= 360 * 6);
  }
  const markup = wheelMarkup();
  assert.equal((markup.match(/class="wheel-pocket"/g) ?? []).length, 7);
  const numbers = [...markup.matchAll(/class="wheel-number"[^>]*>(\d)<\/text>/g)].map((m) =>
    Number(m[1]),
  );
  assert.deepEqual(numbers, [0, 1, 2, 3, 4, 5, 6]);
  for (const s of SPOTS) assert.ok(chipPoint(s.id).every(Number.isFinite));
});
test("seeded full matches conserve settlement arithmetic, finish and restart cleanly", () => {
  for (let seed = 1; seed <= 100; seed++) {
    let value = seed;
    const rng = () => (value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    let s = createRound("sim" + seed, 1, rng),
      ended = false;
    for (let n = 0; n < 300; n++) {
      s = applyAction(s, 0, action(s, "bet", cpuBets(s.bank[0], s.characters[0], rng)), rng);
      assert.ok(s.coins.every(Number.isInteger));
      assert.ok(s.coins.every((n) => n >= 0));
      s.coins.forEach((coins, p) =>
        assert.equal(coins, s.bank[p] - stake(s.bets[p]) + payout(s.bets[p], WHEEL[s.pocket])),
      );
      ended = finished(s);
      s = applyAction(s, 0, action(s, "seen"), rng);
      if (ended) break;
      s = applyAction(s, 0, action(s, "next"), rng);
    }
    assert.ok(ended, `seed ${seed}`);
  }
});

test("all 27 betting targets are directly focusable; adjacent boundary hit areas do not overlap", () => {
  const markup = boardMarkup();
  const ids = [...markup.matchAll(/data-spot="([^"]+)" role="button" tabindex="0"/g)].map(
    (m) => m[1],
  );
  assert.deepEqual(new Set(ids), new Set(SPOTS.map((s) => s.id)));
  const hits = [...markup.matchAll(/class="hit" cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/g)].map((m) =>
    m.slice(1).map(Number),
  );
  assert.equal(hits.length, 18);
  for (let i = 0; i < hits.length; i++)
    for (let j = i + 1; j < hits.length; j++) {
      const a = hits[i],
        b = hits[j];
      assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) > a[2] + b[2], `targets ${i}/${j}`);
    }
});
test("four players on one spot retain their seat colors, separate positions and amounts", () => {
  const bets = [1, 2, 3, 4].map((amount) => [{ id: "trio6", amount }]);
  const markup = chipsMarkup(bets, 1);
  assert.equal((markup.match(/class="chip /g) ?? []).length, 4);
  assert.equal((markup.match(/own-chip/g) ?? []).length, 1);
  assert.equal(new Set([...markup.matchAll(/transform="([^"]+)"/g)].map((m) => m[1])).size, 4);
  for (let p = 0; p < 4; p++) {
    assert.ok(markup.includes(`data-player="${p}" data-bet="trio6"`));
    assert.ok(markup.includes(`>${p + 1}</text>`));
  }
  assert.equal((chipsMarkup([null, ...bets.slice(1)], 0).match(/class="chip /g) ?? []).length, 3);
  assert.equal((chipsMarkup(bets, 1, 0).match(/winning-chip/g) ?? []).length, 4);
  assert.equal((chipsMarkup(bets, 1, 2).match(/winning-chip/g) ?? []).length, 0);
  assert.equal(markup.includes("winning-chip"), false);
});

test("Tak spreads small bets over 1–3 distinct spots up to and including 20 coins", () => {
  for (let bank = 1; bank <= 20; bank++) {
    for (const roll of [0, 0.37, 0.999]) {
      const bets = cpuBets(bank, "tak", () => roll);
      assert.ok(bets.length >= 1 && bets.length <= Math.min(bank, 3));
      assert.equal(new Set(bets.map((b) => b.id)).size, bets.length);
      assert.ok(bets.every((b) => b.amount === 1 || b.amount === 2));
      assert.ok(validBets(bets, bank));
    }
  }
  assert.equal(cpuBets(20, "tak", () => 0.999).length, 3);
  assert.equal(stake(cpuBets(20, "tak", () => 0.999)), 6);
});
test("above 20 Tak aims past 50 with the widest affordable coverage and minimal stake", () => {
  for (let bank = 21; bank <= 50; bank++) {
    for (const roll of [0, 0.37, 0.999]) {
      const bets = cpuBets(bank, "tak", () => roll);
      assert.equal(bets.length, 1);
      const b = bets[0],
        spot = SPOT[b.id];
      assert.ok(bank - b.amount + payout(bets, spot.numbers[0]) > 50, `bank ${bank}`);
      if (b.amount > 1)
        assert.ok(
          bank - (b.amount - 1) + payout([{ ...b, amount: b.amount - 1 }], spot.numbers[0]) <= 50,
        );
      for (const broader of SPOTS.filter((s) => s.weight > spot.weight))
        assert.ok(payout([{ id: broader.id, amount: bank }], broader.numbers[0]) <= 50);
    }
  }
  for (const [bank, amount, weight] of [
    [21, 15, 2],
    [25, 13, 2],
    [26, 25, 3],
    [50, 1, 3],
  ]) {
    const b = cpuBets(bank, "tak", () => 0)[0];
    assert.equal(b.amount, amount);
    assert.equal(SPOT[b.id].weight, weight);
    if (weight === 3) assert.equal(b.id, "red");
    assert.equal(bank - amount + payout([b], SPOT[b.id].numbers[0]), 51);
  }
});
test("Meg prioritizes unseen numbers and diversifies 1–2 coins over 2–3 numbers", () => {
  for (const roll of [0, 0.4, 0.999]) {
    const results = [0, 0, 2, 4];
    const bets = cpuBets(10, "meg", () => roll, results);
    assert.ok(bets.length >= 2 && bets.length <= 3);
    assert.equal(new Set(bets.map((b) => b.id)).size, bets.length);
    for (const b of bets) {
      assert.equal(SPOT[b.id].kind, 1);
      assert.ok([1, 2].includes(b.amount));
      assert.ok(!results.includes(SPOT[b.id].numbers[0]));
    }
    const last = cpuBets(10, "meg", () => roll, [0, 1, 2, 3, 4, 5]);
    assert.equal(last[0].id, "n6");
    assert.ok(
      validBets(
        cpuBets(10, "meg", () => roll, [0, 1, 2, 3, 4, 5, 6]),
        10,
      ),
    );
  }
});
test("Ham wagers 3–5 coins on 1–2 separate spots, Tapi one coin on 1–4 separate spots", () => {
  for (let bank = 1; bank <= 50; bank++)
    for (const roll of [0, 0.4, 0.999]) {
      const ham = cpuBets(bank, "ham", () => roll);
      assert.ok(ham.length >= 1 && ham.length <= 2);
      assert.ok(validBets(ham, bank));
      for (const b of ham) assert.ok(b.amount >= Math.min(3, bank) && b.amount <= 5);
      if (bank < 6) assert.equal(ham.length, 1);
      const tapi = cpuBets(bank, "tapi", () => roll);
      assert.ok(tapi.length >= 1 && tapi.length <= Math.min(bank, 4));
      assert.ok(tapi.every((b) => b.amount === 1));
      assert.ok(validBets(tapi, bank));
    }
});
test("past results accumulate once, feed the next Meg decision and stay hidden during the spin", () => {
  let s = createRound("history", 1, () => 0.5);
  const before = structuredClone(s);
  s = applyAction(s, 0, action(s, "bet", [{ id: "n6", amount: 1 }]), () => 0);
  assert.deepEqual(before.results, []);
  assert.deepEqual(s.results, [0]);
  assert.deepEqual(visibleResults(s), []);
  assert.deepEqual(visibleResults(s, true), [0]);
  assert.equal(applyAction(s, 0, action(s, "bet", [{ id: "n6", amount: 1 }])), null);
  s = applyAction(s, 0, action(s, "seen"));
  s = applyAction(s, 0, action(s, "next"), () => 0);
  assert.deepEqual(s.results, [0]);
  assert.deepEqual(visibleResults(s), [0]);
  assert.ok(s.bets[1].every((b) => b.id !== "n0"));
  s = applyAction(s, 0, action(s, "bet", [{ id: "n6", amount: 1 }]), () => 0);
  assert.deepEqual(s.results, [0, 0]);
  assert.deepEqual(visibleResults(s), [0]);
  const shown = visibleResults(s, true);
  shown.push(6);
  assert.deepEqual(s.results, [0, 0]);
});
