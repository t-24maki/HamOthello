// Terrain and movement retain their world units; only the paint grid is finer.
export const SIZE = 25;
export const PAINT_SCALE = 2;
export const PAINT_SIZE = SIZE * PAINT_SCALE;
export function terrainCell(paintCell) {
  return (
    Math.floor(Math.floor(paintCell / PAINT_SIZE) / PAINT_SCALE) * SIZE +
    Math.floor((paintCell % PAINT_SIZE) / PAINT_SCALE)
  );
}
export function paintCellAt(x, y) {
  return Math.floor(y * PAINT_SCALE) * PAINT_SIZE + Math.floor(x * PAINT_SCALE);
}
export function terrainPaintCells(cell) {
  const start = Math.floor(cell / SIZE) * PAINT_SCALE * PAINT_SIZE + (cell % SIZE) * PAINT_SCALE;
  return [start, start + 1, start + PAINT_SIZE, start + PAINT_SIZE + 1];
}
export const STEP = 1 / 60;
export const DURATION = 30;
export const SPEED = 5.5;
export const RADIUS = 0.23;
export const GIANT_FRAMES = 300;
export const STUN_FRAMES = 60;
export const CONTACTS = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];
export const bodyScale = (p) => (p.giantFrames > 0 ? 2 : 1);
export const wallRadius = (p) => RADIUS * bodyScale(p);
export const contactRadius = (p) => 0.5 * bodyScale(p);
export const EMPTY = Object.freeze({ x: 0, y: 0 });
export const PLAYERS = [
  { name: "たくハム", color: "#aa82d0", ink: "#644185", asset: "../assets/pink-piece.png" },
  { name: "めぐハム", color: "#efc55a", ink: "#785812", asset: "../assets/cream-piece.png" },
  { name: "ノーマルハム", color: "#f19379", ink: "#944b38" },
  { name: "たぴ", color: "#59ae68", ink: "#285832" },
];
// Each field is invariant under a quarter-turn: all four starting corners have
// the same routes and area. Walls never contribute to the score.
const inside = (x, y) => x >= 1 && x <= 23 && y >= 1 && y <= 23;
export const FIELDS = [
  {
    id: "garden",
    name: "ぽかぽか広場",
    hint: "4つの花壇を、くるっと。",
    floor: (x, y) => inside(x, y) && !([7, 8, 16, 17].includes(x) && [7, 8, 16, 17].includes(y)),
  },
  {
    id: "pond",
    name: "ぐるりん池",
    hint: "真ん中の池を、ぐるり。",
    floor: (x, y) => inside(x, y) && Math.hypot(x - 12, y - 12) >= 5.2,
  },
  {
    id: "cross",
    name: "クロスロード",
    hint: "真ん中で交わる、十字の道。",
    starts: [
      [12.5, 4.5],
      [20.5, 12.5],
      [12.5, 20.5],
      [4.5, 12.5],
    ],
    floor: (x, y) => inside(x, y) && (Math.abs(x - 12) <= 3 || Math.abs(y - 12) <= 3),
  },
  {
    id: "bridges",
    name: "よつばの島",
    hint: "細い橋で、おとなりへ。",
    floor: (x, y) =>
      inside(x, y) &&
      ((Math.abs(x - 12) >= 3 && Math.abs(y - 12) >= 3) ||
        Math.abs(y - 5) <= 1 ||
        Math.abs(y - 19) <= 1 ||
        Math.abs(x - 5) <= 1 ||
        Math.abs(x - 19) <= 1),
  },
];
export function fieldById(id) {
  return FIELDS.find((f) => f.id === id) || FIELDS[0];
}
export function makeFloor(id) {
  const field = fieldById(id);
  return Array.from({ length: SIZE * SIZE }, (_, i) => field.floor(i % SIZE, Math.floor(i / SIZE)));
}
export function randomNext(seed) {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}
export function createItems(seed) {
  seed = randomNext(seed);
  const first = 300 + (seed % 301);
  seed = randomNext(seed);
  return { seed, schedule: [first, 900 + (seed % 301)], spawned: 0, potions: [] };
}
export function createGame(seed = Math.floor(Math.random() * 2 ** 32), fieldId) {
  seed >>>= 0;
  const field = fieldById(fieldId || FIELDS[seed % FIELDS.length].id);
  const floor = makeFloor(field.id);
  const paintFloor = Array.from(
    { length: PAINT_SIZE * PAINT_SIZE },
    (_, i) => floor[terrainCell(i)],
  );
  const starts = field.starts || [
    [4.5, 4.5],
    [20.5, 4.5],
    [20.5, 20.5],
    [4.5, 20.5],
  ];
  const rotation = randomNext(seed) % 4;
  return {
    fieldId: field.id,
    seed,
    floor,
    paintFloor,
    paint: paintFloor.map((v) => (v ? 0 : -1)),
    players: starts.map((_, i) => ({
      x: starts[(i + rotation) % 4][0],
      y: starts[(i + rotation) % 4][1],
      dx: 0,
      dy: 0,
      heading: 0,
      giantFrames: 0,
      stunFrames: 0,
    })),
    items: createItems(seed),
    contacts: CONTACTS.map(() => false),
    phase: "countdown",
    beforePause: "countdown",
    countdown: 180,
    frame: 0,
  };
}
export function cellAt(x, y) {
  return Math.floor(y) * SIZE + Math.floor(x);
}
export function canStand(floor, x, y, radius = RADIUS) {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < radius ||
    y < radius ||
    x > SIZE - radius ||
    y > SIZE - radius
  )
    return false;
  for (let row = Math.floor(y - radius); row <= Math.floor(y + radius); row++) {
    for (let col = Math.floor(x - radius); col <= Math.floor(x + radius); col++) {
      if (floor[row * SIZE + col]) continue;
      const nearX = Math.max(col, Math.min(col + 1, x));
      const nearY = Math.max(row, Math.min(row + 1, y));
      if (Math.hypot(x - nearX, y - nearY) < radius - 1e-8) return false;
    }
  }
  return true;
}
export function movePlayer(game, index, input = EMPTY, dt = STEP) {
  const p = game.players[index];
  if (p.stunFrames > 0) {
    p.dx = 0;
    p.dy = 0;
    return;
  }
  let x = Number.isFinite(input.x) ? Math.max(-1, Math.min(1, input.x)) : 0;
  let y = Number.isFinite(input.y) ? Math.max(-1, Math.min(1, input.y)) : 0;
  const length = Math.hypot(x, y);
  if (length > 1) {
    x /= length;
    y /= length;
  }
  const distance = SPEED * Math.max(0, Math.min(STEP, dt));
  const oldX = p.x,
    oldY = p.y;
  if (canStand(game.floor, p.x + x * distance, p.y, wallRadius(p))) p.x += x * distance;
  if (canStand(game.floor, p.x, p.y + y * distance, wallRadius(p))) p.y += y * distance;
  p.dx = (p.x - oldX) / STEP;
  p.dy = (p.y - oldY) / STEP;
  if (Math.hypot(p.dx, p.dy) > 0.01)
    p.heading = Math.abs(p.dx) >= Math.abs(p.dy) ? (p.dx >= 0 ? 0 : 2) : p.dy >= 0 ? 1 : 3;
}
export function advanceTimers(p) {
  p.giantFrames = Math.max(0, (p.giantFrames || 0) - 1);
  p.stunFrames = Math.max(0, (p.stunFrames || 0) - 1);
}
export function predictPlayer(game, index, input) {
  movePlayer(game, index, input);
  advanceTimers(game.players[index]);
}
export function growPlayer(game, index) {
  const p = game.players[index];
  p.giantFrames = GIANT_FRAMES;
  if (!canStand(game.floor, p.x, p.y, wallRadius(p))) {
    // Expansion near a wall fits inside the current floor cell. It never moves
    // the player through a wall or into a different corridor.
    const radius = wallRadius(p),
      x = Math.floor(p.x),
      y = Math.floor(p.y);
    p.x = Math.max(x + radius, Math.min(x + 1 - radius, p.x));
    p.y = Math.max(y + radius, Math.min(y + 1 - radius, p.y));
  }
}
export function updateItems(game, frame) {
  const items = game.items;
  while (items.spawned < items.schedule.length && frame >= items.schedule[items.spawned]) {
    const floor = game.floor.flatMap((yes, i) => (yes ? [i] : []));
    const open = floor.filter((i) => {
      const x = (i % SIZE) + 0.5,
        y = Math.floor(i / SIZE) + 0.5;
      return (
        game.players.every((p) => Math.hypot(p.x - x, p.y - y) >= 2) &&
        items.potions.every((p) => Math.hypot(p.x - x, p.y - y) >= 2)
      );
    });
    const choices = open.length ? open : floor;
    items.seed = randomNext(items.seed);
    const cell = choices[items.seed % choices.length];
    items.potions.push({
      id: items.spawned,
      x: (cell % SIZE) + 0.5,
      y: Math.floor(cell / SIZE) + 0.5,
    });
    items.spawned++;
  }
  items.potions = items.potions.filter((item) => {
    const candidates = game.players
      .map((p, i) => ({
        i,
        distance: Math.hypot(p.x - item.x, p.y - item.y),
        range: contactRadius(p) + 0.2,
      }))
      .filter((c) => c.distance <= c.range)
      .sort((a, b) => a.distance - b.distance);
    if (!candidates.length) return true;
    // A perfect simultaneous arrival waits for a unique nearest player.
    if (candidates[1] && Math.abs(candidates[0].distance - candidates[1].distance) < 1e-7)
      return true;
    growPlayer(game, candidates[0].i);
    return false;
  });
}
export function collidePlayers(game) {
  CONTACTS.forEach(([a, b], index) => {
    const first = game.players[a],
      second = game.players[b];
    const touching =
      Math.hypot(first.x - second.x, first.y - second.y) <
      contactRadius(first) + contactRadius(second) + (game.contacts[index] ? 0.08 : 0);
    if (touching && !game.contacts[index]) {
      first.stunFrames = second.stunFrames = STUN_FRAMES;
      first.dx = first.dy = second.dx = second.dy = 0;
    }
    // A contact must end before this pair can stun each other again. After the
    // one-second stop they can separate, rather than remaining locked together.
    game.contacts[index] = touching;
  });
}
export function paintCells(game, p) {
  const width = PAINT_SCALE * bodyScale(p);
  const left = Math.round(p.x * PAINT_SCALE) - width / 2;
  const top = Math.round(p.y * PAINT_SCALE) - width / 2;
  const cells = [];
  // A centred 2×2 / 4×4 footprint is independent of heading, so a shallow
  // diagonal never switches abruptly between horizontal and vertical brushes.
  for (let row = top; row < top + width; row++) {
    for (let col = left; col < left + width; col++) {
      if (col < 0 || row < 0 || col >= PAINT_SIZE || row >= PAINT_SIZE) continue;
      const cell = row * PAINT_SIZE + col;
      if (!game.paintFloor[cell]) continue;
      const x = (col + 0.5) / PAINT_SCALE,
        y = (row + 0.5) / PAINT_SCALE;
      const steps = Math.ceil(Math.hypot(x - p.x, y - p.y) * 8);
      let clear = true;
      // Keep paint on the player's side of a wall, including diagonal corners.
      for (let step = 1; step <= steps; step++) {
        if (
          !game.floor[cellAt(p.x + ((x - p.x) * step) / steps, p.y + ((y - p.y) * step) / steps)]
        ) {
          clear = false;
          break;
        }
      }
      if (clear) cells.push(cell);
    }
  }
  return cells;
}
export function paintUnderPlayers(game) {
  // Resolve all brushes together. Equidistant overlapping players leave the
  // existing colour intact, rather than always favouring the last player.
  const claims = new Map();
  game.players.forEach((p, player) => {
    for (const cell of paintCells(game, p)) {
      const x = ((cell % PAINT_SIZE) + 0.5) / PAINT_SCALE,
        y = (Math.floor(cell / PAINT_SIZE) + 0.5) / PAINT_SCALE;
      const distance = Math.hypot(x - p.x, y - p.y);
      const old = claims.get(cell);
      if (!old || distance < old.distance - 1e-7) claims.set(cell, { distance, player });
      else if (Math.abs(distance - old.distance) < 1e-7) old.player = -1;
    }
  });
  for (const [cell, claim] of claims) if (claim.player >= 0) game.paint[cell] = claim.player + 1;
}
export function tick(game, inputs = []) {
  if (game.phase === "countdown") {
    if (--game.countdown <= 0) {
      game.countdown = 0;
      game.phase = "playing";
    }
    return;
  }
  if (game.phase !== "playing") return;
  game.players.forEach((_, i) => movePlayer(game, i, inputs[i]));
  game.players.forEach(advanceTimers);
  updateItems(game, game.frame + 1);
  collidePlayers(game);
  paintUnderPlayers(game);
  if (++game.frame >= DURATION / STEP) {
    game.frame = DURATION / STEP;
    game.phase = "finished";
  }
}
export function pause(game) {
  if (!["countdown", "playing"].includes(game?.phase)) return false;
  game.beforePause = game.phase;
  game.phase = "paused";
  return true;
}
export function resume(game) {
  if (game?.phase !== "paused") return false;
  game.phase = game.beforePause;
  return true;
}
export function scores(game) {
  const counts = [0, 0, 0, 0];
  for (const value of game.paint) if (value > 0) counts[value - 1]++;
  const total = game.paintFloor.filter(Boolean).length;
  return counts.map((count, player) => ({ player, count, percent: (count / total) * 100 }));
}
export function winners(game) {
  const result = scores(game),
    best = Math.max(...result.map((s) => s.count));
  return result.filter((s) => s.count === best).map((s) => s.player);
}
