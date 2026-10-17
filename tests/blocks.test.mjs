import test from "node:test";
import assert from "node:assert/strict";
import {
  PIECES,
  ROTATIONS,
  createGame,
  randomBlocked,
  seededRandom,
  cellsFor,
  canPlace,
  legalMoves,
  hasLegalMove,
  play,
} from "../blocks/rules.js";
const move = (piece, rotation, x, y) => ({ piece, rotation, x, y });
import { completePacking } from "./blocks-fixtures.mjs";
test("blocks: each opening has 60 spaces, four distinct random black squares and seven pieces per player", () => {
  const openings = new Set();
  for (let seed = 0; seed < 200; seed++) {
    const state = createGame({ seed });
    assert.equal(state.board.length, 64);
    assert.equal(state.board.filter((v) => v === -1).length, 4);
    assert.equal(state.board.filter((v) => v === 0).length, 60);
    assert.deepEqual(state.hands, [PIECES, PIECES]);
    assert.notEqual(state.hands[0], state.hands[1]);
    assert.deepEqual(randomBlocked(seed), randomBlocked(seed));
    openings.add(randomBlocked(seed).join());
  }
  assert.ok(openings.size > 190);
});
test("blocks: seven connected tetrominoes have only unique rotations, without reflections", () => {
  assert.deepEqual(
    PIECES.map((p) => ROTATIONS[p].length),
    [2, 1, 4, 2, 2, 4, 4],
  );
  for (const piece of PIECES)
    for (const cells of ROTATIONS[piece]) {
      assert.equal(new Set(cells.map(String)).size, 4);
      const visited = new Set([String(cells[0])]);
      for (let pass = 0; pass < 4; pass++)
        for (const [x, y] of cells)
          if (
            [
              [x - 1, y],
              [x + 1, y],
              [x, y - 1],
              [x, y + 1],
            ].some((c) => visited.has(String(c)))
          )
            visited.add(String([x, y]));
      assert.equal(visited.size, 4);
    }
  for (const [a, b] of [
    ["S", "Z"],
    ["J", "L"],
  ])
    assert.equal(
      ROTATIONS[a].some((v) => ROTATIONS[b].some((w) => JSON.stringify(v) === JSON.stringify(w))),
      false,
    );
});
test("blocks: invalid openings and invalid, reflected or out-of-board moves are rejected", () => {
  for (const blocked of [
    [0, 0, 1, 2],
    [1, 2, 3],
    [-1, 1, 2, 3],
    [1, 2, 3, 64],
  ])
    assert.throws(() => createGame({ blocked }));
  const state = createGame({ blocked: [0, 1, 2, 3] });
  for (const action of [
    null,
    move("X", 0, 0, 2),
    move("I", 2, 0, 2),
    move("T", -1, 0, 2),
    move("I", 0, 6, 3),
    move("I", 1, 2, 6),
    move("I", 0, -1, 2),
    move("I", 0, 0.5, 2),
    move("I", 0, 0, 0),
    { ...move("J", 0, 0, 2), flip: true },
    { ...move("S", 0, 0, 2), mirror: true },
  ]) {
    assert.equal(canPlace(state, action), false);
    assert.equal(play(state, action).ok, false);
  }
});
test("blocks: a move consumes only its owner's piece and cannot overlap, repeat or play out of turn", () => {
  const state = createGame({ blocked: [60, 61, 62, 63] }),
    before = structuredClone(state);
  const a = move("I", 0, 0, 0);
  assert.equal(play(state, a, 1).ok, false);
  const next = play(state, a).state;
  assert.deepEqual(state, before);
  assert.equal(next.turn, 1);
  assert.equal(next.hands[0].includes("I"), false);
  assert.equal(next.hands[1].includes("I"), true);
  assert.equal(play(next, a).ok, false);
  const third = play(next, move("O", 0, 4, 0)).state;
  assert.equal(play(third, move("I", 0, 0, 3)).ok, false);
  assert.equal(third.board.filter((v) => v > 0).length, 8);
});
test("blocks: a rotated piece fits along the right and bottom edges", () => {
  const state = createGame({ blocked: [0, 1, 2, 3] });
  assert.equal(canPlace(state, move("I", 1, 7, 4)), true);
  assert.equal(canPlace(state, move("I", 0, 4, 7)), true);
  assert.deepEqual(cellsFor(move("I", 1, 7, 4)), [
    [7, 4],
    [7, 5],
    [7, 6],
    [7, 7],
  ]);
});
test("blocks: check every remaining shape and rotation before declaring a player stuck", () => {
  const state = createGame({ blocked: [60, 61, 62, 63] });
  state.board = Array.from({ length: 64 }, (_, i) => ([0, 1, 2, 9].includes(i) ? 0 : 1));
  state.hands = [["I", "T"], ["O"]];
  assert.equal(
    [...legalMoves(state)].some((a) => a.piece === "I"),
    false,
  );
  assert.equal(hasLegalMove(state), true);
  assert.equal(canPlace(state, move("T", 2, 0, 0)), true);
  const result = play(state, move("T", 2, 0, 0));
  assert.equal(result.state.reason, "blocked");
  assert.equal(result.state.winner, 0);
  assert.equal(play(result.state, move("O", 0, 4, 4)).ok, false);
});
for (const starter of [0, 1])
  test(`blocks: all 14 pieces fit with four spaces left; second player wins (starter ${starter})`, () => {
    let state = createGame({ blocked: [60, 61, 62, 63], starter });
    for (let i = 0; i < completePacking.length; i++) {
      const result = play(state, completePacking[i]);
      assert.ok(result.ok, `move ${i + 1}`);
      state = result.state;
      if (i < 13) assert.equal(state.status, "playing");
    }
    assert.equal(state.status, "won");
    assert.equal(state.reason, "all-placed");
    assert.equal(state.winner, 1 - starter);
    assert.deepEqual(state.hands, [[], []]);
    assert.equal(state.board.filter((v) => v === 0).length, 4);
    assert.equal(state.board.filter((v) => v === -1).length, 4);
  });
test("blocks: 100 seeded full games preserve inventories and finish with a valid automatic result", () => {
  for (let seed = 0; seed < 100; seed++) {
    let state = createGame({ seed, starter: seed % 2 });
    const random = seededRandom(seed + 99),
      blocked = randomBlocked(seed);
    while (state.status === "playing") {
      const options = [...legalMoves(state)];
      assert.ok(options.length);
      state = play(state, options[Math.floor(random() * options.length)]).state;
      assert.equal(state.board.filter((v) => v > 0).length, state.moves.length * 4);
      assert.equal(state.hands.flat().length + state.moves.length, 14);
      assert.ok(blocked.every((i) => state.board[i] === -1));
      assert.ok(state.moves.length <= 14);
    }
    assert.equal(state.winner, state.reason === "all-placed" ? 1 - state.starter : 1 - state.turn);
    if (state.reason === "blocked")
      assert.equal(hasLegalMove({ ...state, status: "playing" }), false);
  }
});
