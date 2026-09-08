import {
  BLACK,
  WHITE,
  EMPTY,
  createInitialBoard,
  getValidMoves,
  getFlips,
  opponent,
  chooseCpuMove,
  evaluateBoard,
  countStones,
} from "./game-logic.js?v=cards-20260908-r2";

export const RULE_LABELS = { classic: "いつものルール", cards: "カードあり" };
export const CARDS = {
  anywhere: {
    name: "どこでもカード",
    icon: "＋",
    description: "あいているマスに、ぽん。はさめたハムはいつもどおり、くるん！",
  },
  flip: {
    name: "くるんカード",
    icon: "↻",
    description: "相手のハムを、好きなところから1こだけ、くるん！",
  },
};
export const ONLINE_VERSION = 3;
export function createHands(ruleMode = "classic") {
  const count = ruleMode === "cards" ? 1 : 0;
  return { [BLACK]: { anywhere: count, flip: count }, [WHITE]: { anywhere: count, flip: count } };
}
export function copyHands(hands) {
  return {
    [BLACK]: { anywhere: hands[BLACK].anywhere, flip: hands[BLACK].flip },
    [WHITE]: { anywhere: hands[WHITE].anywhere, flip: hands[WHITE].flip },
  };
}
export function createMatch(ruleMode = "classic") {
  if (!Object.hasOwn(RULE_LABELS, ruleMode)) throw new Error("Unknown rules");
  return {
    board: createInitialBoard(),
    currentPlayer: BLACK,
    ruleMode,
    hands: createHands(ruleMode),
    turnCount: 0,
  };
}

function boardHasEnded(board) {
  return !board.includes(EMPTY) || !board.includes(BLACK) || !board.includes(WHITE);
}

export function getActionTargets(state, kind = "place", player = state.currentPlayer) {
  if (![BLACK, WHITE].includes(player) || boardHasEnded(state.board)) return new Map();
  if (kind === "place") return getValidMoves(state.board, player);
  if (state.ruleMode !== "cards" || !Object.hasOwn(CARDS, kind) || state.hands[player][kind] !== 1)
    return new Map();
  const targets = new Map();
  state.board.forEach((cell, index) => {
    if (kind === "anywhere" && cell === EMPTY)
      targets.set(index, getFlips(state.board, index, player));
    if (kind === "flip" && cell === opponent(player)) targets.set(index, []);
  });
  return targets;
}
export function hasAction(state, player) {
  if (boardHasEnded(state.board)) return false;
  if (getValidMoves(state.board, player).size) return true;
  return (
    state.ruleMode === "cards" &&
    (state.hands[player].anywhere === 1 ||
      (state.hands[player].flip === 1 && state.board.includes(opponent(player))))
  );
}
export function isMatchOver(state) {
  return boardHasEnded(state.board) || (!hasAction(state, BLACK) && !hasAction(state, WHITE));
}
export function getActions(state, player = state.currentPlayer) {
  return ["place", "anywhere", "flip"].flatMap((kind) =>
    [...getActionTargets(state, kind, player).keys()].map((index) => ({ kind, index })),
  );
}
export function applyAction(state, action) {
  if (
    !action ||
    !Number.isInteger(action.index) ||
    action.index < 0 ||
    action.index >= 64 ||
    isMatchOver(state)
  )
    return null;
  const targets = getActionTargets(state, action.kind);
  if (!["place", "anywhere", "flip"].includes(action.kind) || !targets.has(action.index))
    return null;
  const movingPlayer = state.currentPlayer;
  const next = {
    ...state,
    board: [...state.board],
    hands: copyHands(state.hands),
    turnCount: state.turnCount + 1,
  };
  next.board[action.index] = movingPlayer;
  for (const index of targets.get(action.index)) next.board[index] = movingPlayer;
  if (action.kind !== "place") next.hands[movingPlayer][action.kind] = 0;
  const rival = opponent(movingPlayer);
  next.currentPlayer = hasAction(next, rival)
    ? rival
    : hasAction(next, movingPlayer)
      ? movingPlayer
      : rival;
  return next;
}

function evaluateMatch(state, player) {
  if (isMatchOver(state)) {
    const counts = countStones(state.board);
    const difference = (counts.black - counts.white) * (player === BLACK ? 1 : -1);
    return Math.sign(difference) * 100000 + difference;
  }
  const stock = (hand) => hand.anywhere * 18 + hand.flip * 28;
  return (
    evaluateBoard(state.board, player) +
    stock(state.hands[player]) -
    stock(state.hands[opponent(player)])
  );
}
export function chooseCpuAction(state, difficulty = "normal") {
  if (isMatchOver(state)) return null;
  if (state.ruleMode === "classic") {
    const index = chooseCpuMove(state.board, state.currentPlayer, difficulty);
    return index === null ? null : { kind: "place", index };
  }
  const actions = getActions(state);
  if (!actions.length) return null;
  if (difficulty === "weak") {
    const normal = actions.filter((action) => action.kind === "place");
    const special = actions.filter((action) => action.kind !== "place");
    const pool = special.length && (!normal.length || Math.random() < 0.22) ? special : normal;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const player = state.currentPlayer;
  const ranked = actions
    .map((action) => {
      const next = applyAction(state, action);
      return { action, next, score: evaluateMatch(next, player) };
    })
    .sort((a, b) => b.score - a.score);
  if (difficulty !== "strong") return ranked[0].action;
  // Card targets greatly increase branching. Consider every reply to the best
  // eight candidates, keeping the search bounded for phones.
  let best = ranked[0].action,
    bestScore = -Infinity;
  for (const candidate of ranked.slice(0, 8)) {
    const replies = getActions(candidate.next);
    let score = candidate.score;
    if (replies.length && !isMatchOver(candidate.next)) {
      const scores = replies.map((action) =>
        evaluateMatch(applyAction(candidate.next, action), player),
      );
      score = candidate.next.currentPlayer === player ? Math.max(...scores) : Math.min(...scores);
    }
    if (score > bestScore) {
      bestScore = score;
      best = candidate.action;
    }
  }
  return best;
}

// Only a host snapshot with consistent card stock and move count can replace
// a guest's state. A card flip adds a turn without adding an occupied square.
export function parseOnlineState(message) {
  if (
    message?.version !== ONLINE_VERSION ||
    !Object.hasOwn(RULE_LABELS, message.ruleMode) ||
    !Array.isArray(message.board) ||
    message.board.length !== 64 ||
    !Array.from(message.board).every((cell) => [EMPTY, BLACK, WHITE].includes(cell)) ||
    ![BLACK, WHITE].includes(message.currentPlayer) ||
    !Number.isInteger(message.turnCount) ||
    message.turnCount < 0 ||
    message.turnCount > 64 ||
    message.revision !== message.turnCount
  )
    return null;
  for (const player of [BLACK, WHITE])
    for (const kind of Object.keys(CARDS)) {
      const count = message.hands?.[player]?.[kind];
      if (![0, 1].includes(count) || (message.ruleMode === "classic" && count !== 0)) return null;
    }
  const occupied = message.board.filter((cell) => cell !== EMPTY).length;
  const flipsUsed =
    message.ruleMode === "cards" ? 2 - message.hands[BLACK].flip - message.hands[WHITE].flip : 0;
  const usedCards =
    message.ruleMode === "cards"
      ? 4 -
        message.hands[BLACK].anywhere -
        message.hands[BLACK].flip -
        message.hands[WHITE].anywhere -
        message.hands[WHITE].flip
      : 0;
  if (
    occupied < 4 ||
    message.turnCount !== occupied - 4 + flipsUsed ||
    usedCards > message.turnCount
  )
    return null;
  const state = {
    board: [...message.board],
    currentPlayer: message.currentPlayer,
    ruleMode: message.ruleMode,
    hands: copyHands(message.hands),
    turnCount: message.turnCount,
  };
  if (!isMatchOver(state) && !hasAction(state, state.currentPlayer)) return null;
  return state;
}
