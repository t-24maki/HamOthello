import { CHARACTERS, EMPTY_INPUT } from "./engine.js?v=20261014-battle11";
import {
  getStage,
  mainPlatform,
  platformsAt,
  surfaceAt,
  supports,
} from "./stages.js?v=20261014-battle11";
const LEVELS = {
  easy: { reaction: 0.48, attack: 1.2, guard: 0.02, special: 0.06 },
  normal: { reaction: 0.17, attack: 0.46, guard: 0.28, special: 0.32 },
  hard: { reaction: 0.09, attack: 0.33, guard: 0.53, special: 0.48 },
};
export function createCPU(random = Math.random) {
  return { random, think: 0, attackWait: 0, jumpWait: 0, guardTime: 0, restTime: 0, move: 0 };
}
export function cpuInput(g, brain, dt, index = 1) {
  const stage = getStage(g.stageId),
    platforms = platformsAt(stage, g.elapsed),
    base = mainPlatform(stage);
  const f = g.fighters[index],
    other = g.fighters[1 - index],
    level = LEVELS[g.difficulty];
  if (g.phase !== "playing" || f.respawn || !f.stocks) return { ...EMPTY_INPUT };
  brain.think -= dt;
  brain.attackWait -= dt;
  brain.jumpWait -= dt;
  brain.guardTime -= dt;
  brain.restTime -= dt;
  const dx = other.x - f.x,
    dy = other.y - f.y;
  const input = { ...EMPTY_INPUT, move: brain.move, guard: brain.guardTime > 0 };
  // Returning to the main stage takes priority at every difficulty.
  const standing =
    f.grounded && platforms.find((p) => Math.abs(surfaceAt(p, f.x) - f.y) < 1 && supports(p, f.x));
  const offstage = !standing && (f.x < base.x + 18 || f.x > base.x + base.w - 18);
  if (offstage) {
    input.move = f.x < base.x + base.w / 2 ? 1 : -1;
    brain.move = input.move;
    input.guard = false;
    if (f.vy > -60 && f.y > base.y - 85 && brain.jumpWait <= 0) {
      if (f.jumps < 2) {
        input.jump = true;
        brain.jumpWait = 0.22;
      } else if (!f.airSpecial && f.specialCooldown === 0) input.special = true;
    }
    return input;
  }
  // Beginners get room to respond after a swing. Recovery still takes priority.
  if (g.difficulty === "easy" && brain.restTime > 0) {
    brain.move = 0;
    return { ...EMPTY_INPUT };
  }
  if (brain.think > 0) return input;
  brain.think = level.reaction * (0.8 + brain.random() * 0.4);
  // Never chase an opponent out of bounds; wait near the edge instead.
  let targetX = Math.max(base.x + 42, Math.min(base.x + base.w - 42, other.x));
  // Route via a reachable side platform when the opponent is on the high center
  // platform. Standing directly underneath it is too far for a single jump.
  if (dy < -65 && f.grounded && !(standing?.main && base.profile)) {
    const routes = platforms
      .filter((p) => p.y < f.y - 30 && p.y >= f.y - 155)
      .sort(
        (a, b) =>
          Math.abs(a.x + a.w / 2 - f.x) +
          Math.abs(a.x + a.w / 2 - other.x) -
          (Math.abs(b.x + b.w / 2 - f.x) + Math.abs(b.x + b.w / 2 - other.x)),
      );
    if (routes.length)
      targetX = Math.max(routes[0].x + 30, Math.min(routes[0].x + routes[0].w - 30, targetX));
  } else if (dy > 70 && f.grounded) {
    // Leave the nearest edge to descend through the one-way platform layout.
    const on = platforms.find(
      (p) => !p.main && Math.abs(surfaceAt(p, f.x) - f.y) < 1 && supports(p, f.x),
    );
    if (on) {
      const exits = [on.x - 36, on.x + on.w + 36].filter(
        (x) => x > base.x + 20 && x < base.x + base.w - 20,
      );
      targetX =
        exits.sort((a, b) => Math.abs(a - f.x) - Math.abs(b - f.x))[0] ?? base.x + base.w / 2;
    }
  }
  input.move =
    Math.abs(targetX - f.x) > (Math.abs(dy) > 65 ? 12 : 48)
      ? Math.sign(targetX - f.x)
      : Math.abs(dx) > 9
        ? Math.sign(dx) * 0.12
        : 0;
  if (g.difficulty === "easy") input.move *= 0.65;
  if (Math.abs(dx) < 110 && other.attack && f.grounded && brain.random() < level.guard) {
    brain.guardTime = 0.2 + brain.random() * 0.16;
    input.guard = true;
    input.move = 0;
  }
  const platformAbove = platforms.some(
    (p) => !p.main && p.y < f.y - 30 && p.y >= f.y - 150 && f.x > p.x - 40 && f.x < p.x + p.w + 40,
  );
  if (
    brain.jumpWait <= 0 &&
    !input.guard &&
    ((dy < -65 && platformAbove) || (Math.abs(dx) < 90 && brain.random() < 0.1))
  ) {
    input.jump = f.grounded || (f.vy > 0 && f.jumps < 2);
    if (input.jump) brain.jumpWait = 0.45;
  }
  if (!input.guard && Math.abs(dx) < 90 && Math.abs(dy) < 75 && brain.attackWait <= 0) {
    input.special = !f.airSpecial && f.specialCooldown === 0 && brain.random() < level.special;
    input.attack = !input.special;
    if (g.difficulty === "easy") brain.restTime = 0.45 + brain.random() * 0.25;
    // Use the same policy for both fighters while respecting their attack tempo.
    brain.attackWait =
      level.attack *
      (CHARACTERS[f.character].normal.cooldown / 0.34) *
      (0.85 + brain.random() * 0.4);
  }
  brain.move = input.move;
  return input;
}
