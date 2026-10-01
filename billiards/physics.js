export const SIZE = 720;
export const CENTER = SIZE / 2;
export const TABLE_RADIUS = 278;
export const BALL_RADIUS = 21;
export const POCKET_RING = 273;
export const POCKET_RADIUS = 36;
export const MAX_DRAG = 132;
export const MIN_DRAG = 10;
export const MAX_SPEED = 2100;
// Keep the travel per physics step small enough for fast ball and pocket contacts.
export const FIXED_STEP = 1 / 360;
export const TURNS = 5;
export const PLAYERS = ["たくハム", "めぐハム"];
const FRICTION = 205;
const STOP_SPEED = 4;
const VALUES = [-1, 1, 2, 3, 4, 5];
const LIMIT = TABLE_RADIUS - BALL_RADIUS;

function shuffled(values, random) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export function createGame(random = Math.random, starter = 0) {
  const points = shuffled(VALUES, random);
  const pockets = points.map((points, id) => {
    const angle = -Math.PI / 2 + (id * Math.PI) / 3;
    return {
      id,
      points,
      // Scale every pocket with the balls, preserving the score/size relationship.
      radius: POCKET_RADIUS - Math.max(0, points - 1) * 3.75,
      angle,
      x: CENTER + Math.cos(angle) * POCKET_RING,
      y: CENTER + Math.sin(angle) * POCKET_RING,
    };
  });
  let positions = [];
  for (let tries = 0; positions.length < 10 && tries < 1000; tries++) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * 182;
    const candidate = {
      x: CENTER + Math.cos(angle) * radius,
      y: CENTER + Math.sin(angle) * radius,
    };
    if (
      Math.hypot(candidate.x - CENTER, candidate.y - CENTER) >= 60 &&
      positions.every((p) => Math.hypot(p.x - candidate.x, p.y - candidate.y) >= 52)
    )
      positions.push(candidate);
  }
  // A bounded fallback also makes a constant seeded RNG safe in tests.
  if (positions.length < 10)
    positions = Array.from({ length: 10 }, (_, i) => ({
      x: CENTER + Math.cos((i * Math.PI * 2) / 10) * 155,
      y: CENTER + Math.sin((i * Math.PI * 2) / 10) * 155,
    }));
  const owners = shuffled([0, 0, 0, 0, 0, 1, 1, 1, 1, 1], random);
  return {
    phase: "ready",
    turn: starter,
    starter,
    pockets,
    balls: [
      { id: 0, kind: "cue", owner: null, x: CENTER, y: CENTER, vx: 0, vy: 0, active: true },
      ...positions.map((p, i) => ({
        ...p,
        id: i + 1,
        kind: "color",
        owner: owners[i],
        vx: 0,
        vy: 0,
        active: true,
      })),
    ],
    scores: [0, 0],
    shots: [0, 0],
    log: [],
    pots: [],
    currentShot: null,
    winner: null,
    accumulator: 0,
  };
}
export function ballsLeft(game, owner) {
  return game.balls.filter((b) => b.active && b.kind === "color" && b.owner === owner).length;
}
export function cueBall(game) {
  return game.balls.find((b) => b.kind === "cue");
}
export function canPlaceCue(game, x, y) {
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Math.hypot(x - CENTER, y - CENTER) <= LIMIT - 4 &&
    game.pockets.every((p) => Math.hypot(x - p.x, y - p.y) > p.radius + BALL_RADIUS + 6) &&
    game.balls.every(
      (b) => b.kind === "cue" || !b.active || Math.hypot(x - b.x, y - b.y) >= BALL_RADIUS * 2 + 4,
    )
  );
}
export function findCuePlacement(game) {
  if (canPlaceCue(game, CENTER, CENTER)) return { x: CENTER, y: CENTER };
  for (let radius = 36; radius <= 216; radius += 36)
    for (let i = 0; i < 24; i++) {
      const x = CENTER + Math.cos((i * Math.PI) / 12) * radius;
      const y = CENTER + Math.sin((i * Math.PI) / 12) * radius;
      if (canPlaceCue(game, x, y)) return { x, y };
    }
  return null;
}
export function placeCue(game, x, y) {
  const cue = cueBall(game);
  if (game.phase !== "placing" || !cue || cue.active || !canPlaceCue(game, x, y)) return false;
  Object.assign(cue, { x, y, vx: 0, vy: 0, active: true });
  game.phase = "aiming";
  return true;
}
function nextTurn(game, next) {
  if (
    game.shots.every((n) => n >= TURNS) ||
    !game.balls.some((b) => b.active && b.kind === "color")
  ) {
    game.phase = "finished";
    game.winner =
      game.scores[0] === game.scores[1] ? "draw" : game.scores[0] > game.scores[1] ? 0 : 1;
    return;
  }
  // The shared cue remains playable even after a player's own colors are gone.
  game.turn = game.shots[next] < TURNS ? next : 1 - next;
  game.phase = cueBall(game).active ? "aiming" : "placing";
}
export function startGame(game) {
  if (game.phase !== "ready") return false;
  nextTurn(game, game.starter);
  return true;
}
export function launch(game, id, dx, dy) {
  if (game.phase !== "aiming" || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;
  const ball = game.balls.find((b) => b.id === id && b.active && b.kind === "cue");
  const distance = Math.hypot(dx, dy);
  if (!ball || !Number.isFinite(distance) || distance < MIN_DRAG || game.shots[game.turn] >= TURNS)
    return false;
  const speed = Math.min(distance / MAX_DRAG, 1) * MAX_SPEED;
  ball.vx = (dx / distance) * speed;
  ball.vy = (dy / distance) * speed;
  game.shots[game.turn]++;
  game.currentShot = {
    player: game.turn,
    number: game.shots[game.turn],
    scratch: false,
    pots: [],
    delta: [0, 0],
  };
  game.phase = "moving";
  game.accumulator = 0;
  return true;
}
function pocketOrCushion(game, ball) {
  if (!ball.active) return;
  const pocket = game.pockets.find((p) => Math.hypot(ball.x - p.x, ball.y - p.y) <= p.radius);
  if (pocket) {
    ball.active = false;
    ball.vx = ball.vy = 0;
    const pot = {
      id: game.pots.length,
      ball: ball.id,
      kind: ball.kind,
      owner: ball.owner,
      pocket: pocket.id,
      points: ball.kind === "cue" ? 0 : pocket.points,
    };
    if (ball.kind === "cue") game.currentShot.scratch = true;
    else {
      game.scores[ball.owner] += pot.points;
      game.currentShot.delta[ball.owner] += pot.points;
    }
    game.pots.push(pot);
    game.currentShot.pots.push(pot);
    return;
  }
  const dx = ball.x - CENTER,
    dy = ball.y - CENTER;
  const distance = Math.hypot(dx, dy);
  if (distance <= LIMIT) return;
  const nx = dx / distance,
    ny = dy / distance;
  ball.x = CENTER + nx * LIMIT;
  ball.y = CENTER + ny * LIMIT;
  const outward = ball.vx * nx + ball.vy * ny;
  if (outward > 0) {
    ball.vx -= 1.84 * outward * nx;
    ball.vy -= 1.84 * outward * ny;
  }
}
function collide(a, b) {
  if (!a.active || !b.active) return;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= BALL_RADIUS * 2) return;
  const nx = distance > 0.00001 ? dx / distance : 1;
  const ny = distance > 0.00001 ? dy / distance : 0;
  const correction = (BALL_RADIUS * 2 - distance + 0.002) / 2;
  a.x -= nx * correction;
  a.y -= ny * correction;
  b.x += nx * correction;
  b.y += ny * correction;
  const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (relative >= 0) return;
  const impulse = -relative * 0.97;
  a.vx -= impulse * nx;
  a.vy -= impulse * ny;
  b.vx += impulse * nx;
  b.vy += impulse * ny;
}
function physicsStep(game) {
  for (const b of game.balls) {
    if (!b.active) continue;
    b.x += b.vx * FIXED_STEP;
    b.y += b.vy * FIXED_STEP;
    pocketOrCushion(game, b);
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < game.balls.length; i++)
      for (let j = i + 1; j < game.balls.length; j++) collide(game.balls[i], game.balls[j]);
    for (const b of game.balls) pocketOrCushion(game, b);
  }
  for (const b of game.balls) {
    if (!b.active) continue;
    const speed = Math.hypot(b.vx, b.vy);
    const next = Math.max(0, speed - FRICTION * FIXED_STEP);
    const scale = next > STOP_SPEED ? next / speed : 0;
    b.vx *= scale;
    b.vy *= scale;
  }
  if (game.balls.every((b) => !b.active || (b.vx === 0 && b.vy === 0))) {
    game.log.push(game.currentShot);
    game.currentShot = null;
    nextTurn(game, 1 - game.turn);
  }
}
// Real time is accumulated; rendering frequency never changes the physical step.
export function advance(game, seconds) {
  if (game.phase !== "moving" || !Number.isFinite(seconds) || seconds <= 0) return;
  game.accumulator += Math.min(seconds, 1);
  while (game.accumulator + 1e-10 >= FIXED_STEP && game.phase === "moving") {
    game.accumulator -= FIXED_STEP;
    physicsStep(game);
  }
  if (game.phase !== "moving") game.accumulator = 0;
}
