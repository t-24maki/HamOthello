import { getStage, mainPlatform, platformsAt, surfaceAt, supports } from "./stages.js";
// Feet-based coordinates; deterministic 120 Hz simulation, independent of rendering.
export const STEP = 1 / 120;
export const INPUT_GRACE = 0.12;
const BUFFERED_ACTIONS = ["jump", "attack", "special"];
function clearBufferedActions(f) {
  f.buffered = { jump: 0, attack: 0, special: 0 };
}
export const WIDTH = 800,
  HEIGHT = 500,
  STOCKS = 3,
  MATCH_TIME = 120;
export const CHARACTERS = {
  tak: {
    name: "たくハム",
    sheet: "lavender",
    speed: 300,
    jump: 670,
    color: "#a98ac5",
    normal: {
      damage: 8,
      startup: 0.065,
      activeEnd: 0.17,
      duration: 0.25,
      cooldown: 0.3,
      shieldDamage: 22,
    },
    special: {
      damage: 13,
      startup: 0.04,
      activeEnd: 0.3,
      duration: 0.36,
      cooldown: 1.15,
      shieldDamage: 30,
      speed: 365,
      jump: 600,
    },
  },
  meg: {
    name: "めぐハム",
    sheet: "cream",
    speed: 250,
    jump: 730,
    color: "#e2b967",
    normal: {
      damage: 10,
      startup: 0.065,
      activeEnd: 0.17,
      duration: 0.36,
      cooldown: 0.42,
      shieldDamage: 28,
    },
    special: {
      damage: 17,
      startup: 0.04,
      activeEnd: 0.3,
      duration: 0.46,
      cooldown: 1.45,
      shieldDamage: 40,
      speed: 300,
      jump: 665,
    },
  },
};
export const isCharacter = (value) => value === "tak" || value === "meg";
export const EMPTY_INPUT = Object.freeze({
  move: 0,
  jump: false,
  attack: false,
  special: false,
  guard: false,
});
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, goal, amount) =>
  v < goal ? Math.min(goal, v + amount) : Math.max(goal, v - amount);
export function makeFighter(character, index, stocks = STOCKS, stageId = "hill") {
  const stage = getStage(stageId);
  return {
    character,
    x: stage.spawns[index],
    y: surfaceAt(mainPlatform(stage), stage.spawns[index]),
    vx: 0,
    vy: 0,
    facing: index ? -1 : 1,
    grounded: true,
    platformId: mainPlatform(stage).id,
    jumps: 0,
    damage: 0,
    stocks,
    shield: 100,
    guarding: false,
    guardLock: 0,
    stun: 0,
    invincible: 0,
    respawn: 0,
    attack: null,
    cooldown: 0,
    specialCooldown: 0,
    airSpecial: false,
    buffered: { jump: 0, attack: 0, special: 0 },
  };
}
export function createMatch(character = "tak", difficulty = "normal", stageId = "hill", opponent) {
  const stage = getStage(stageId);
  if (!isCharacter(character)) character = "tak";
  if (!isCharacter(opponent)) opponent = character === "tak" ? "meg" : "tak";
  if (!["easy", "normal", "hard"].includes(difficulty)) difficulty = "normal";
  return {
    stageId: stage.id,
    fighters: [
      makeFighter(character, 0, STOCKS, stage.id),
      makeFighter(opponent, 1, STOCKS, stage.id),
    ],
    difficulty,
    phase: "countdown",
    countdown: 2.6,
    remaining: MATCH_TIME,
    elapsed: 0,
    winner: null,
    reason: "",
    effects: [],
    eventId: 0,
    events: [],
    accumulator: 0,
  };
}
function emit(g, type, data = {}) {
  g.events.push({ id: ++g.eventId, type, ...data });
  if (g.events.length > 32) g.events.shift();
}
function effect(g, type, x, y, color) {
  g.effects.push({ type, x, y, color, life: type === "out" ? 0.8 : 0.4, age: 0 });
}
function finish(g, reason) {
  const [a, b] = g.fighters;
  g.winner =
    a.stocks !== b.stocks
      ? a.stocks > b.stocks
        ? 0
        : 1
      : a.damage !== b.damage
        ? a.damage < b.damage
          ? 0
          : 1
        : null;
  g.phase = "finished";
  g.reason = reason;
  for (const f of g.fighters) {
    f.guarding = false;
    f.attack = null;
    clearBufferedActions(f);
  }
  emit(g, "finish", { winner: g.winner });
}
export function attackArea(f) {
  if (!f.attack) return null;
  const a = f.attack;
  const move = CHARACTERS[f.character][a.kind];
  if (a.hit || a.age < move.startup || a.age > move.activeEnd) return null;
  return {
    x: f.x + f.facing * (a.kind === "special" ? 22 : 42),
    y: f.y - 34,
    rx: a.kind === "special" ? 54 : 42,
    ry: a.kind === "special" ? 53 : 33,
  };
}
function moveFighter(g, f, raw, dt, previousPlatforms, platforms) {
  const input = raw || EMPTY_INPUT;
  const character = CHARACTERS[f.character];
  if (!f.stocks) return;
  for (const key of ["stun", "invincible", "cooldown", "specialCooldown", "guardLock"])
    f[key] = Math.max(0, f[key] - dt);
  if (f.respawn > 0) {
    clearBufferedActions(f);
    f.respawn = Math.max(0, f.respawn - dt);
    return;
  }
  // Remember a fresh tap briefly, but consume it only when the action can start.
  for (const action of BUFFERED_ACTIONS)
    f.buffered[action] = input[action] ? INPUT_GRACE : Math.max(0, f.buffered[action] - dt);
  const oldSupport =
    f.grounded &&
    previousPlatforms.find((p) => supports(p, f.x) && Math.abs(surfaceAt(p, f.x) - f.y) < 1);
  const support = oldSupport && platforms.find((p) => p.id === oldSupport.id);
  if (support) {
    // Carry first, then apply player input. Jumping detaches on this same tick.
    f.x += support.x - oldSupport.x;
    f.y = surfaceAt(support, f.x);
  }
  if (f.attack) {
    f.attack.age += dt;
    if (f.attack.age >= f.attack.duration) f.attack = null;
  }
  const move = clamp(Number.isFinite(input.move) ? input.move : 0, -1, 1);
  f.guarding =
    !!input.guard && f.grounded && f.stun === 0 && !f.attack && f.guardLock === 0 && f.shield > 0;
  f.shield = clamp(f.shield + (f.guarding ? -32 : 23) * dt, 0, 100);
  if (f.guarding && f.shield === 0) {
    f.guarding = false;
    f.guardLock = 1.3;
    f.stun = 0.7;
    emit(g, "break");
    effect(g, "guard", f.x, f.y - 34, "#b1cfc6");
  }
  const canAct = f.stun === 0 && !f.guarding;
  if (canAct) {
    if (move && !f.attack) f.facing = Math.sign(move);
    if (f.buffered.jump > 0 && f.jumps < 2 && !f.attack) {
      f.buffered.jump = 0;
      f.vy = -character.jump * (f.jumps ? 0.91 : 1);
      f.jumps++;
      f.grounded = false;
      effect(g, "jump", f.x, f.y, "#fff9e4");
      emit(g, "jump");
    }
    if (f.buffered.special > 0 && !f.attack && f.specialCooldown === 0 && !f.airSpecial) {
      f.buffered.special = 0;
      f.buffered.attack = 0;
      f.attack = { kind: "special", age: 0, duration: character.special.duration, hit: false };
      f.specialCooldown = character.special.cooldown;
      f.airSpecial = true;
      f.grounded = false;
      f.vy = -character.special.jump;
      f.vx = f.facing * character.special.speed;
      f.invincible = 0;
      emit(g, "special");
    } else if (f.buffered.attack > 0 && !f.attack && f.cooldown === 0) {
      f.buffered.attack = 0;
      f.buffered.special = 0;
      f.attack = { kind: "normal", age: 0, duration: character.normal.duration, hit: false };
      f.cooldown = character.normal.cooldown;
      f.invincible = 0;
      emit(g, "swing");
    }
    if (f.attack?.kind !== "special")
      f.vx = approach(
        f.vx,
        (f.guarding ? 0 : move) * character.speed,
        (f.grounded ? 2200 : 950) * dt,
      );
  } else if (f.guarding) f.vx = approach(f.vx, 0, 3000 * dt);
  else f.vx *= Math.exp(-(f.grounded ? 2 : 0.7) * dt);
  const oldX = f.x,
    oldY = f.y;
  const wasGrounded = f.grounded;
  f.vy = Math.min(1000, f.vy + 1650 * dt);
  f.x += f.vx * dt;
  f.y += f.vy * dt;
  f.grounded = false;
  f.platformId = null;
  if (wasGrounded && support && supports(support, f.x)) {
    // Continuous contact across uphill/downhill segments, without tiny falls.
    f.y = surfaceAt(support, f.x);
    f.vy = 0;
    f.grounded = true;
    f.platformId = support.id;
  } else {
    const landings = [];
    for (const p of platforms) {
      if (!supports(p, f.x)) continue;
      const before = previousPlatforms.find((q) => q.id === p.id);
      const oldSurface = surfaceAt(before, oldX),
        nextSurface = surfaceAt(p, f.x);
      const from = oldY - oldSurface,
        to = f.y - nextSurface;
      // Cross the actual moving/sloped top from above. Rising from below passes through.
      if (from <= 0.5 && to >= 0 && to > from) {
        landings.push({ p, y: nextSurface, fraction: Math.max(0, -from / (to - from)) });
      }
    }
    landings.sort((a, b) => a.fraction - b.fraction);
    if (landings.length) {
      const landing = landings[0];
      f.y = landing.y;
      f.vy = 0;
      f.grounded = true;
      f.platformId = landing.p.id;
      if (!wasGrounded) effect(g, "jump", f.x, f.y, "#fff9e4");
    }
  }
  if (f.grounded) {
    f.jumps = 0;
    f.airSpecial = false;
  }
  // Walking off a ledge leaves one air jump, instead of two fresh jumps.
  if (wasGrounded && !f.grounded && f.jumps === 0) f.jumps = 1;
}
function hit(g, attacker, defender, area) {
  const special = attacker.attack.kind === "special";
  const move = CHARACTERS[attacker.character][attacker.attack.kind];
  attacker.attack.hit = true;
  const dir = Math.sign(defender.x - attacker.x) || attacker.facing;
  if (defender.guarding) {
    defender.shield = Math.max(0, defender.shield - move.shieldDamage);
    defender.vx = dir * 95;
    if (defender.shield === 0) {
      defender.guarding = false;
      defender.guardLock = 1.3;
      defender.stun = 0.7;
    }
    effect(g, "guard", defender.x, defender.y - 35, "#83b7b1");
    emit(g, "block");
    return;
  }
  defender.damage = Math.min(999, defender.damage + move.damage);
  // Low percentages give a short nudge; accumulated damage increasingly matters.
  // Bound the extreme end so a single fixed step never tunnels across a platform.
  const d = defender.damage,
    growth = d * 1.6 + d * d * 0.03;
  const power = Math.min(1650, (special ? 205 : 140) + growth * (special ? 1.12 : 1));
  defender.vx = dir * power;
  defender.vy = -Math.min(880, (special ? 235 : 145) + d * 1.2 + d * d * 0.008);
  defender.grounded = false;
  defender.platformId = null;
  defender.jumps = Math.max(1, defender.jumps);
  defender.stun = Math.min(0.72, 0.11 + d * 0.0015 + d * d * 0.000007);
  defender.attack = null;
  clearBufferedActions(defender);
  defender.guarding = false;
  defender.invincible = 0.12;
  effect(g, "hit", (area.x + defender.x) / 2, defender.y - 32, special ? "#f3bb68" : "#d5a3c5");
  emit(g, "hit", { special });
}
export function tick(g, inputs = [EMPTY_INPUT, EMPTY_INPUT], dt = STEP) {
  if (g.phase === "paused" || g.phase === "finished") return;
  for (const e of g.effects) {
    e.life -= dt;
    e.age += dt;
  }
  g.effects = g.effects.filter((e) => e.life > 0);
  if (g.phase === "countdown") {
    g.countdown = Math.max(0, g.countdown - dt);
    if (g.countdown === 0) {
      g.phase = "playing";
      emit(g, "start");
    }
    return;
  }
  const stage = getStage(g.stageId),
    previousPlatforms = platformsAt(stage, g.elapsed);
  g.elapsed += dt;
  const platforms = platformsAt(stage, g.elapsed);
  g.remaining = Math.max(0, g.remaining - dt);
  g.fighters.forEach((f, i) => moveFighter(g, f, inputs[i], dt, previousPlatforms, platforms));
  // Snapshot both attack areas before applying hits, so simultaneous strikes trade fairly.
  const strikes = g.fighters.map((f, i) => {
    const d = g.fighters[1 - i],
      area = attackArea(f);
    return area &&
      !f.respawn &&
      !d.respawn &&
      !d.invincible &&
      d.stocks > 0 &&
      Math.abs(area.x - d.x) < area.rx + 23 &&
      Math.abs(area.y - (d.y - 32)) < area.ry + 29
      ? { f, d, area, attack: f.attack }
      : null;
  });
  for (const s of strikes)
    if (s) {
      const current = s.f.attack;
      s.f.attack = s.attack;
      hit(g, s.f, s.d, s.area);
      // A simultaneous hit still cancels this fighter's attack after its own damage is dealt.
      s.f.attack = current;
    }
  // Process both outs before deciding the winner (including simultaneous final stocks).
  g.fighters.forEach((f, i) => {
    if (!f.stocks || f.respawn > 0 || !(f.x < -90 || f.x > WIDTH + 90 || f.y < -190 || f.y > 600))
      return;
    const x = clamp(f.x, 20, WIDTH - 20),
      y = clamp(f.y - 30, 20, HEIGHT - 20),
      stocks = f.stocks - 1;
    effect(g, "out", x, y, CHARACTERS[f.character].color);
    emit(g, "out", { player: i });
    Object.assign(f, makeFighter(f.character, i, stocks, g.stageId), {
      x: i ? 475 : 325,
      y: mainPlatform(getStage(g.stageId)).y - 265,
      grounded: false,
      platformId: null,
      respawn: stocks ? 0.8 : 0,
      invincible: stocks ? 2.4 : 0,
    });
  });
  if (g.fighters.some((f) => f.stocks === 0)) finish(g, "stocks");
  else if (g.remaining <= 0) finish(g, "time");
}
// Local online prediction moves only this fighter. Hits, stocks and results remain authoritative.
export function predictMovement(g, index, input, dt = STEP) {
  if (g.phase !== "playing") return;
  const stage = getStage(g.stageId),
    before = platformsAt(stage, g.elapsed);
  g.elapsed += dt;
  moveFighter(g, g.fighters[index], input, dt, before, platformsAt(stage, g.elapsed));
  g.events = [];
  g.effects = [];
}
// Edges are consumed only by the first simulation tick. The caller retains them
// until this function actually advances, even on displays faster than 120 Hz.
export function advance(g, seconds, getInputs) {
  if (!Number.isFinite(seconds) || seconds <= 0 || g.phase === "paused" || g.phase === "finished")
    return 0;
  g.accumulator += Math.min(seconds, 0.1);
  let steps = 0;
  while (g.accumulator + 1e-9 >= STEP) {
    tick(g, getInputs(), STEP);
    g.accumulator -= STEP;
    steps++;
    if (g.phase === "finished") {
      g.accumulator = 0;
      break;
    }
  }
  return steps;
}
export function pause(g) {
  if (g.phase !== "playing" && g.phase !== "countdown") return false;
  g.beforePause = g.phase;
  g.phase = "paused";
  g.accumulator = 0;
  g.fighters.forEach(clearBufferedActions);
  return true;
}
export function resume(g) {
  if (g.phase !== "paused") return false;
  g.phase = g.beforePause || "playing";
  g.accumulator = 0;
  return true;
}
