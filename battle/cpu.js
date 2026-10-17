import {
  CHARACTERS,
  EMPTY_INPUT,
  fighterSize,
  attackScale,
  growthScale,
} from "./engine.js?v=20261017-battle19";
import {
  getStage,
  stageBounds,
  platformsAt,
  surfaceAt,
  supports,
} from "./stages.js?v=20261017-battle19";
import { GIANT_WARNING } from "./items.js?v=20261017-battle19";
const LEVELS = {
  easy: { reaction: 0.48, attack: 1.2, guard: 0.02, special: 0.06 },
  normal: { reaction: 0.17, attack: 0.46, guard: 0.28, special: 0.32 },
  hard: { reaction: 0.09, attack: 0.33, guard: 0.53, special: 0.48 },
};
export function createCPU(random = Math.random) {
  return { random, think: 0, attackWait: 0, jumpWait: 0, guardTime: 0, restTime: 0, move: 0 };
}
// Commit to the far island while airborne instead of turning back halfway across the gap.
function crossGap(f, brain, floors, standing, targetX) {
  const distance = (p, x) => Math.max(p.x - x, 0, x - p.x - p.w);
  const nearest = (x) => floors.slice().sort((a, b) => distance(a, x) - distance(b, x))[0];
  if (standing) {
    brain.gapTarget = null;
    if (!standing.main) return null;
    const destination = nearest(targetX);
    if (destination.id === standing.id) return null;
    const dir = Math.sign(destination.x - standing.x);
    const toEdge = dir > 0 ? standing.x + standing.w - f.x : f.x - standing.x;
    if (toEdge > 55) return { ...EMPTY_INPUT, move: dir };
    if (f.attack || f.stun > 0) return { ...EMPTY_INPUT };
    brain.gapTarget = destination.id;
    return { ...EMPTY_INPUT, move: dir, jump: true };
  }
  const destination = floors.find((p) => p.id === brain.gapTarget);
  if (!destination && floors.some((p) => f.x > p.x + 18 && f.x < p.x + p.w - 18)) return null;
  const landing = destination ?? nearest(f.x);
  const aim = Math.max(landing.x + 42, Math.min(landing.x + landing.w - 42, f.x));
  const input = { ...EMPTY_INPUT, move: Math.sign(aim - f.x) };
  const overLanding =
    f.x > landing.x + 12 && f.x < landing.x + landing.w - 12 && f.y <= surfaceAt(landing, f.x);
  if (!overLanding && f.vy > -60 && f.y > surfaceAt(landing, aim) - 85 && brain.jumpWait <= 0) {
    if (f.jumps < CHARACTERS[f.character].maxJumps) {
      input.jump = true;
      brain.jumpWait = 0.22;
    } else if (!f.airSpecial && f.specialCooldown === 0) input.special = true;
  }
  return input;
}
export function cpuInput(g, brain, dt, index = 1) {
  const stage = getStage(g.stageId),
    platforms = platformsAt(stage, g.elapsed),
    base = stageBounds(stage);
  const f = g.fighters[index],
    other = g.fighters[1 - index],
    level = LEVELS[g.difficulty];
  const character = CHARACTERS[f.character],
    otherCharacter = CHARACTERS[other.character],
    reachHeight = Math.min(
      155,
      (character.jump ** 2 / 3300) * (1 + 0.8281 * (character.maxJumps - 1)) - 10,
    ),
    reach = Math.min(
      90 * growthScale(f),
      84 * attackScale(f) + 23 * fighterSize(other) * (otherCharacter.hurtboxScale ?? 1) - 10,
    );
  if (g.phase !== "playing" || f.respawn || !f.stocks) {
    if (f.respawn) brain.gapTarget = null;
    return { ...EMPTY_INPUT };
  }
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
    f.grounded &&
    platforms.find(
      (p) => Math.abs(surfaceAt(p, f.x) - f.y) < 1 && supports(p, f.x, 18 * fighterSize(f)),
    );
  const islands = platforms.filter((p) => p.main);
  if (islands.length > 1) {
    const potion = (!f.giant || f.giantTime <= GIANT_WARNING) && g.items.potion;
    const crossing = crossGap(f, brain, islands, standing, (potion || other).x);
    if (crossing) {
      brain.move = crossing.move;
      return crossing;
    }
  }
  const offstage = !standing && (f.x < base.x + 18 || f.x > base.x + base.w - 18);
  if (offstage) {
    input.move = f.x < base.x + base.w / 2 ? 1 : -1;
    brain.move = input.move;
    input.guard = false;
    if (f.vy > -60 && f.y > base.y - 85 && brain.jumpWait <= 0) {
      if (f.jumps < character.maxJumps) {
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
  // Seek a useful potion on the stage; recovery above always takes priority.
  const potion = (!f.giant || f.giantTime <= GIANT_WARNING) && g.items.potion;
  const target =
    potion && potion.x > base.x + 20 && potion.x < base.x + base.w - 20
      ? { x: potion.x, y: potion.y + 18 }
      : other;
  const targetDY = target.y - f.y;
  // Never chase an opponent out of bounds; wait near the edge instead.
  let targetX = Math.max(base.x + 42, Math.min(base.x + base.w - 42, target.x));
  // Route via a reachable side platform when the opponent is on the high center
  // platform. Standing directly underneath it is too far for a single jump.
  if (targetDY < -65 && f.grounded && !(standing?.main && base.profile)) {
    const routes = platforms
      .filter((p) => p.y < f.y - 30 && p.y >= f.y - reachHeight)
      .sort(
        (a, b) =>
          Math.abs(a.x + a.w / 2 - f.x) +
          Math.abs(a.x + a.w / 2 - target.x) -
          (Math.abs(b.x + b.w / 2 - f.x) + Math.abs(b.x + b.w / 2 - target.x)),
      );
    if (routes.length)
      targetX = Math.max(routes[0].x + 30, Math.min(routes[0].x + routes[0].w - 30, targetX));
  } else if (targetDY > 70 && f.grounded) {
    // Leave the nearest edge to descend through the one-way platform layout.
    const on = platforms.find(
      (p) =>
        !p.main && Math.abs(surfaceAt(p, f.x) - f.y) < 1 && supports(p, f.x, 18 * fighterSize(f)),
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
    Math.abs(targetX - f.x) >
    (target !== other || Math.abs(targetDY) > 65 ? 12 : Math.min(48, reach * 0.65))
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
    (p) =>
      !p.main &&
      p.y < f.y - 30 &&
      p.y >= f.y - reachHeight &&
      f.x > p.x - 40 &&
      f.x < p.x + p.w + 40,
  );
  if (
    brain.jumpWait <= 0 &&
    !input.guard &&
    ((targetDY < -65 && platformAbove) || (Math.abs(dx) < 90 && brain.random() < 0.1))
  ) {
    input.jump = f.grounded || (f.vy > 0 && f.jumps < character.maxJumps);
    if (input.jump) brain.jumpWait = 0.45;
  }
  if (!input.guard && Math.abs(dx) < reach && Math.abs(dy) < 75 && brain.attackWait <= 0) {
    input.special =
      !(other.grounded && otherCharacter.groundedSpecialImmune) &&
      !f.airSpecial &&
      f.specialCooldown === 0 &&
      brain.random() < level.special;
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
