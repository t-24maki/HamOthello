import test from "node:test";
import assert from "node:assert/strict";
import { ChipPlacements } from "../roulette/placements.js";
import { placedChipPoint, chipsMarkup } from "../roulette/board.js";
import { createRound, applyAction, stake } from "../roulette/rules.js";

const bet = (id, amount = 1) => ({ id, amount });
test("opponents place their stacks in screen order; only landed coins reduce their displayed bank", () => {
  const bets = [null, [bet("red", 3)], [bet("n1"), bet("n6", 2)], [bet("edge2")]];
  const presentation = new ChipPlacements(0);
  presentation.sync(bets);
  assert.deepEqual(
    presentation.queue.map((b) => b.player),
    [2, 2, 1, 3],
  );
  assert.deepEqual(presentation.bets, [null, [], [], []]);
  assert.equal(presentation.advance(499), false);
  assert.equal(10 - stake(presentation.bets[2]), 10);
  assert.equal(presentation.advance(1), true);
  assert.deepEqual(presentation.bets[2], [bet("n1")]);
  assert.equal(10 - stake(presentation.bets[2]), 9);
  assert.equal(presentation.pending(2), true);
  presentation.advance(500);
  assert.equal(presentation.pending(2), false);
  assert.equal(presentation.active.player, 1);
  presentation.advance(1000);
  assert.equal(presentation.active, null);
  assert.deepEqual(presentation.bets, bets);
});

test("a late online bet queues behind CPU stacks, without replaying committed bets or touching own draft", () => {
  const presentation = new ChipPlacements(1);
  const bets = [null, null, [bet("black", 4)], [bet("n0")]];
  presentation.sync(bets);
  presentation.advance(250);
  const progress = presentation.progress;
  bets[0] = [bet("n1"), bet("n2")];
  bets[1] = [bet("n0", 2)];
  presentation.sync(bets);
  presentation.sync(bets);
  assert.equal(presentation.progress, progress);
  assert.deepEqual(
    presentation.queue.map((b) => b.player),
    [2, 3, 0, 0],
  );
  presentation.advance(2000);
  assert.deepEqual(presentation.bets, [bets[0], null, bets[2], bets[3]]);
  presentation.sync(bets);
  assert.equal(presentation.active, null);
});

test("early confirmation leaves the result waiting until every known stack has landed", () => {
  const initial = createRound("early-confirm", 1, () => 0.3);
  const presentation = new ChipPlacements(0);
  presentation.sync(initial.bets);
  const result = applyAction(
    initial,
    0,
    {
      type: "bet",
      bets: [bet("red")],
      matchId: initial.matchId,
      roundId: initial.roundId,
    },
    () => 0.2,
  );
  assert.equal(result.phase, "result");
  const length = presentation.queue.length;
  presentation.sync(result.bets);
  assert.equal(presentation.queue.length, length);
  assert.ok(presentation.active);
  presentation.advance(length * 500);
  assert.equal(presentation.active, null);
  assert.deepEqual(presentation.bets.slice(1), result.bets.slice(1));
});

test("menu/hidden pauses preserve progress, reduced motion settles without waiting for flight", () => {
  const presentation = new ChipPlacements(0);
  presentation.sync([null, [bet("red", 20)], [bet("n4")], [bet("n6")]]);
  presentation.advance(200);
  const progress = presentation.progress;
  presentation.advance(60000, { paused: true });
  assert.equal(presentation.progress, progress);
  assert.deepEqual(presentation.bets[2], []);
  presentation.advance(100, { reduced: true });
  assert.equal(presentation.active, null);
  assert.equal(stake(presentation.bets[1]), 20);
});

test("new rounds and rematches begin empty even when the same player repeats the same bet", () => {
  const bets = [null, [bet("red")], [bet("red")], [bet("red")]];
  const old = new ChipPlacements(0);
  old.sync(bets);
  old.advance(500);
  const next = new ChipPlacements(0);
  next.sync(bets);
  assert.deepEqual(next.bets, [null, [], [], []]);
  assert.equal(next.progress, 0);
  assert.equal(next.queue.length, 3);
  old.advance(5000);
  assert.deepEqual(next.bets, [null, [], [], []]);
});

test("flight destination equals the rendered chip position for all overlapping seats", () => {
  for (const id of ["n0", "n6", "edge6", "zero4", "trio6", "red", "black"]) {
    for (let count = 1; count <= 4; count++) {
      const bets = Array.from({ length: 4 }, (_, p) => (p < count ? [bet(id)] : []));
      for (let player = 0; player < count; player++) {
        const [x, y] = placedChipPoint(bets, player, id);
        assert.ok(
          chipsMarkup(bets).includes(
            `data-player="${player}" data-bet="${id}" transform="translate(${x} ${y})"`,
          ),
        );
      }
    }
  }
});
