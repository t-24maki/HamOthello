import {
  createGame,
  play,
  nextRound,
  gameView,
  scoreHand,
  validHand,
  canRiichi,
  waitingTypes,
  claimScore,
} from "./rules.js?v=20261022-mahjong7";
import { validTile } from "./tiles.js?v=20261022-mahjong7";
export const PROTOCOL = "mini-mahjong-20261022-3";
const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
export function createMatch(matchId, generation = 1, random = Math.random, first = 0) {
  return {
    matchId,
    generation,
    revision: 0,
    ready: [false, false],
    game: createGame({ first, random }),
  };
}
export function canAct(view, player, type, tile) {
  const g = view?.game;
  if (!g || ![0, 1].includes(player)) return false;
  if (type === "next" || type === "rematch")
    return !view.ready[player] && g.phase === (type === "next" ? "roundEnd" : "matchEnd");
  if (g.turn !== player) return false;
  if (type === "draw") return g.phase === "draw";
  if (type === "ron" || type === "tsumo") return Boolean(claimScore(g, player, type));
  if (type === "riichi") return canRiichi(g, player, tile);
  return (
    type === "discard" &&
    g.phase === "discard" &&
    g.hands[player]?.includes(tile) &&
    (!g.riichi[player] || tile === g.drawn)
  );
}
export function applyAction(state, player, action, random = Math.random) {
  const vote = action?.type === "next" || action?.type === "rematch";
  if (
    !action ||
    action.matchId !== state.matchId ||
    action.generation !== state.generation ||
    action.round !== state.game.round ||
    !integer(action.revision, 0, state.revision) ||
    (!vote && action.revision !== state.revision) ||
    !canAct(state, player, action.type, action.tile)
  )
    return null;
  const next = structuredClone(state);
  next.revision++;
  if (vote) {
    next.ready[player] = true;
    if (next.ready.every(Boolean)) {
      if (action.type === "rematch")
        return createMatch(state.matchId, state.generation + 1, random, 1 - state.game.first);
      next.game = nextRound(state.game, random);
      next.ready = [false, false];
    }
  } else {
    next.game = play(state.game, player, action);
    if (!next.game) return null;
  }
  return next;
}
export function matchView(state, player) {
  return {
    matchId: state.matchId,
    generation: state.generation,
    revision: state.revision,
    ready: [...state.ready],
    game: gameView(state.game, player),
  };
}
// Reject malformed views before rendering. Only the host holds the wall and both private hands.
export function validateView(view, player) {
  if (
    !view ||
    ![0, 1].includes(player) ||
    typeof view.matchId !== "string" ||
    !view.matchId ||
    view.matchId.length > 160 ||
    !integer(view.generation, 1, 100000) ||
    !integer(view.revision, 0, 100000) ||
    !Array.isArray(view.ready) ||
    view.ready.length !== 2 ||
    !view.ready.every((b) => typeof b === "boolean") ||
    view.ready.every(Boolean)
  )
    return null;
  const g = view.game;
  if (
    !g ||
    "wall" in g ||
    "seed" in g ||
    !integer(g.round, 1, 4) ||
    !integer(g.first, 0, 1) ||
    !integer(g.turn, 0, 1) ||
    g.dealer !== (g.first + g.round - 1) % 2 ||
    !["draw", "discard", "ron", "tsumo", "roundEnd", "matchEnd"].includes(g.phase) ||
    !integer(g.wallCount, 0, 23) ||
    !Array.isArray(g.scores) ||
    g.scores.length !== 2 ||
    !g.scores.every((n) => integer(n, 0, 120)) ||
    !Array.isArray(g.riichi) ||
    g.riichi.length !== 2 ||
    !g.riichi.every((b) => typeof b === "boolean") ||
    !Array.isArray(g.riichiTiles) ||
    g.riichiTiles.length !== 2 ||
    !Array.isArray(g.hands) ||
    g.hands.length !== 2 ||
    !Array.isArray(g.handCounts) ||
    g.handCounts.length !== 2 ||
    !Array.isArray(g.discards) ||
    g.discards.length !== 2 ||
    !g.discards.every((h) =>
      validHand(
        h,
        Array.from({ length: 13 }, (_, i) => i),
      ),
    )
  )
    return null;
  const ended = ["roundEnd", "matchEnd"].includes(g.phase);
  if (
    ended !== Boolean(g.result) ||
    (g.phase === "matchEnd" && g.round !== 4) ||
    (g.phase === "roundEnd" && g.round === 4) ||
    (!ended && view.ready.some(Boolean))
  )
    return null;
  let winner = null;
  if (ended) {
    winner = g.result.winner;
    if (winner === null) {
      if (g.result.method !== "draw" || g.result.score !== null || g.wallCount !== 0) return null;
    } else {
      if (
        !integer(winner, 0, 1) ||
        winner !== g.turn ||
        !["tsumo", "ron"].includes(g.result.method)
      )
        return null;
      const actual = scoreHand(g.hands[winner], { riichi: g.riichi[winner] });
      if (!actual || JSON.stringify(actual) !== JSON.stringify(g.result.score)) return null;
    }
  }
  for (let p = 0; p < 2; p++) {
    if (g.riichi[p]) {
      if (!validTile(g.riichiTiles[p]) || !g.discards[p].includes(g.riichiTiles[p])) return null;
    } else if (g.riichiTiles[p] !== null) return null;
    const count = p === winner || (["discard", "tsumo"].includes(g.phase) && g.turn === p) ? 9 : 8;
    if (g.handCounts[p] !== count) return null;
    if (p === player || p === winner) {
      if (!validHand(g.hands[p], [count])) return null;
      if (
        g.riichi[p] &&
        p !== winner &&
        !waitingTypes(g.hands[p].filter((id) => id !== g.drawn)).length
      )
        return null;
    } else if (g.hands[p] !== null) return null;
  }
  const publicIds = [...g.hands.flatMap((h) => h ?? []), ...g.discards.flat()];
  if (
    new Set(publicIds).size !== publicIds.length ||
    g.wallCount + g.handCounts[0] + g.handCounts[1] + g.discards.flat().length !== 39
  )
    return null;
  if (g.drawn !== null && (!validTile(g.drawn) || !g.hands[g.turn]?.includes(g.drawn))) return null;
  if (g.phase === "draw" && (g.drawn !== null || g.wallCount === 0)) return null;
  if (["discard", "tsumo"].includes(g.phase) && g.turn === player && !validTile(g.drawn))
    return null;
  if (g.phase === "tsumo" && g.lastDiscard !== null) return null;
  if (g.phase === "ron" && (g.drawn !== null || g.lastDiscard?.player !== 1 - g.turn)) return null;
  if (
    g.lastDiscard !== null &&
    (!integer(g.lastDiscard?.player, 0, 1) ||
      !validTile(g.lastDiscard?.tile) ||
      !(g.result?.method === "ron"
        ? g.hands[winner].includes(g.lastDiscard.tile) && g.lastDiscard.player !== winner
        : g.discards[g.lastDiscard.player].at(-1) === g.lastDiscard.tile))
  )
    return null;
  if (["ron", "tsumo"].includes(g.phase) && player === g.turn && !claimScore(g, player))
    return null;
  if (!Array.isArray(g.history) || g.history.length !== g.round - (ended ? 0 : 1)) return null;
  const sums = [0, 0];
  for (const [i, h] of g.history.entries()) {
    if (!h || h.round !== i + 1) return null;
    if (h.winner === null) {
      if (h.points !== 0 || h.method !== "draw") return null;
    } else {
      if (
        !integer(h.winner, 0, 1) ||
        !integer(h.points, 3, 30) ||
        !["ron", "tsumo"].includes(h.method)
      )
        return null;
      sums[h.winner] += h.points;
    }
  }
  if (sums.some((n, i) => n !== g.scores[i])) return null;
  if (ended) {
    const last = g.history.at(-1);
    if (
      last.winner !== winner ||
      last.method !== g.result.method ||
      last.points !== (g.result.score?.total ?? 0)
    )
      return null;
  }
  return structuredClone(view);
}
