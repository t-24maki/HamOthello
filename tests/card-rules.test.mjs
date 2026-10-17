import { test } from "node:test";
import assert from "node:assert/strict";
import { BLACK, WHITE, EMPTY, applyMove, getValidMoves } from "../src/game-logic.js";
import {
  createMatch,
  copyHands,
  getActionTargets,
  getActions,
  applyAction,
  hasAction,
  isMatchOver,
  chooseCpuAction,
  parseOnlineState,
  ONLINE_VERSION,
} from "../src/card-rules.js";

test("classic mode matches the original opening and cannot use cards", () => {
  const s = createMatch();
  assert.deepEqual([...getActionTargets(s).keys()], [...getValidMoves(s.board, BLACK).keys()]);
  const index = getActions(s)[0].index;
  assert.deepEqual(
    applyAction(s, { kind: "place", index }).board,
    applyMove(s.board, index, BLACK),
  );
  assert.equal(applyAction(s, { kind: "anywhere", index: 0 }), null);
  assert.equal(getActionTargets(s, "flip").size, 0);
});

test("each player gets one of each card with separate immutable hands", () => {
  const s = createMatch("cards"),
    original = structuredClone(s);
  assert.deepEqual(s.hands, { 1: { anywhere: 1, flip: 1 }, 2: { anywhere: 1, flip: 1 } });
  const next = applyAction(s, { kind: "anywhere", index: 0 });
  assert.deepEqual(s, original);
  assert.notEqual(next.board, s.board);
  assert.equal(next.hands[BLACK].anywhere, 0);
  assert.equal(next.hands[WHITE].anywhere, 1);
  assert.equal(next.board[0], BLACK);
  assert.equal(next.turnCount, 1);
  assert.equal(next.currentPlayer, WHITE);
  assert.equal(next.board.filter(Boolean).length, 5);
});

test("anywhere card includes isolated squares and corners; bracketed lines still flip", () => {
  const s = createMatch("cards");
  for (const index of [0, 7, 56, 63]) assert.ok(getActionTargets(s, "anywhere").has(index));
  const index = getActionTargets(s).keys().next().value;
  const result = applyAction(s, { kind: "anywhere", index });
  assert.deepEqual(result.board, applyMove(s.board, index, BLACK));
  assert.equal(result.hands[BLACK].anywhere, 0);
});

test("flip card changes exactly one opponent, with no extra bracket flips, including a corner", () => {
  const s = createMatch("cards");
  s.board[0] = WHITE;
  s.board[1] = WHITE;
  s.board[2] = BLACK;
  const next = applyAction(s, { kind: "flip", index: 0 });
  assert.equal(next.board[0], BLACK);
  assert.equal(next.board[1], WHITE);
  assert.equal(next.board.filter((value, i) => value !== s.board[i]).length, 1);
  assert.equal(next.turnCount, 1);
  assert.equal(next.hands[BLACK].flip, 0);
  assert.equal(next.currentPlayer, WHITE);
  assert.equal(next.board.filter(Boolean).length, s.board.filter(Boolean).length);
});

test("illegal targets, malformed actions and spent cards do not change state", () => {
  const s = createMatch("cards"),
    original = structuredClone(s);
  for (const action of [
    null,
    {},
    { kind: "anywhere", index: 27 },
    { kind: "flip", index: 0 },
    { kind: "flip", index: 28 },
    { kind: "place", index: 0 },
    { kind: "flip", index: -1 },
    { kind: "anywhere", index: 64 },
    { kind: "anywhere", index: 1.5 },
    { kind: "anywhere", index: "0" },
    { kind: "__proto__", index: 0 },
  ])
    assert.equal(applyAction(s, action), null);
  assert.deepEqual(s, original);
  const used = applyAction(s, { kind: "anywhere", index: 0 });
  used.currentPlayer = BLACK;
  assert.equal(applyAction(used, { kind: "anywhere", index: 1 }), null);
  assert.ok(getActionTargets(used, "flip").size > 0);
});

test("no ordinary moves does not end or pass a turn while a card can be played", () => {
  const s = createMatch("cards");
  s.board = Array(64).fill(EMPTY);
  s.board[0] = BLACK;
  s.board[7] = WHITE;
  assert.equal(getValidMoves(s.board, BLACK).size, 0);
  assert.equal(getValidMoves(s.board, WHITE).size, 0);
  assert.equal(isMatchOver(s), false);
  const next = applyAction(s, { kind: "anywhere", index: 56 });
  assert.equal(next.currentPlayer, WHITE);
  assert.ok(hasAction(next, WHITE));
});

test("a player without normal moves or usable cards is automatically passed", () => {
  const t = createMatch("cards");
  t.board = Array(64).fill(EMPTY);
  t.board[0] = BLACK;
  t.board[7] = WHITE;
  t.hands[WHITE] = { anywhere: 0, flip: 0 };
  const passed = applyAction(t, { kind: "anywhere", index: 56 });
  assert.equal(passed.currentPlayer, BLACK);
  assert.equal(isMatchOver(passed), false);
});

test("full board ends immediately even when flip cards remain", () => {
  const s = createMatch("cards");
  s.board = Array(64).fill(BLACK);
  s.board[63] = WHITE;
  assert.equal(isMatchOver(s), true);
  assert.equal(getActions(s).length, 0);
  assert.equal(applyAction(s, { kind: "flip", index: 63 }), null);
  s.board[62] = EMPTY;
  const next = applyAction(s, { kind: "anywhere", index: 62 });
  assert.equal(isMatchOver(next), true);
  assert.equal(next.hands[WHITE].flip, 1);
});

test("with both colors remaining, a partial board ends only if neither player has an action", () => {
  const s = createMatch("cards");
  s.board = Array(64).fill(EMPTY);
  s.board[0] = BLACK;
  s.board[7] = WHITE;
  s.hands[BLACK] = { anywhere: 0, flip: 0 };
  s.hands[WHITE] = { anywhere: 0, flip: 0 };
  assert.equal(isMatchOver(s), true);
  s.hands[WHITE].flip = 1;
  assert.equal(isMatchOver(s), false);
  assert.equal(hasAction(s, WHITE), true);
  assert.equal(hasAction(s, BLACK), false);
});

test("eliminating either color ends immediately after a normal move or either card", () => {
  for (const player of [BLACK, WHITE])
    for (const kind of ["place", "anywhere", "flip"]) {
      const s = createMatch("cards");
      s.board = Array(64).fill(EMPTY);
      for (const index of [0, 8, 9]) s.board[index] = player;
      s.board[1] = 3 - player;
      s.currentPlayer = player;
      const next = applyAction(s, { kind, index: kind === "flip" ? 1 : 2 });
      assert.ok(next);
      assert.equal(isMatchOver(next), true);
      assert.equal(next.board.includes(3 - player), false);
      assert.equal(next.turnCount, 1);
      assert.deepEqual(next.hands[3 - player], { anywhere: 1, flip: 1 });
      assert.ok(next.hands[player].anywhere || next.hands[player].flip);
      for (const color of [BLACK, WHITE]) {
        assert.equal(hasAction(next, color), false);
        assert.deepEqual(getActions(next, color), []);
        const ended = { ...next, currentPlayer: color };
        assert.equal(applyAction(ended, { kind: "anywhere", index: 63 }), null);
        assert.equal(chooseCpuAction(ended, "strong"), null);
      }
      assert.deepEqual(parseOnlineState({ ...next, version: ONLINE_VERSION, revision: 1 }), next);
    }
});

test("all CPU difficulties can play a card when it is their only option", () => {
  const s = createMatch("cards");
  s.board = Array(64).fill(EMPTY);
  s.board[0] = BLACK;
  s.board[7] = WHITE;
  for (const difficulty of ["weak", "normal", "strong"]) {
    const action = chooseCpuAction(s, difficulty);
    assert.notEqual(action.kind, "place");
    assert.ok(applyAction(s, action));
  }
});

test("CPU games terminate, obey inventories, and count placement and flip actions once", () => {
  for (const rule of ["classic", "cards"])
    for (const difficulty of ["weak", "normal", "strong"]) {
      let s = createMatch(rule);
      let steps = 0;
      const uses = { 1: { anywhere: 0, flip: 0 }, 2: { anywhere: 0, flip: 0 } };
      while (!isMatchOver(s) && steps < 65) {
        const action = chooseCpuAction(s, difficulty);
        assert.ok(action);
        if (action.kind !== "place") uses[s.currentPlayer][action.kind]++;
        const next = applyAction(s, action);
        assert.ok(next);
        assert.equal(next.turnCount, s.turnCount + 1);
        assert.equal(
          next.board.filter(Boolean).length,
          s.board.filter(Boolean).length + (action.kind === "flip" ? 0 : 1),
        );
        s = next;
        steps++;
      }
      assert.ok(isMatchOver(s), rule + "/" + difficulty);
      assert.ok(steps <= 62);
      for (const hand of Object.values(uses))
        for (const count of Object.values(hand)) assert.ok(count <= 1);
    }
});

test("online snapshots round-trip stock, rule, pass and actual turn count throughout a game", () => {
  let host = createMatch("cards");
  for (let i = 0; i < 62 && !isMatchOver(host); i++) {
    const next = applyAction(host, chooseCpuAction(host, "normal"));
    const guest = parseOnlineState({ ...next, version: ONLINE_VERSION, revision: next.turnCount });
    assert.deepEqual(guest, next);
    assert.notEqual(guest.hands[BLACK], next.hands[BLACK]);
    host = next;
  }
});

test("invalid or incompatible online snapshots are rejected", () => {
  const message = { ...createMatch("cards"), version: ONLINE_VERSION, revision: 0 };
  assert.ok(parseOnlineState(message));
  for (const patch of [
    { version: 1 },
    { version: 2 },
    { ruleMode: "other" },
    { board: [] },
    { board: Array(64) },
    { currentPlayer: 3 },
    { turnCount: 1, revision: 1 },
    { revision: 2 },
    { hands: { 1: { anywhere: 2, flip: 1 }, 2: { anywhere: 1, flip: 1 } } },
    { hands: { 1: { anywhere: 0, flip: 1 }, 2: { anywhere: 1, flip: 1 } } },
  ])
    assert.equal(parseOnlineState({ ...message, ...patch }), null);
  const classic = { ...createMatch(), version: ONLINE_VERSION, revision: 0 };
  assert.equal(parseOnlineState({ ...classic, hands: copyHands(message.hands) }), null);
});
