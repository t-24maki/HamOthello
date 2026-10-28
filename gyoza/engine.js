import Matter from "./vendor/matter.js";
import { SHAPES, normalizeAngle, rotatedBounds } from "./shapes.js?v=20261027-gyoza3";
export const WIDTH = 480,
  PLATE_Y = 450,
  PLATE_WIDTH = 274,
  STEP_MS = 1000 / 120;
export const PROTOCOL = "takumegu-gyoza-20261027-3";
const { Engine, Bodies, Body, Composite, Sleeping, Query } = Matter;
export function nextRandom(game) {
  let n = game.seed;
  n ^= n << 13;
  n ^= n >>> 17;
  n ^= n << 5;
  game.seed = n >>> 0;
  return game.seed / 4294967296;
}
function choose(game) {
  if (!game.bag.length) {
    game.bag = SHAPES.map((s) => s.id);
    for (let i = game.bag.length - 1; i > 0; i--) {
      const j = Math.floor(nextRandom(game) * (i + 1));
      [game.bag[i], game.bag[j]] = [game.bag[j], game.bag[i]];
    }
  }
  return game.bag.pop();
}
export function makeBody(type, x, y, angle = 0) {
  const body = Bodies.fromVertices(x, y, SHAPES[type].points, {
    friction: 0.72,
    frictionStatic: 1.5,
    frictionAir: 0.012,
    restitution: 0.025,
    density: 0.0014,
    slop: 0.025,
    sleepThreshold: 90,
  });
  Body.setAngle(body, angle);
  body.gyozaType = type;
  return body;
}
export function createGame({ seed = 1, starter = 0, round = 1 } = {}) {
  const engine = Engine.create({
    enableSleeping: true,
    positionIterations: 10,
    velocityIterations: 8,
  });
  engine.gravity.y = 1.25;
  const plate = Bodies.rectangle(WIDTH / 2, PLATE_Y + 10, PLATE_WIDTH, 20, {
    isStatic: true,
    friction: 0.9,
    restitution: 0,
  });
  Composite.add(engine.world, plate);
  const game = {
    engine,
    plate,
    bodies: [],
    seed: seed >>> 0 || 1,
    starter,
    turn: starter,
    round,
    move: 0,
    tick: 0,
    phase: "aim",
    paused: false,
    winner: null,
    loser: null,
    fallen: null,
    bag: [],
    current: 0,
    preview: { x: WIDTH / 2, angle: 0 },
    elapsed: 0,
    calm: 0,
    total: 0,
  };
  game.current = choose(game);
  return game;
}
export function highest(game) {
  return Math.min(PLATE_Y, ...game.bodies.map((b) => b.bounds.min.y));
}
export function spawnY(game) {
  return Math.min(76, highest(game) - 110 - 60);
}
export function legalAim(type, x, angle) {
  if (!Number.isFinite(x) || !Number.isFinite(angle)) return null;
  angle = normalizeAngle(angle);
  const bounds = rotatedBounds(type, angle);
  return { x: Math.max(8 - bounds.minX, Math.min(WIDTH - 8 - bounds.maxX, x)), angle };
}
export function aim(game, player, x, angle) {
  if (game.phase !== "aim" || game.paused || player !== game.turn) return false;
  const value = legalAim(game.current, x, angle);
  if (!value) return false;
  game.preview = value;
  return true;
}
export function drop(game, player, x = game.preview.x, angle = game.preview.angle) {
  if (!aim(game, player, x, angle)) return false;
  const body = makeBody(game.current, game.preview.x, spawnY(game), game.preview.angle);
  body.gyozaId = game.move;
  game.bodies.push(body);
  Composite.add(game.engine.world, body);
  game.phase = "falling";
  game.elapsed = 0;
  game.calm = 0;
  return true;
}
function supported(game) {
  const connected = new Set([game.plate]);
  // Touching bodies must form a chain to the plate before the next hand begins.
  for (let pass = 0; pass < game.bodies.length; pass++) {
    let changed = false;
    for (const body of game.bodies) {
      if (connected.has(body)) continue;
      if (Query.collides(body, [...connected]).length) {
        connected.add(body);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return game.bodies.every((b) => connected.has(b));
}
export function step(game) {
  if (game.phase !== "falling" || game.paused) return false;
  Engine.update(game.engine, STEP_MS);
  game.tick++;
  game.elapsed += STEP_MS;
  const fallen = game.bodies.find(
    (b) => b.bounds.max.y > PLATE_Y + 62 || b.position.x < -80 || b.position.x > WIDTH + 80,
  );
  if (fallen) {
    game.phase = "finished";
    game.loser = game.turn;
    game.winner = 1 - game.turn;
    game.fallen = fallen.gyozaId;
    return true;
  }
  const quiet = game.bodies.every(
    (b) => b.isSleeping || (b.speed < 0.12 && Math.abs(b.angularVelocity) < 0.006),
  );
  game.calm = quiet ? game.calm + STEP_MS : 0;
  if (game.elapsed > 650 && game.calm >= 850) {
    if (!supported(game)) {
      // A resting stack can separate slightly as neighbouring bodies settle.
      // Let gravity restore contact instead of leaving a sleeping piece in midair.
      for (const b of game.bodies) Sleeping.set(b, false);
      game.calm = 0;
      return false;
    }
    for (const b of game.bodies) Sleeping.set(b, true);
    game.total++;
    game.move++;
    game.turn = 1 - game.turn;
    game.current = choose(game);
    game.phase = "aim";
    game.preview = { x: WIDTH / 2, angle: 0 };
    game.elapsed = 0;
    game.calm = 0;
    return true;
  }
  return false;
}
export function view(game) {
  return {
    protocol: PROTOCOL,
    round: game.round,
    move: game.move,
    tick: game.tick,
    turn: game.turn,
    starter: game.starter,
    phase: game.phase,
    paused: game.paused,
    winner: game.winner,
    loser: game.loser,
    fallen: game.fallen,
    total: game.total,
    current: game.current,
    preview: { ...game.preview },
    spawnY: spawnY(game),
    top: highest(game),
    bodies: game.bodies.map((b) => ({
      id: b.gyozaId,
      type: b.gyozaType,
      x: b.position.x,
      y: b.position.y,
      angle: b.angle,
    })),
  };
}
export function validateView(v) {
  if (
    !v ||
    v.protocol !== PROTOCOL ||
    ![0, 1].includes(v.turn) ||
    ![0, 1].includes(v.starter) ||
    !["aim", "falling", "finished"].includes(v.phase) ||
    typeof v.paused !== "boolean" ||
    !Number.isSafeInteger(v.round) ||
    v.round < 1 ||
    !Number.isSafeInteger(v.move) ||
    v.move < 0 ||
    v.turn !== (v.starter + v.move) % 2 ||
    !Number.isSafeInteger(v.tick) ||
    v.tick < 0 ||
    !Number.isSafeInteger(v.total) ||
    v.total !== v.move ||
    !Number.isInteger(v.current) ||
    !SHAPES[v.current] ||
    !Array.isArray(v.bodies) ||
    v.bodies.length > 512
  )
    return null;
  const finite = (n, max) => Number.isFinite(n) && Math.abs(n) <= max;
  if (
    !finite(v.spawnY, 100000) ||
    !finite(v.top, 100000) ||
    !v.preview ||
    !finite(v.preview.x, WIDTH) ||
    v.preview.x < 0 ||
    !finite(v.preview.angle, 7)
  )
    return null;
  if (v.bodies.length !== v.move + (v.phase === "aim" ? 0 : 1)) return null;
  if (
    v.phase === "finished"
      ? v.loser !== v.turn ||
        v.winner !== 1 - v.turn ||
        !Number.isInteger(v.fallen) ||
        v.fallen < 0 ||
        v.fallen > v.move
      : v.winner !== null || v.loser !== null || v.fallen !== null
  )
    return null;
  for (let i = 0; i < v.bodies.length; i++) {
    const b = v.bodies[i];
    if (
      !b ||
      b.id !== i ||
      !Number.isInteger(b.type) ||
      !SHAPES[b.type] ||
      !finite(b.x, 2000) ||
      !finite(b.y, 100000) ||
      !finite(b.angle, 100000)
    )
      return null;
  }
  return structuredClone(v);
}
export function restoreForTrial(snapshot) {
  const game = createGame();
  game.current = snapshot.current;
  game.move = snapshot.move;
  game.total = snapshot.total;
  game.turn = snapshot.turn;
  for (const item of snapshot.bodies) {
    const b = makeBody(item.type, item.x, item.y, item.angle);
    b.gyozaId = item.id;
    Sleeping.set(b, true);
    game.bodies.push(b);
    Composite.add(game.engine.world, b);
  }
  return game;
}
export function dispose(game) {
  Composite.clear(game.engine.world, false);
  Engine.clear(game.engine);
}
