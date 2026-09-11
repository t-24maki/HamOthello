import { createRound, exchangeCards, evaluateHand } from "./rules.js?v=poker-20260908";

export const POKER_PROTOCOL = "mini-poker-1";

export function createOnlineRound(matchId, roundId = 1, random = Math.random) {
  return {
    ...createRound("cpu", random),
    mode: "online",
    matchId,
    roundId,
    revision: 0,
    phase: "choose",
    ready: [false, false],
    rematch: [false, false],
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
    return {
      ...state,
      ready,
      phase: ready.every(Boolean) ? "result" : "choose",
      revision: state.revision + 1,
    };
  }
  if (action.type === "rematch") {
    if (state.phase !== "result" || state.rematch[player]) return null;
    const rematch = [...state.rematch];
    rematch[player] = true;
    if (rematch.every(Boolean)) return createOnlineRound(state.matchId, state.roundId + 1, random);
    return { ...state, rematch, revision: state.revision + 1 };
  }
  return null;
}

// The host keeps the deck and its own cards local. A guest snapshot contains
// only the guest's hand until both players explicitly reveal their hands.
export function playerView(state, player) {
  return {
    protocol: POKER_PROTOCOL,
    matchId: state.matchId,
    roundId: state.roundId,
    revision: state.revision,
    phase: state.phase,
    hands: state.hands.map((hand, index) =>
      index === player || state.phase === "result" ? hand.map((card) => ({ ...card })) : null,
    ),
    exchanges: [...state.exchanges],
    ready: [...state.ready],
    rematch: [...state.rematch],
    deckCount: state.deck.length,
    discardCount: state.discards.length,
  };
}

export function validView(view, player = 1) {
  if (
    !view ||
    view.protocol !== POKER_PROTOCOL ||
    typeof view.matchId !== "string" ||
    !view.matchId ||
    view.matchId.length > 120 ||
    !Number.isInteger(view.roundId) ||
    view.roundId < 1 ||
    !Number.isInteger(view.revision) ||
    view.revision < 0 ||
    !["choose", "result"].includes(view.phase) ||
    !Array.isArray(view.hands) ||
    view.hands.length !== 2 ||
    !Array.isArray(view.exchanges) ||
    view.exchanges.length !== 2 ||
    view.exchanges.some((n) => n !== null && (!Number.isInteger(n) || n < 0 || n > 3)) ||
    ![view.ready, view.rematch].every(
      (values) =>
        Array.isArray(values) && values.length === 2 && values.every((v) => typeof v === "boolean"),
    ) ||
    !Number.isInteger(view.deckCount) ||
    !Number.isInteger(view.discardCount) ||
    view.deckCount < 15 ||
    view.deckCount > 21 ||
    view.discardCount !== view.exchanges.reduce((sum, count) => sum + (count ?? 0), 0) ||
    view.deckCount + view.discardCount !== 21 ||
    view.ready.some((ready, i) => ready && view.exchanges[i] === null) ||
    (view.phase === "result") !== view.ready.every(Boolean) ||
    (view.phase !== "result" && view.rematch.some(Boolean))
  )
    return false;
  try {
    evaluateHand(view.hands[player]);
    if (view.phase === "result") {
      evaluateHand(view.hands[1 - player]);
      if (new Set(view.hands.flat().map((card) => card.id)).size !== 6) return false;
    } else if (view.hands[1 - player] !== null) return false;
  } catch {
    return false;
  }
  return true;
}
