import {
  SIZE,
  STEP,
  SPEED,
  cellAt,
  terrainPaintCells,
  randomNext,
  EMPTY,
} from "./engine.js?v=20261022-jintori4";
export function createCPU(seed) {
  return { seed: seed >>> 0, route: [], wait: 0 };
}
const neighbors = (cell) => [cell - SIZE, cell + 1, cell + SIZE, cell - 1];
export function cpuInput(game, brain, player) {
  if (game.phase !== "playing") return EMPTY;
  const p = game.players[player],
    start = cellAt(p.x, p.y);
  if (p.stunFrames > 0) return EMPTY;
  brain.wait -= STEP;
  if (!brain.route.length || brain.wait <= 0) {
    const distance = new Int16Array(SIZE * SIZE).fill(-1);
    const previous = new Int16Array(SIZE * SIZE).fill(-1);
    const queue = [start];
    distance[start] = 0;
    let best = start,
      bestValue = -Infinity;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const cell = queue[cursor],
        d = distance[cell];
      if (d > 0) {
        brain.seed = randomNext(brain.seed);
        // Prefer nearby new ground, with a small bonus for reclaiming rivals'
        // colour. Public board information only; no access to human input.
        const reward =
          terrainPaintCells(cell).reduce((sum, i) => {
            const owner = game.paint[i];
            return sum + (owner === player + 1 ? 0 : owner === 0 ? 2.8 : 3.2);
          }, 0) / 4;
        const crowd = game.players.filter(
          (other, i) =>
            i !== player &&
            Math.hypot(other.x - ((cell % SIZE) + 0.5), other.y - (Math.floor(cell / SIZE) + 0.5)) <
              2,
        ).length;
        const potion = game.items.potions.some((item) => cellAt(item.x, item.y) === cell);
        const itemValue = potion ? (p.giantFrames > 120 ? 3 : 9) / (1 + d * 0.12) : 0;
        const value =
          reward / (1 + d * 0.19) + itemValue + (brain.seed / 2 ** 32) * 0.38 - crowd * 0.5;
        if (value > bestValue) {
          bestValue = value;
          best = cell;
        }
      }
      for (const next of neighbors(cell)) {
        if (!game.floor[next] || distance[next] >= 0) continue;
        distance[next] = d + 1;
        previous[next] = cell;
        queue.push(next);
      }
    }
    const route = [];
    for (let c = best; c !== start && c >= 0; c = previous[c]) route.unshift(c);
    if (Math.hypot((start % SIZE) + 0.5 - p.x, Math.floor(start / SIZE) + 0.5 - p.y) > 0.012)
      route.unshift(start);
    brain.route = route;
    brain.wait = 0.7;
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
    // Slow for the last fraction of a cell, avoiding overshoot and wall jitter.
    const factor = Math.max(length, SPEED * STEP);
    return { x: dx / factor, y: dy / factor };
  }
  return EMPTY;
}
