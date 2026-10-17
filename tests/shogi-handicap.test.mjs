import test from "node:test";
import assert from "node:assert/strict";
import { createGame, play, positionKey } from "../shogi/rules.js";
import { chooseMove } from "../shogi/cpu.js";
import {
  createRound,
  roundView,
  validateRound,
  ownerForPlayer,
  applyAction,
} from "../shogi/online-rules.js";
const rng = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const hamCount = (game) =>
  game.board.filter((p) => p?.type === "ham").length + game.hands[0].ham + game.hands[1].ham;

test("handicap removes exactly the chosen side's meat ham, without moving other pieces or adding to hands", () => {
  for (let seed = 0; seed < 100; seed++) {
    const even = createGame(rng(seed));
    for (const owner of [0, 1]) {
      const game = createGame(rng(seed), owner);
      const removed = even.board.findIndex((p) => p?.type === "ham" && p.owner === owner);
      const expected = structuredClone(even.board);
      expected[removed] = null;
      assert.deepEqual(game.board, expected);
      assert.deepEqual(game.hands, even.hands);
      assert.equal(game.turn, owner);
      assert.equal(game.history[0].turn, owner);
      assert.equal(hamCount(game), 1);
      assert.deepEqual(game.history[0].board, game.board);
      assert.equal(game.history[0].key, positionKey(game));
      assert.equal(
        game.board.filter((p) => p && ["king", "taku", "megu"].includes(p.type)).length,
        6,
      );
    }
  }
});

test("all shogi CPU levels make legal moves with either handicap and preserve the missing material", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    for (const owner of [0, 1]) {
      let game = createGame(rng(11), owner);
      for (let i = 0; i < 16 && game.status === "playing"; i++) {
        const action = chooseMove(game, difficulty, { maxNodes: 800, maxMs: Infinity });
        const result = play(game, action);
        assert.ok(result.ok || result.reason === "repetition");
        game = result.state;
        assert.equal(hamCount(game), 1);
      }
    }
  }
});

test("wire validation accepts every handicap on either round and rejects the wrong missing piece or side", () => {
  for (const hamlessPlayer of [null, 0, 1]) {
    for (const roundId of [1, 2]) {
      const round = createRound("handicap", roundId, rng(4), hamlessPlayer);
      assert.deepEqual(validateRound(roundView(round)), round);
      assert.equal(
        round.game.turn,
        hamlessPlayer === null ? 0 : ownerForPlayer(round, hamlessPlayer),
      );
      if (hamlessPlayer !== null) {
        const owner = ownerForPlayer(round, hamlessPlayer);
        assert.equal(
          round.game.board.some((p) => p?.owner === owner && p.type === "ham"),
          false,
        );
        for (const change of [null, 1 - hamlessPlayer, "0", undefined]) {
          const bad = structuredClone(roundView(round));
          bad.hamlessPlayer = change;
          assert.equal(validateRound(bad), null);
        }
      }
      const bad = structuredClone(roundView(round));
      bad.opening[bad.opening.findIndex((p) => p?.type === "king")] = null;
      assert.equal(validateRound(bad), null);
    }
  }
});

test("rematches swap seats but keep the handicapped person moving first", () => {
  for (const hamlessPlayer of [0, 1]) {
    let round = createRound("handicap", 1, () => 0.99, hamlessPlayer);
    for (const [a, b] of [
      [11, 7],
      [4, 8],
      [7, 3],
    ]) {
      const [from, to] = hamlessPlayer === 1 ? [15 - a, 15 - b] : [a, b];
      round = applyAction(round, round.game.turn, {
        ...round,
        type: "play",
        action: { kind: "move", from, to },
      }).state;
    }
    assert.equal(round.game.status, "won");
    for (const player of [0, 1])
      round = applyAction(round, player, { ...round, type: "rematch" }, () => 0.99).state;
    assert.equal(round.roundId, 2);
    assert.equal(round.game.turn, ownerForPlayer(round, hamlessPlayer));
    assert.equal(round.hamlessPlayer, hamlessPlayer);
    assert.equal(hamCount(round.game), 1);
    assert.equal(
      round.game.board.some(
        (p) => p?.owner === ownerForPlayer(round, hamlessPlayer) && p.type === "ham",
      ),
      false,
    );
    assert.deepEqual(validateRound(roundView(round)), round);
  }
});

test("only the handicapped player may open any round and replay rejects the former opening order", () => {
  for (const hamlessPlayer of [0, 1])
    for (const roundId of [1, 2, 3]) {
      const round = createRound("first-turn", roundId, () => 0.99, hamlessPlayer);
      const first = ownerForPlayer(round, hamlessPlayer);
      const action =
        first === 0 ? { kind: "move", from: 11, to: 7 } : { kind: "move", from: 4, to: 8 };
      const request = { ...round, type: "play", action };
      assert.equal(applyAction(round, 1 - hamlessPlayer, request).ok, false);
      const result = applyAction(round, hamlessPlayer, request);
      assert.ok(result.ok);
      assert.equal(result.state.game.moves[0].owner, first);
      assert.equal(result.state.game.turn, 1 - first);
      assert.deepEqual(validateRound(roundView(result.state)), result.state);
      const wrong = { kind: "move", from: 15 - action.from, to: 15 - action.to };
      assert.equal(validateRound({ ...roundView(round), actions: [wrong], revision: 1 }), null);
      assert.equal(validateRound({ ...roundView(round), protocol: "takumegu-shogi-2" }), null);
    }
});

test("repetition restores the actual first mover when the upper side is handicapped", () => {
  let round = createRound("handicap-repeat", 1, () => 0.99, 1);
  for (let i = 0; i < 3; i++)
    for (const [from, to] of [
      [3, 7],
      [12, 8],
      [7, 3],
      [8, 12],
    ]) {
      const result = applyAction(round, round.game.turn, {
        ...round,
        type: "play",
        action: { kind: "move", from, to },
      });
      assert.ok(result.ok);
      round = result.state;
      assert.deepEqual(validateRound(roundView(round)), round);
    }
  assert.equal(round.event.type, "repetition");
  assert.equal(round.event.offender, 1);
  assert.equal(round.event.continuous, false);
  assert.equal(round.game.turn, 1);
  assert.equal(round.game.history[0].turn, 1);
  assert.equal(round.game.moves.length, 10);
  assert.equal(play(round.game, { kind: "move", from: 7, to: 3 }).reason, "repetition");
  const next = play(round.game, { kind: "move", from: 7, to: 6 });
  assert.ok(next.ok);
  assert.equal(next.state.turn, 0);
});
