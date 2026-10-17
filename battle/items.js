import { surfaceAt, supports } from "./stages.js?v=20261017-battle19";

export const POTION_RADIUS = 18;
export const GIANT_POWER = 1.2;
export const GIANT_DURATION = 10;
export const GIANT_WARNING = 3;
// Stored with the match so the host can reproduce every drop after a snapshot.
function random(items) {
  items.seed = (Math.imul(items.seed, 1664525) + 1013904223) >>> 0;
  return items.seed / 2 ** 32;
}
export function createItems(seed) {
  const items = { seed: seed >>> 0, wait: 0, potion: null };
  items.wait = 8 + random(items) * 4;
  return items;
}
export function consumePotion(items) {
  items.potion = null;
  items.wait = 7 + random(items) * 13;
}
export function movePotion(items, stage, before, platforms, dt) {
  if (!items.potion) {
    items.wait = Math.max(0, items.wait - dt);
    if (items.wait > 0) return;
    const floors = stage.platforms.filter((p) => p.main);
    let offset = random(items) * floors.reduce((sum, p) => sum + p.w - 120, 0);
    const base = floors.find((p, i) => {
      if (offset < p.w - 120 || i === floors.length - 1) return true;
      offset -= p.w - 120;
      return false;
    });
    items.potion = {
      x: base.x + 60 + offset,
      y: -POTION_RADIUS,
      vy: 0,
      platformId: null,
    };
  }
  const p = items.potion;
  const oldFloor = before.find((floor) => floor.id === p.platformId);
  const floor = platforms.find((floor) => floor.id === p.platformId);
  if (oldFloor && floor && supports(oldFloor, p.x, 10)) {
    p.x += floor.x - oldFloor.x;
    p.y = surfaceAt(floor, p.x) - POTION_RADIUS;
    p.vy = 0;
    return;
  }
  p.platformId = null;
  const oldY = p.y;
  p.vy = Math.min(240, p.vy + 600 * dt);
  p.y += p.vy * dt;
  const landings = [];
  for (const floor of platforms) {
    if (!supports(floor, p.x, 10)) continue;
    const oldFloor = before.find((old) => old.id === floor.id);
    const from = oldY + POTION_RADIUS - surfaceAt(oldFloor, p.x);
    const to = p.y + POTION_RADIUS - surfaceAt(floor, p.x);
    if (from <= 0.5 && to >= 0 && to > from)
      landings.push({ floor, fraction: Math.max(0, -from / (to - from)) });
  }
  landings.sort((a, b) => a.fraction - b.fraction);
  if (landings.length) {
    const floor = landings[0].floor;
    p.y = surfaceAt(floor, p.x) - POTION_RADIUS;
    p.platformId = floor.id;
    p.vy = 0;
  }
  if (p.y > 600) consumePotion(items);
}
// Resolve a simultaneous touch once, by distance; exact ties have no fixed seat advantage.
export function potionCollector(items, fighters, bodyFor) {
  const p = items.potion;
  if (!p) return null;
  const touching = fighters.flatMap((f, player) => {
    if (!f.stocks || f.respawn > 0 || f.x < -90 || f.x > 890 || f.y < -190 || f.y > 600) return [];
    const b = bodyFor(f),
      dx = Math.max(0, Math.abs(p.x - b.x) - b.rx),
      dy = Math.max(0, Math.abs(p.y - b.y) - b.ry);
    return dx * dx + dy * dy <= POTION_RADIUS ** 2
      ? [{ player, distance: (p.x - b.x) ** 2 + (p.y - b.y) ** 2 }]
      : [];
  });
  touching.sort((a, b) => a.distance - b.distance);
  if (!touching.length) return null;
  return touching.length === 2 && touching[0].distance === touching[1].distance
    ? touching[Math.floor(random(items) * 2)].player
    : touching[0].player;
}
