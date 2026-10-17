import test from "node:test";
import assert from "node:assert/strict";
import {
  createDeck,
  evaluateHand,
  compareHands,
  createRound,
  revealHand,
  exchangeCards,
  continueRound,
  chooseCpuExchange,
  finishCpuTurn,
  roundResult,
} from "../poker/rules.js";

const card = (value, metal) => ({ id: `${metal}-${value}`, value, metal });
const hand = (...entries) => entries.map(([value, metal]) => card(value, metal));
const examples = [
  hand([1, "gold"], [4, "silver"], [8, "bronze"]),
  hand([4, "gold"], [4, "silver"], [9, "bronze"]),
  hand([2, "silver"], [5, "silver"], [8, "silver"]),
  hand([3, "gold"], [4, "silver"], [5, "bronze"]),
  hand([5, "gold"], [6, "gold"], [7, "gold"]),
  hand([7, "gold"], [7, "silver"], [7, "bronze"]),
];
const ids = (cards) => cards.map((c) => c.id);
function assertDeckPartition(round) {
  const all = [...round.hands.flat(), ...round.deck, ...round.discards];
  assert.equal(round.hands[0].length, 3);
  assert.equal(round.hands[1].length, 3);
  assert.equal(all.length, 27);
  assert.deepEqual(ids(all).sort(), ids(createDeck()).sort());
}
function randomFrom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

test("deck has exactly one of each 1–9 in each metal", () => {
  const deck = createDeck();
  assert.equal(deck.length, 27);
  assert.equal(new Set(ids(deck)).size, 27);
  for (const metal of ["gold", "silver", "bronze"]) {
    assert.deepEqual(
      deck.filter((c) => c.metal === metal).map((c) => c.value),
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
    );
  }
});

test("six roles have the requested order, with triple strongest", () => {
  assert.deepEqual(
    examples.map((h) => evaluateHand(h).name),
    ["役なし", "ワンペア", "フラッシュ", "ストレート", "ストレートフラッシュ", "スリーカード"],
  );
  for (let i = 0; i < examples.length; i++) {
    for (let j = 0; j < examples.length; j++)
      assert.equal(compareHands(examples[i], examples[j]), Math.sign(i - j));
  }
});

test("every possible three-card hand falls into the correct combinatorial role counts", () => {
  const deck = createDeck(),
    counts = [0, 0, 0, 0, 0, 0];
  for (let a = 0; a < 25; a++)
    for (let b = a + 1; b < 26; b++)
      for (let c = b + 1; c < 27; c++) {
        counts[evaluateHand([deck[a], deck[b], deck[c]]).rank]++;
      }
  // Counts derived from 27 choose 3, separating the 21 straight flushes.
  assert.deepEqual(counts, [1848, 648, 231, 168, 21, 9]);
});

test("pair rank comes before the single remaining card (8,8,1 beats 2,2,9)", () => {
  const highPair = hand([8, "silver"], [1, "gold"], [8, "bronze"]);
  const lowPair = hand([2, "gold"], [9, "gold"], [2, "silver"]);
  assert.equal(compareHands(highPair, lowPair), 1);
  const result = roundResult({ phase: "result", hands: [highPair, lowPair] });
  assert.equal(result.winner, 0);
  assert.match(result.reason, /ペアの数字の 8 と 2/);
});

test("same role uses largest number, then that number’s metal before other numbers", () => {
  const goldNine = hand([9, "gold"], [2, "bronze"], [4, "silver"]);
  const silverNine = hand([9, "silver"], [8, "gold"], [1, "bronze"]);
  const bronzeNine = hand([9, "bronze"], [7, "gold"], [2, "silver"]);
  assert.equal(compareHands(goldNine, silverNine), 1);
  assert.equal(compareHands(silverNine, bronzeNine), 1);
  assert.equal(compareHands(bronzeNine, hand([8, "gold"], [6, "silver"], [1, "gold"])), 1);
  assert.match(
    roundResult({ phase: "result", hands: [silverNine, goldNine] }).reason,
    /金・銀・銅/,
  );
});

test("numeric ties for straight and flush honor the highest card metal", () => {
  assert.equal(
    compareHands(
      hand([3, "bronze"], [4, "silver"], [5, "gold"]),
      hand([3, "gold"], [4, "bronze"], [5, "silver"]),
    ),
    1,
  );
  assert.equal(
    compareHands(
      hand([1, "gold"], [3, "gold"], [9, "gold"]),
      hand([6, "silver"], [7, "silver"], [9, "silver"]),
    ),
    1,
  );
});

test("straight has seven starts and cannot wrap around from 9 to 1", () => {
  for (let n = 1; n <= 7; n++)
    assert.equal(
      evaluateHand(hand([n, "gold"], [n + 1, "silver"], [n + 2, "bronze"])).name,
      "ストレート",
    );
  assert.equal(evaluateHand(hand([8, "gold"], [9, "silver"], [1, "bronze"])).name, "役なし");
  assert.equal(evaluateHand(hand([9, "gold"], [1, "gold"], [2, "gold"])).name, "フラッシュ");
});

test("hand order does not affect its role or comparison and is not mutated", () => {
  for (const h of examples) {
    const before = structuredClone(h);
    assert.equal(compareHands(h, [...h].reverse()), 0);
    assert.deepEqual(h, before);
  }
});

test("rejects invalid cards and duplicate physical cards", () => {
  for (const invalid of [
    [],
    [card(1, "gold")],
    hand([1, "gold"], [1, "gold"], [2, "gold"]),
    hand([0, "gold"], [4, "silver"], [9, "bronze"]),
    hand([1, "unknown"], [4, "silver"], [9, "bronze"]),
    [null, card(4, "silver"), card(9, "bronze")],
  ]) {
    assert.throws(() => evaluateHand(invalid));
  }
});

test("deal distributes six unique random cards, leaving 21 in the deck", () => {
  const a = createRound("cpu", randomFrom(11)),
    b = createRound("cpu", randomFrom(99));
  assertDeckPartition(a);
  assert.equal(a.deck.length, 21);
  assert.equal(a.phase, "choose");
  assert.equal(roundResult(a), null);
  assert.notDeepEqual(a.hands, b.hands);
  assert.throws(() => createRound("online"));
  for (const invalid of [-1, 1, NaN, Infinity])
    assert.throws(() => createRound("cpu", () => invalid));
});

test("0, 1, 2 or 3 cards can be exchanged once, without mutating the original round", () => {
  for (const indices of [[], [1], [2, 0], [0, 1, 2]]) {
    const round = createRound("cpu", randomFrom(54)),
      before = structuredClone(round);
    const next = exchangeCards(round, indices);
    assert.equal(next.phase, "review");
    assert.equal(next.exchanges[0], indices.length);
    assert.equal(next.deck.length, 21 - indices.length);
    assert.deepEqual(round, before);
    assertDeckPartition(next);
    for (let i = 0; i < 3; i++)
      assert.equal(next.hands[0][i].id === round.hands[0][i].id, !indices.includes(i));
    assert.deepEqual(next.hands[1], round.hands[1]);
    assert.equal(exchangeCards(next, []), null);
  }
});

test("invalid selections and out-of-turn actions cannot change the round", () => {
  const round = createRound("cpu", randomFrom(7)),
    before = structuredClone(round);
  for (const indices of [[0, 0], [-1], [3], [0.5], ["1"], [0, 1, 2, 3], null])
    assert.equal(exchangeCards(round, indices), null);
  assert.equal(continueRound(round), null);
  assert.equal(finishCpuTurn(round), null);
  assert.equal(revealHand(round), null);
  assert.deepEqual(round, before);
});

test("two-player round requires handoffs, lets each exchange once, and reveals result last", () => {
  let round = createRound("local", randomFrom(451));
  for (let player = 0; player < 2; player++) {
    assert.equal(round.phase, "handoff");
    assert.equal(round.active, player);
    assert.equal(exchangeCards(round, [0]), null);
    assert.equal(continueRound(round), null);
    assert.equal(roundResult(round), null);
    round = revealHand(round);
    assert.equal(revealHand(round), null);
    round = exchangeCards(round, [0, 1, 2]);
    assert.equal(roundResult(round), null);
    round = continueRound(round);
    assertDeckPartition(round);
  }
  assert.equal(round.phase, "result");
  assert.equal(round.deck.length, 15);
  assert.equal(round.discards.length, 6);
  assert.deepEqual(round.exchanges, [3, 3]);
  assert.notEqual(roundResult(round).winner, null);
  assert.equal(exchangeCards(round, [0]), null);
  assert.equal(continueRound(round), null);
});

test("discarded cards never return to either player in the same round", () => {
  for (let seed = 0; seed < 40; seed++) {
    let round = createRound("local", randomFrom(seed));
    const dealt = new Set(ids(round.hands.flat()));
    round = continueRound(exchangeCards(revealHand(round), [0, 1, 2]));
    round = continueRound(exchangeCards(revealHand(round), [0, 1, 2]));
    assertDeckPartition(round);
    assert.ok(round.hands.flat().every((c) => !dealt.has(c.id)));
  }
});

test("CPU keeps made strong roles, computes solely from its hand, and does not mutate it", () => {
  for (const h of [examples[4], examples[5]]) {
    const before = structuredClone(h);
    assert.deepEqual(chooseCpuExchange(h), []);
    assert.deepEqual(h, before);
  }
  const choices = chooseCpuExchange(examples[0]);
  assert.ok(choices.length > 0 && choices.length <= 3);
  assert.deepEqual(choices, chooseCpuExchange(structuredClone(examples[0])));
});

test("CPU completes one exchange and result; leaving or replaying cannot reuse the old round", () => {
  let round = createRound("cpu", randomFrom(239));
  round = continueRound(exchangeCards(round, [1, 2]));
  assert.equal(round.phase, "cpu");
  assert.equal(roundResult(round), null);
  assert.equal(continueRound(round), null);
  const before = structuredClone(round),
    final = finishCpuTurn(round);
  assert.deepEqual(round, before);
  assert.equal(final.phase, "result");
  assertDeckPartition(final);
  assert.equal(final.exchanges[0], 2);
  assert.ok(Number.isInteger(final.exchanges[1]));
  assert.ok(roundResult(final));
  assert.equal(finishCpuTurn(final), null);
  const replay = createRound("cpu", randomFrom(512));
  assert.deepEqual(replay.exchanges, [null, null]);
  assert.equal(replay.discards.length, 0);
  assert.equal(roundResult(replay), null);
});
