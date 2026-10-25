import { validExpression } from "./characters.js?v=poker-dilemma-20261025";
import {
  MATCH_ROUNDS,
  WINS_TO_WIN,
  createRound,
  nextRound,
  recordRound,
  roundResult,
  matchResult,
  exchangeCards,
  evaluateHand,
  exchangeCpuPlayers,
} from "./rules.js?v=poker-dilemma-20261025";

export const POKER_PROTOCOL = "mini-poker-20261025-7";

export function createOnlineRound(
  matchId,
  roundId = 1,
  random = Math.random,
  previous = null,
  characters = ["tak", "meg", "ham", "tapi"],
) {
  const base = previous ? nextRound(previous, random) : createRound("cpu", random, characters);
  if (!base) return null;
  return {
    ...exchangeCpuPlayers(base, [2, 3]),
    mode: "online",
    matchId,
    roundId,
    seriesStart: previous?.seriesStart ?? roundId,
    revision: 0,
    phase: "choose",
    ready: [false, false],
    proceed: [false, false],
  };
}

export function applyOnlineAction(state, player, action, random = Math.random) {
  if (
    ![0, 1].includes(player) ||
    !action ||
    action.matchId !== state.matchId ||
    action.roundId !== state.roundId
  )
    return null;
  if (action.type === "exchange") {
    if (state.phase !== "choose" || state.ready[player] || state.exchanges[player] !== null)
      return null;
    const next = exchangeCards({ ...state, active: player }, action.indices);
    if (!next) return null;
    return {
      ...state,
      hands: next.hands,
      deck: next.deck,
      discards: next.discards,
      exchanges: next.exchanges,
      revision: state.revision + 1,
    };
  }
  if (action.type === "ready") {
    if (state.phase !== "choose" || state.exchanges[player] === null || state.ready[player])
      return null;
    const ready = [...state.ready];
    ready[player] = true;
    const next = {
      ...state,
      ready,
      phase: ready.every(Boolean) ? "result" : "choose",
      revision: state.revision + 1,
    };
    return next.phase === "result" ? recordRound(next) : next;
  }
  if (action.type === "next" || action.type === "rematch") {
    const final = Boolean(matchResult(state));
    if (
      state.phase !== "result" ||
      state.proceed[player] ||
      action.type !== (final ? "rematch" : "next")
    )
      return null;
    const proceed = [...state.proceed];
    proceed[player] = true;
    if (proceed.every(Boolean))
      return createOnlineRound(
        state.matchId,
        state.roundId + 1,
        random,
        final ? null : state,
        state.characters,
      );
    return { ...state, proceed, revision: state.revision + 1 };
  }
  return null;
}

// Only each recipient's hand is sent before showdown, including CPU hands.
// Initial cards stay on the host; later expression hints can be sent as public poses.
export function playerView(state, player) {
  return {
    protocol: POKER_PROTOCOL,
    matchId: state.matchId,
    roundId: state.roundId,
    seriesStart: state.seriesStart,
    roundNumber: state.roundNumber,
    wins: [...state.wins],
    characters: [...state.characters],
    expressions: [...state.expressions],
    history: [...state.history],
    revision: state.revision,
    phase: state.phase,
    hands: state.hands.map((hand, index) =>
      index === player || state.phase === "result" ? hand.map((card) => ({ ...card })) : null,
    ),
    exchanges: [...state.exchanges],
    ready: [...state.ready],
    proceed: [...state.proceed],
    deckCount: state.deck.length,
    discardCount: state.discards.length,
  };
}

export function validView(view, player = 1) {
  if (
    ![0, 1].includes(player) ||
    !view ||
    view.protocol !== POKER_PROTOCOL ||
    typeof view.matchId !== "string" ||
    !view.matchId ||
    view.matchId.length > 120 ||
    !Number.isInteger(view.roundId) ||
    view.roundId < 1 ||
    !Number.isInteger(view.roundNumber) ||
    view.roundNumber < 1 ||
    view.roundNumber > MATCH_ROUNDS ||
    !Number.isInteger(view.seriesStart) ||
    view.seriesStart < 1 ||
    view.roundId !== view.seriesStart + view.roundNumber - 1 ||
    !Array.isArray(view.history) ||
    view.history.length !== view.roundNumber - (view.phase === "result" ? 0 : 1) ||
    view.history.some((winner) => ![0, 1, 2, 3].includes(winner)) ||
    !Array.isArray(view.wins) ||
    view.wins.length !== 4 ||
    view.wins.some((wins, p) => wins !== view.history.filter((winner) => winner === p).length) ||
    !Number.isInteger(view.revision) ||
    view.revision < 0 ||
    !["choose", "result"].includes(view.phase) ||
    ["deck", "discards", "initialHands"].some((key) => Object.hasOwn(view, key)) ||
    !Array.isArray(view.characters) ||
    view.characters.length !== 4 ||
    view.characters.some((c) => !["tak", "meg", "ham", "tapi"].includes(c)) ||
    !Array.isArray(view.expressions) ||
    view.expressions.length !== 4 ||
    view.expressions.some((pose, p) => !validExpression(view.characters[p], pose)) ||
    !Array.isArray(view.hands) ||
    view.hands.length !== 4 ||
    !Array.isArray(view.exchanges) ||
    view.exchanges.length !== 4 ||
    view.exchanges.some((n) => n !== null && (!Number.isInteger(n) || n < 0 || n > 3)) ||
    ![view.ready, view.proceed].every(
      (values) =>
        Array.isArray(values) && values.length === 2 && values.every((v) => typeof v === "boolean"),
    ) ||
    !Number.isInteger(view.deckCount) ||
    !Number.isInteger(view.discardCount) ||
    view.deckCount < 3 ||
    view.deckCount > 15 ||
    view.discardCount !== view.exchanges.reduce((sum, count) => sum + (count ?? 0), 0) ||
    view.deckCount + view.discardCount !== 15 ||
    view.exchanges.slice(2).some((n) => n === null) ||
    view.ready.some((ready, i) => ready && view.exchanges[i] === null) ||
    (view.phase === "result") !== view.ready.every(Boolean) ||
    (view.phase !== "result" && view.proceed.some(Boolean))
  )
    return false;
  // A series cannot continue after either player has already earned three wins.
  const previousResults = view.phase === "result" ? view.history.slice(0, -1) : view.history;
  if (
    [0, 1, 2, 3].some((p) => previousResults.filter((winner) => winner === p).length >= WINS_TO_WIN)
  )
    return false;
  try {
    evaluateHand(view.hands[player]);
    if (view.phase === "result") {
      view.hands.forEach(evaluateHand);
      if (new Set(view.hands.flat().map((card) => card.id)).size !== 12) return false;
      if (view.history.at(-1) !== roundResult(view).winner) return false;
    } else if (view.hands.some((hand, i) => i !== player && hand !== null)) return false;
  } catch {
    return false;
  }
  return true;
}
