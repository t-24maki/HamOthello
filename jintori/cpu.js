import {
  SIZE,
  STEP,
  PAINT_SCALE,
  speedOf,
  cellAt,
  contactRadius,
  terrainPaintCells,
  randomNext,
  EMPTY,
} from "./engine.js?v=20261026-jintori6";
export function createCPU(seed) {
  return { seed: seed >>> 0, route: [], wait: 0, goal: null };
}
const neighbors = (cell) => [cell - SIZE, cell + 1, cell + SIZE, cell - 1];
export function cpuInput(game, brain, player) {
  if (game.phase !== "playing") return EMPTY;
  const p = game.players[player],
    start = cellAt(p.x, p.y);
  if (p.stunFrames > 0) return EMPTY;
  const character = game.characters[player];
  // Replan when items appear/disappear, not whenever Tapi crosses the awareness
  // radius. That used to restart its route toward the same cell centre each frame.
  const itemKey =
    character === 2 || character === 3 ? game.items.potions.map((item) => item.id).join(",") : "";
  brain.wait -= STEP;
  if (
    !brain.route.length ||
    brain.wait <= 0 ||
    brain.items !== itemKey ||
    brain.warp !== p.warpCount ||
    brain.terrain !== game.terrainVersion
  ) {
    // The radius decides which item Tapi notices. Once chosen, follow it through
    // a wall detour even if the straight-line distance briefly grows. A pickup
    // or warp releases this intention and evaluates nearby items again.
    const pursuedItem =
      character === 3 && brain.warp === p.warpCount && brain.goal?.kind === "item"
        ? game.items.potions.find((item) => item.id === brain.goal.id)
        : null;
    const items = game.items.potions.filter(
      (item) =>
        character === 2 ||
        (character === 3 &&
          (pursuedItem
            ? item.id === pursuedItem.id
            : Math.hypot(item.x - p.x, item.y - p.y) <= 10 / PAINT_SCALE)),
    );
    const distance = new Int16Array(SIZE * SIZE).fill(-1);
    const previous = new Int16Array(SIZE * SIZE).fill(-1);
    const queue = [start];
    distance[start] = 0;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const cell = queue[cursor];
      for (const next of neighbors(cell)) {
        if (!game.floor[next] || distance[next] >= 0) continue;
        distance[next] = distance[cell] + 1;
        previous[next] = cell;
        queue.push(next);
      }
    }
    let best = start,
      bestValue = -Infinity;
    // Do not keep trying to repaint the ground directly under a stationary
    // rival: it is immediately repainted and can trap Tak in one spot.
    const paintChoices =
      character === 0
        ? queue.filter(
            (cell) =>
              distance[cell] > 0 &&
              game.players.every(
                (other, i) =>
                  i === player ||
                  Math.hypot(
                    other.x - ((cell % SIZE) + 0.5),
                    other.y - (Math.floor(cell / SIZE) + 0.5),
                  ) >=
                    contactRadius(p) + contactRadius(other),
              ),
          )
        : queue;
    // Tak actively seeks rival paint. Other painters fill fresh ground first.
    const rivalCells =
      character === 0
        ? paintChoices.filter((cell) =>
            terrainPaintCells(cell).some((c) => game.paint[c] > 0 && game.paint[c] !== player + 1),
          )
        : [];
    const candidates = rivalCells.length ? rivalCells : paintChoices;
    for (const cell of candidates) {
      if (distance[cell] === 0) continue;
      brain.seed = randomNext(brain.seed);
      const reward =
        terrainPaintCells(cell).reduce((sum, c) => {
          const owner = game.paint[c];
          return sum + (owner === player + 1 ? 0 : owner === 0 ? 3.2 : character === 0 ? 5 : 2.8);
        }, 0) / 4;
      const crowd = game.players.filter(
        (other, i) =>
          i !== player &&
          Math.hypot(other.x - ((cell % SIZE) + 0.5), other.y - (Math.floor(cell / SIZE) + 0.5)) <
            2,
      ).length;
      const value =
        reward / (1 + distance[cell] * 0.19) + (brain.seed / 2 ** 32) * 0.3 - crowd * 0.2;
      if (value > bestValue) {
        best = cell;
        bestValue = value;
      }
    }
    brain.goal = { kind: rivalCells.length ? "repaint" : "paint", cell: best };
    if (character === 1) {
      const rivals = game.players
        .map((other, i) => ({
          i,
          cell: cellAt(other.x, other.y),
          distance: Math.hypot(other.x - p.x, other.y - p.y),
        }))
        .filter((other) => other.i !== player && distance[other.cell] >= 0)
        .sort((a, b) => a.distance - b.distance);
      if (rivals.length) {
        best = rivals[0].cell;
        brain.goal = { kind: "chase", cell: best, player: rivals[0].i };
      }
    } else if (items.length) {
      const reachable = items
        .map((item) => ({ item, cell: cellAt(item.x, item.y) }))
        .filter(({ cell }) => distance[cell] >= 0)
        .sort((a, b) => distance[a.cell] - distance[b.cell]);
      if (reachable.length) {
        best = reachable[0].cell;
        brain.goal = { kind: "item", cell: best, id: reachable[0].item.id };
      }
    }
    const route = [];
    for (let c = best; c !== start && c >= 0; c = previous[c]) route.unshift(c);
    if (Math.hypot((start % SIZE) + 0.5 - p.x, Math.floor(start / SIZE) + 0.5 - p.y) > 0.012)
      route.unshift(start);
    brain.route = route;
    brain.wait = character === 1 ? 0.4 : 0.7;
    brain.items = itemKey;
    brain.warp = p.warpCount;
    brain.terrain = game.terrainVersion;
  }
  while (brain.route.length) {
    const target = brain.route[0];
    const dx = (target % SIZE) + 0.5 - p.x,
      dy = Math.floor(target / SIZE) + 0.5 - p.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.012) {
      brain.route.shift();
      continue;
    }
    // Dash uses the same precise stopping distance so it cannot overshoot turns.
    const factor = Math.max(length, speedOf(p) * STEP);
    return { x: dx / factor, y: dy / factor };
  }
  return EMPTY;
}
