import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  createPosition,
  moveTargets,
  dropTargets,
  inCheck,
  play,
  positionKey,
  TYPES,
} from "../shogi/rules.js";

const piece = (type, owner = 0, promoted = false) => ({ type, owner, promoted });
const move = (from, to) => ({ kind: "move", from, to });
const drop = (type, to) => ({ kind: "drop", type, to });
const sorted = (values) => [...values].sort((a, b) => a - b);
function position(entries, turn = 0, hands) {
  const board = Array(16).fill(null);
  for (const [index, type, owner = 0, promoted = false] of entries)
    board[index] = piece(type, owner, promoted);
  return createPosition(board, turn, hands);
}
function mustPlay(state, action) {
  const result = play(state, action);
  assert.equal(result.ok, true, JSON.stringify({ action, reason: result.reason }));
  return result.state;
}
function rng(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

test("random openings have five pieces per side in the requested rows and exact point symmetry", () => {
  const layouts = new Set(),
    tapiColumns = new Set();
  const random = rng(84521);
  for (let seed = 0; seed < 200; seed++) {
    const state = createGame(random);
    assert.equal(state.turn, 0);
    assert.equal(state.status, "playing");
    assert.equal(state.board.filter(Boolean).length, 10);
    for (let i = 0; i < 16; i++) {
      const p = state.board[i],
        opposite = state.board[15 - i];
      if (!p) assert.equal(opposite, null);
      else {
        assert.equal(opposite.owner, 1 - p.owner);
        assert.equal(opposite.type, p.type);
        assert.equal(p.promoted, false);
      }
    }
    assert.deepEqual(
      state.board
        .slice(12)
        .map((p) => p.type)
        .sort(),
      ["ham", "king", "megu", "taku"],
    );
    assert.equal(state.board.slice(8, 12).filter(Boolean).length, 1);
    assert.equal(state.board.slice(8, 12).find(Boolean).type, "tapi");
    assert.deepEqual(
      state.board
        .filter((p) => p?.owner === 0)
        .map((p) => p.type)
        .sort(),
      [...TYPES].sort(),
    );
    layouts.add(
      state.board
        .slice(12)
        .map((p) => p.type)
        .join(","),
    );
    tapiColumns.add(state.board.findIndex((p) => p?.owner === 0 && p.type === "tapi") % 4);
  }
  assert.ok(layouts.size > 12);
  assert.equal(tapiColumns.size, 4);
});

test("all five unpromoted moves match the spec; forward depends on the piece owner", () => {
  const expected = {
    king: [0, 1, 2, 4, 6, 8, 9, 10],
    taku: [1, 4, 6, 9],
    megu: [0, 2, 8, 10],
    ham: [0, 2, 9],
    tapi: [1],
  };
  for (const type of TYPES) {
    assert.deepEqual(sorted(moveTargets(position([[5, type]]), 5)), expected[type]);
    const rotated = position([[10, type, 1]]);
    assert.deepEqual(sorted(moveTargets(rotated, 10)), sorted(expected[type].map((i) => 15 - i)));
  }
});

test("promoted taku and megu slide like rook and bishop; ham excludes both horizontal steps; tapi slides like queen", () => {
  const expected = {
    taku: [1, 4, 6, 7, 9, 13],
    megu: [0, 2, 8, 10, 15],
    ham: [0, 1, 2, 8, 9, 10],
    tapi: [0, 1, 2, 4, 6, 7, 8, 9, 10, 13, 15],
  };
  for (const [type, targets] of Object.entries(expected)) {
    assert.deepEqual(sorted(moveTargets(position([[5, type, 0, true]]), 5)), targets);
    assert.deepEqual(
      sorted(moveTargets(position([[10, type, 1, true]]), 10)),
      sorted(targets.map((i) => 15 - i)),
    );
  }
});

test("sliders cannot jump own pieces or captured enemies; diagonal moves never wrap rows", () => {
  const state = position([
    [5, "tapi", 0, true],
    [6, "ham", 0],
    [9, "ham", 1],
    [10, "ham", 1],
  ]);
  const targets = moveTargets(state, 5);
  assert.ok(!targets.includes(6) && !targets.includes(7));
  assert.ok(targets.includes(9) && !targets.includes(13));
  assert.ok(targets.includes(10) && !targets.includes(15));
  assert.deepEqual(sorted(moveTargets(position([[3, "king"]]), 3)), [2, 6, 7]);
});

test("each non-king promotes automatically on moving to the last rank for either side", () => {
  for (const owner of [0, 1])
    for (const type of ["taku", "megu", "ham", "tapi"]) {
      const from = ["megu", "ham"].includes(type) ? 5 : 4;
      const start = owner === 0 ? from : 15 - from,
        end = owner === 0 ? 0 : 15;
      const state = mustPlay(position([[start, type, owner]], owner), move(start, end));
      assert.equal(state.board[end].promoted, true);
      assert.equal(state.lastMove.newlyPromoted, true);
    }
  const king = mustPlay(position([[4, "king"]]), move(4, 0));
  assert.equal(king.board[0].promoted, false);
  assert.equal(mustPlay(position([[8, "tapi"]]), move(8, 4)).board[4].promoted, false);
});

test("a captured promoted piece becomes an unpromoted hand piece, changes owner on drop and uses new forward", () => {
  let state = position([
    [9, "taku", 0],
    [5, "tapi", 1, true],
    [3, "king", 1],
    [15, "king", 0],
  ]);
  state = mustPlay(state, move(9, 5));
  assert.equal(state.hands[0].tapi, 1);
  state = mustPlay(state, move(3, 2));
  state = mustPlay(state, drop("tapi", 8));
  assert.deepEqual(state.board[8], piece("tapi", 0));
  assert.equal(state.hands[0].tapi, 0);
  assert.deepEqual(moveTargets(state, 8), [4]);
});

test("multiple same-file tapi, last-rank drops and self-check are all allowed", () => {
  const state = position(
    [
      [8, "tapi"],
      [15, "king"],
      [3, "taku", 1, true],
      [0, "king", 1],
    ],
    0,
    [{ tapi: 2 }, {}],
  );
  assert.ok(inCheck(state, 0));
  const dropped = mustPlay(state, drop("tapi", 4));
  assert.equal(dropped.board[4].type, "tapi");
  assert.equal(inCheck(dropped, 0), true);
  const far = mustPlay(state, drop("tapi", 2));
  assert.equal(far.board[2].promoted, false);
  assert.deepEqual(moveTargets(far, 2), []);
});

test("king is captured to end play, not check or a attacked king move; no play after victory", () => {
  const initial = position([
    [15, "king"],
    [0, "king", 1],
    [3, "taku", 1, true],
  ]);
  assert.equal(inCheck(initial, 0), true);
  assert.equal(initial.status, "playing");
  let state = mustPlay(initial, move(15, 11)); // A king may remain on an attacked line.
  assert.equal(state.status, "playing");
  state = mustPlay(state, move(3, 11));
  assert.equal(state.winner, 1);
  assert.equal(state.status, "won");
  assert.equal(
    state.board.some((p) => p?.type === "king" && p.owner === 0),
    false,
  );
  assert.equal(Object.hasOwn(state.hands[1], "king"), false);
  assert.equal(play(state, move(0, 1)).ok, false);
});

test("invalid moves and drops are non-mutating; opponent pieces and occupied squares cannot be selected as sources/drops", () => {
  const state = createGame(rng(6)),
    before = structuredClone(state);
  for (const action of [
    move(0, 4),
    move(12, 0),
    move(-1, 5),
    move(12, 50),
    drop("king", 6),
    drop("tapi", 6),
    null,
  ]) {
    assert.equal(play(state, action).ok, false);
    assert.deepEqual(state, before);
  }
  const pocket = position([[5, "ham"]], 0, [{ tapi: 1 }, {}]);
  assert.equal(play(pocket, drop("tapi", 5)).ok, false);
  assert.equal(dropTargets(pocket, "tapi").length, 15);
});

test("position identity includes side to move, pockets, owner and promotion", () => {
  const state = createGame(rng(2)),
    key = positionKey(state);
  for (const mutate of [
    (s) => {
      s.turn = 1;
    },
    (s) => {
      s.hands[0].ham++;
    },
    (s) => {
      s.board[12].promoted = true;
    },
    (s) => {
      s.board[12].owner = 1;
    },
  ]) {
    const copy = structuredClone(state);
    mutate(copy);
    assert.notEqual(positionKey(copy), key);
  }
});

function repeatCycle(state, actions) {
  for (let cycle = 0; cycle < 3; cycle++)
    for (let i = 0; i < actions.length; i++) {
      const before = structuredClone(state),
        result = play(state, actions[i]);
      assert.deepEqual(state, before, "transition does not mutate its input");
      if (cycle === 2 && i === actions.length - 1) return result;
      assert.equal(result.ok, true, `cycle ${cycle}, step ${i}`);
      state = result.state;
    }
}

test("non-checking fourth repetition rewinds to sente, even if gote closed the cycle; repeated attempt is blocked until a different choice", () => {
  const initial = position([
    [15, "king"],
    [0, "king", 1],
  ]);
  const result = repeatCycle(initial, [move(15, 14), move(0, 1), move(14, 15), move(1, 0)]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "repetition");
  assert.equal(result.offender, 0);
  assert.equal(result.continuous, false);
  assert.equal(result.rewound, 1);
  assert.equal(result.state.turn, 0);
  assert.equal(result.state.moves.length, 10);
  assert.equal(result.state.board[14].type, "king");
  assert.equal(result.state.board[1].owner, 1);
  assert.equal(result.state.status, "playing");
  assert.equal(result.state.winner, null);
  const rejectedAgain = play(result.state, move(14, 15));
  assert.equal(rejectedAgain.ok, false);
  assert.deepEqual(rejectedAgain.state, result.state);
  const different = mustPlay(result.state, move(14, 10));
  assert.equal(different.turn, 1);
  assert.equal(different.restriction, null);
});

test("non-checking repetition completed by sente rejects sente’s current move without rewinding the opponent", () => {
  const result = repeatCycle(
    mustPlay(
      position([
        [11, "king"],
        [0, "king", 1],
      ]),
      move(11, 15),
    ),
    [move(0, 1), move(15, 14), move(1, 0), move(14, 15)],
  );
  assert.equal(result.offender, 0);
  assert.equal(result.rewound, 0);
  assert.equal(result.state.turn, 0);
  assert.equal(result.state.moves.length, 12);
});

test("continuous checking by sente forces the checking move to change, not the fleeing reply", () => {
  const result = repeatCycle(
    position([
      [15, "king"],
      [0, "king", 1],
      [9, "taku", 0, true],
    ]),
    [move(9, 8), move(0, 1), move(8, 9), move(1, 0)],
  );
  assert.equal(result.continuous, true);
  assert.equal(result.offender, 0);
  assert.equal(result.rewound, 1);
  assert.equal(result.state.board[8].type, "taku");
  assert.equal(result.state.turn, 0);
  assert.equal(play(result.state, move(8, 9)).reason, "repetition");
});

test("continuous checking by gote takes priority over the normal sente rule (whether gote or sente closes the cycle)", () => {
  let result = repeatCycle(
    position([
      [12, "king"],
      [3, "king", 1],
      [4, "taku", 1, true],
    ]),
    [move(12, 13), move(4, 5), move(13, 12), move(5, 4)],
  );
  assert.equal(result.continuous, true);
  assert.equal(result.offender, 1);
  assert.equal(result.rewound, 0);
  assert.equal(result.state.turn, 1);
  result = repeatCycle(
    position(
      [
        [13, "king"],
        [3, "king", 1],
        [4, "taku", 1, true],
      ],
      1,
    ),
    [move(4, 5), move(13, 12), move(5, 4), move(12, 13)],
  );
  assert.equal(result.continuous, true);
  assert.equal(result.offender, 1);
  assert.equal(result.rewound, 1);
  assert.equal(result.state.turn, 1);
  assert.equal(result.state.winner, null);
});
