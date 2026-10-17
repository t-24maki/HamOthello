import test from "node:test";
import assert from "node:assert/strict";
import { createPosition, createGame, play, inCheck, isRestricted } from "../shogi/rules.js";
import { availableActions, chooseMove } from "../shogi/cpu.js";
const move = (from, to) => ({ kind: "move", from, to });
function position(entries, turn = 0, hands) {
  const b = Array(16).fill(null);
  for (const [i, type, owner = 0, promoted = false] of entries) b[i] = { type, owner, promoted };
  return createPosition(b, turn, hands);
}
for (const difficulty of ["easy", "normal", "hard"])
  test(`CPU ${difficulty} captures the king immediately for either side, even when attacked`, () => {
    for (const owner of [0, 1]) {
      const s = position(
        [
          [12, "king", owner],
          [8, "taku", owner],
          [4, "king", 1 - owner],
          [13, "taku", 1 - owner],
        ],
        owner,
      );
      const before = JSON.stringify(s),
        action = chooseMove(s, difficulty);
      assert.deepEqual(action, move(8, 4));
      assert.equal(play(s, action).state.winner, owner);
      assert.equal(JSON.stringify(s), before);
    }
  });
test("CPU defends its king, uses promotion and can play from its hand", () => {
  const danger = position([
    [12, "king"],
    [13, "megu"],
    [3, "king", 1],
    [4, "taku", 1, true],
  ]);
  const safe = play(danger, chooseMove(danger, "normal", { maxMs: 2000 }));
  assert.ok(safe.ok);
  assert.equal(inCheck(safe.state, 0), false);
  const promotion = position([
    [15, "king"],
    [4, "tapi"],
    [3, "king", 1],
  ]);
  assert.deepEqual(chooseMove(promotion, "normal", { maxMs: 2000 }), move(4, 0));
  const drop = position(
    [
      [0, "king"],
      [1, "tapi"],
      [4, "tapi"],
      [5, "tapi"],
      [15, "king", 1],
    ],
    0,
    [{ taku: 1 }, {}],
  );
  const action = chooseMove(drop, "normal");
  assert.equal(action.kind, "drop");
  assert.ok(play(drop, action).ok);
});
test("CPU skips a banned repetition and never mutates the actual match while searching", () => {
  let s = position([
    [12, "king"],
    [3, "king", 1],
  ]);
  for (let i = 0; i < 3; i++)
    for (const action of [move(12, 8), move(3, 7), move(8, 12), move(7, 3)])
      s = play(s, action).state;
  assert.ok(s.restriction);
  const before = JSON.stringify(s),
    action = chooseMove(s, "normal");
  assert.equal(isRestricted(s, action), false);
  assert.ok(play(s, action).ok);
  assert.equal(JSON.stringify(s), before);
});
test("CPU always returns a playable move in seeded games and stops after a win", () => {
  for (const random of [() => 0.2, () => 0.8]) {
    let s = createGame(random);
    for (let ply = 0; ply < 60 && s.status === "playing"; ply++) {
      const action = chooseMove(s, "normal", { maxNodes: 350, maxMs: 200, now: () => 0 });
      if (!action) {
        assert.equal(availableActions(s).length, 0);
        break;
      }
      const result = play(s, action);
      assert.ok(result.ok || result.reason === "repetition");
      s = result.state;
    }
    if (s.status === "won") assert.equal(chooseMove(s), null);
  }
});
