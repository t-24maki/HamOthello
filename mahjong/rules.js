import {
  TILE_TYPES,
  TILE_COUNT,
  tileType,
  validTile,
  freshTiles,
  sortTiles,
} from "./tiles.js?v=20261022-mahjong7";
export const ROUNDS = 4;
export const MELDS = Object.freeze([
  ...TILE_TYPES.map((_, type) => ({ types: [type, type, type], kind: "triple", points: 3 })),
  ...[0, 5].flatMap((start) =>
    [0, 1, 2].map((i) => ({
      types: [start + i, start + i + 1, start + i + 2],
      kind: "run",
      points: 1,
    })),
  ),
]);
export function tileCounts(hand) {
  const counts = Array(13).fill(0);
  for (const id of hand) counts[tileType(id)]++;
  return counts;
}
export function validHand(hand, lengths = [8, 9]) {
  return (
    Array.isArray(hand) &&
    lengths.includes(hand.length) &&
    hand.every(validTile) &&
    new Set(hand).size === hand.length
  );
}
export function roleBonus(types) {
  if (types.every((t) => t < 5)) return { name: "オールたくハム", points: 5 };
  if (types.every((t) => t >= 5 && t < 10)) return { name: "オールめぐハム", points: 5 };
  if (types.every((t) => t >= 10)) return { name: "オールたぴ", points: 20 };
  return { name: "", points: 0 };
}
export function scoreHand(hand, { riichi = false } = {}) {
  if (!validHand(hand, [9])) return null;
  const counts = tileCounts(hand);
  let best = null;
  function search(groups, points) {
    const first = counts.findIndex((n) => n > 0);
    if (first < 0) {
      if (!best || points > best.base)
        best = { base: points, groups: groups.map((g) => ({ ...g, types: [...g.types] })) };
      return;
    }
    for (const meld of MELDS) {
      if (meld.types[0] !== first) continue;
      const needed = Array(13).fill(0);
      for (const type of meld.types) needed[type]++;
      if (needed.some((n, i) => n > counts[i])) continue;
      needed.forEach((n, i) => {
        counts[i] -= n;
      });
      search([...groups, meld], points + meld.points);
      needed.forEach((n, i) => {
        counts[i] += n;
      });
    }
  }
  search([], 0);
  if (!best) return null;
  const bonus = roleBonus(hand.map(tileType));
  const pool = sortTiles(hand);
  best.groups = best.groups.map((group) => ({
    kind: group.kind,
    points: group.points,
    tiles: group.types.map(
      (type) =>
        pool.splice(
          pool.findIndex((id) => tileType(id) === type),
          1,
        )[0],
    ),
  }));
  return {
    ...best,
    bonus,
    riichi: riichi ? 1 : 0,
    total: best.base + bonus.points + (riichi ? 1 : 0),
  };
}
// Waiting kinds depend only on the eight tiles, never on the hidden wall or opponent.
export function waitingTypes(hand) {
  if (!validHand(hand, [8])) return [];
  return TILE_TYPES.flatMap((_, type) => {
    const tile = [type * 3, type * 3 + 1, type * 3 + 2].find((id) => !hand.includes(id));
    return tile !== undefined && scoreHand([...hand, tile]) ? [type] : [];
  });
}
export function canRiichi(state, player, tile) {
  return (
    [0, 1].includes(player) &&
    state.turn === player &&
    state.phase === "discard" &&
    !state.riichi[player] &&
    (state.wallCount ?? state.wall?.length) > 0 &&
    validTile(tile) &&
    state.hands[player]?.includes(tile) &&
    waitingTypes(state.hands[player].filter((id) => id !== tile)).length > 0
  );
}
export function riichiDiscards(state, player) {
  return state.hands[player]?.filter((tile) => canRiichi(state, player, tile)) ?? [];
}
export function shuffledTiles(random = Math.random) {
  const tiles = freshTiles();
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
}
function deal(state, random) {
  const wall = shuffledTiles(random),
    hands = [[], []];
  for (let i = 0; i < 8; i++) for (let p = 0; p < 2; p++) hands[p].push(wall.pop());
  const dealer = (state.first + state.round - 1) % 2;
  return {
    ...state,
    phase: "draw",
    dealer,
    turn: dealer,
    wall,
    hands: hands.map(sortTiles),
    discards: [[], []],
    riichi: [false, false],
    riichiTiles: [null, null],
    drawn: null,
    lastDiscard: null,
    result: null,
  };
}
export function createGame({ first = 0, random = Math.random } = {}) {
  return deal({ first: first === 1 ? 1 : 0, round: 1, scores: [0, 0], history: [] }, random);
}
function finish(state, winner, method, score = null) {
  const result = { winner, method, score };
  if (winner !== null) state.scores[winner] += score.total;
  state.result = result;
  state.history.push({ round: state.round, winner, points: score?.total ?? 0, method });
  state.phase = state.round === ROUNDS ? "matchEnd" : "roundEnd";
  return state;
}
// A possible win pauses the round. Scores and tile ownership change only on declaration.
export function claimScore(state, player, method = state.phase) {
  if (state.turn !== player || state.phase !== method) return null;
  if (method === "tsumo") {
    if (!state.hands[player]?.includes(state.drawn)) return null;
    return scoreHand(state.hands[player], { riichi: state.riichi[player] });
  }
  if (method === "ron") {
    const last = state.lastDiscard;
    if (
      !last ||
      last.player !== 1 - player ||
      state.discards[last.player].at(-1) !== last.tile ||
      !validHand(state.hands[player], [8])
    )
      return null;
    return scoreHand([...state.hands[player], last.tile], { riichi: state.riichi[player] });
  }
  return null;
}
export function play(state, player, action) {
  if (![0, 1].includes(player) || !action || state.turn !== player) return null;
  if (action.type === "ron" || action.type === "tsumo") {
    const score = claimScore(state, player, action.type);
    if (!score) return null;
    const next = structuredClone(state);
    if (action.type === "ron") {
      const tile = next.discards[1 - player].pop();
      next.hands[player].push(tile);
      next.drawn = tile;
    }
    return finish(next, player, action.type, score);
  }
  if (action.type === "draw" && state.phase === "draw") {
    if (!state.wall.length) return finish(structuredClone(state), null, "draw");
    const next = structuredClone(state),
      id = next.wall.pop();
    next.hands[player].push(id);
    next.drawn = id;
    next.lastDiscard = null;
    const score = scoreHand(next.hands[player], { riichi: next.riichi[player] });
    next.phase = score ? "tsumo" : "discard";
    return next;
  }
  if (["discard", "riichi"].includes(action.type) && state.phase === "discard") {
    if (state.riichi[player] && action.tile !== state.drawn) return null;
    if (action.type === "riichi" && !canRiichi(state, player, action.tile)) return null;
    if (!validTile(action.tile) || !state.hands[player].includes(action.tile)) return null;
    const next = structuredClone(state),
      other = 1 - player;
    next.hands[player].splice(next.hands[player].indexOf(action.tile), 1);
    next.hands[player] = sortTiles(next.hands[player]);
    next.discards[player].push(action.tile);
    next.lastDiscard = { player, tile: action.tile };
    next.drawn = null;
    const score = scoreHand([...next.hands[other], action.tile], { riichi: next.riichi[other] });
    if (score) {
      next.turn = other;
      next.phase = "ron";
      return next;
    }
    // A declaration succeeds only if the discard did not give the opponent ron.
    if (action.type === "riichi") {
      next.riichi[player] = true;
      next.riichiTiles[player] = action.tile;
    }
    // The last drawn tile can still be discarded for ron before the wall is exhausted.
    if (!next.wall.length) return finish(next, null, "draw");
    next.turn = other;
    next.phase = "draw";
    return next;
  }
  return null;
}
export function nextRound(state, random = Math.random) {
  if (state.phase !== "roundEnd" || state.round >= ROUNDS) return null;
  return deal({ ...structuredClone(state), round: state.round + 1 }, random);
}
export function matchWinner(scores) {
  return scores[0] === scores[1] ? null : scores[0] > scores[1] ? 0 : 1;
}
// Views expose only the recipient's hand and a winning hand after a round.
// Neither the wall order nor the opponent's waiting tiles enter the wire or CPU input.
export function gameView(state, player) {
  const { wall, hands, ...visible } = structuredClone(state);
  return {
    ...visible,
    wallCount: wall.length,
    handCounts: hands.map((h) => h.length),
    hands: hands.map((hand, i) => (i === player || state.result?.winner === i ? hand : null)),
    drawn: state.turn === player || state.result ? state.drawn : null,
  };
}
export function completeTileInventory(state) {
  const ids = [...state.wall, ...state.hands.flat(), ...state.discards.flat()];
  return ids.length === TILE_COUNT && ids.every(validTile) && new Set(ids).size === TILE_COUNT;
}
