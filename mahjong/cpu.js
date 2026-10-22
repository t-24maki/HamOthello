import { MELDS, tileCounts, roleBonus, canRiichi } from "./rules.js?v=20261022-mahjong7";
import { tileType } from "./tiles.js?v=20261022-mahjong7";
// All possible nine-tile goals, with the highest score for ambiguous decompositions.
const targets = new Map();
for (let a = 0; a < MELDS.length; a++)
  for (let b = a; b < MELDS.length; b++)
    for (let c = b; c < MELDS.length; c++) {
      const groups = [MELDS[a], MELDS[b], MELDS[c]],
        counts = Array(13).fill(0);
      const types = groups.flatMap((g) => g.types);
      for (const t of types) counts[t]++;
      if (counts.some((n) => n > 3)) continue;
      const key = counts.join(""),
        score = groups.reduce((sum, g) => sum + g.points, 0) + roleBonus(types).points;
      if (!targets.has(key) || score > targets.get(key).score) targets.set(key, { counts, score });
    }
const GOALS = [...targets.values()];
export function chooseDiscard(view, player = 1, random = Math.random) {
  const hand = view.hands[player];
  if (view.phase !== "discard" || view.turn !== player || !hand || hand.length !== 9) return null;
  if (view.riichi[player]) return view.drawn;
  const held = tileCounts(hand),
    seen = tileCounts([...hand, ...view.discards.flat()]);
  const unseen = seen.map((n) => Math.max(0, 3 - n));
  const choices = [];
  for (const type of new Set(hand.map(tileType))) {
    const counts = [...held];
    counts[type]--;
    let distance = Infinity,
      chances = 0,
      value = 0;
    for (const target of GOALS) {
      let missing = 0,
        ways = 1;
      for (let t = 0; t < 13; t++) {
        const need = Math.max(0, target.counts[t] - counts[t]);
        if (need > unseen[t]) {
          missing = Infinity;
          break;
        }
        missing += need;
        if (need) ways *= unseen[t];
      }
      if (!Number.isFinite(missing)) continue;
      if (missing < distance) {
        distance = missing;
        chances = 0;
        value = 0;
      }
      if (missing === distance) {
        chances += ways;
        value = Math.max(value, target.score);
      }
    }
    // Prefer being closer to an achievable hand, then more routes, then points.
    choices.push({
      tile: hand.find((id) => tileType(id) === type),
      value: -distance * 100000 + Math.log1p(chances) * 100 + value,
    });
  }
  const best = Math.max(...choices.map((c) => c.value));
  const tied = choices.filter((c) => c.value === best);
  return tied[Math.min(tied.length - 1, Math.max(0, Math.floor(random() * tied.length)))].tile;
}

// All modes draw automatically. Locked hands also discard automatically after a short reveal.
export function automaticAction(view, player, isCPU = false, random = Math.random) {
  if (!view || view.turn !== player) return null;
  if (["ron", "tsumo"].includes(view.phase)) return isCPU ? { type: view.phase } : null;
  if (view.phase === "draw") return { type: "draw" };
  if (view.phase !== "discard") return null;
  if (view.riichi[player]) return { type: "discard", tile: view.drawn };
  if (!isCPU) return null;
  const tile = chooseDiscard(view, player, random);
  return { type: canRiichi(view, player, tile) ? "riichi" : "discard", tile };
}
