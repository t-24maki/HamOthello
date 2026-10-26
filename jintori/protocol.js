import {
  createGame,
  FIELDS,
  PAINT_SIZE,
  canStand,
  wallRadius,
  GIANT_FRAMES,
  STUN_FRAMES,
  DASH_FRAMES,
  DURATION,
  STEP,
  updateTerrain,
  validCharacter,
  sealedCenter,
  cellAt,
  terrainCell,
  OPEN_FRAME,
} from "./engine.js?v=20261026-jintori6";
export const PROTOCOL = "jintori-20261026-5";
export const SEND_MS = 100;
export const integer = (n, low = 0, high = 10000000) =>
  Number.isSafeInteger(n) && n >= low && n <= high;
export const validId = (id) => typeof id === "string" && id.length > 0 && id.length <= 100;
export const validInput = (input) =>
  input && [input.x, input.y].every((v) => Number.isFinite(v) && Math.abs(v) <= 1);
export function gameView(game) {
  const { seed, fieldId, phase, beforePause, countdown, frame, players, items, contacts } = game;
  return {
    seed,
    characters: [...game.characters],
    warpSeed: game.warpSeed,
    fieldId,
    phase,
    beforePause,
    countdown,
    frame,
    players: structuredClone(players),
    items: structuredClone(items),
    contacts: [...contacts],
    paint: game.paint.map((v) => (v < 0 ? "x" : String(v))).join(""),
  };
}
export function readGame(raw) {
  if (
    !raw ||
    !FIELDS.some((f) => f.id === raw.fieldId) ||
    !integer(raw.seed, 0, 2 ** 32 - 1) ||
    !["countdown", "playing", "paused", "finished"].includes(raw.phase) ||
    !["countdown", "playing"].includes(raw.beforePause) ||
    !integer(raw.countdown, 0, 180) ||
    !integer(raw.frame, 0, DURATION / STEP) ||
    !integer(raw.warpSeed, 0, 2 ** 32 - 1) ||
    !Array.isArray(raw.characters) ||
    raw.characters.length !== 4 ||
    !raw.characters.every(validCharacter) ||
    typeof raw.paint !== "string" ||
    raw.paint.length !== PAINT_SIZE * PAINT_SIZE ||
    !/^[x0-4]+$/.test(raw.paint) ||
    !Array.isArray(raw.players) ||
    raw.players.length !== 4
  )
    return null;
  const game = createGame(raw.seed, raw.fieldId, raw.characters);
  updateTerrain(game, raw.frame);
  const items = raw.items;
  if (
    !items ||
    !integer(items.seed, 0, 2 ** 32 - 1) ||
    !Array.isArray(items.schedule) ||
    items.schedule.length !== game.items.schedule.length ||
    items.schedule.some((f, i) => f !== game.items.schedule[i]) ||
    items.spawned !== game.items.schedule.filter((f) => f <= raw.frame).length ||
    !Array.isArray(items.potions) ||
    items.potions.length > items.spawned ||
    new Set(items.potions.map((p) => p?.id)).size !== items.potions.length ||
    !Array.isArray(raw.contacts) ||
    raw.contacts.length !== 6 ||
    !raw.contacts.every((c) => typeof c === "boolean")
  )
    return null;
  const initial = game.items.potions[0];
  if (initial && raw.frame < OPEN_FRAME && !items.potions.some((item) => item?.id === 0))
    return null;
  for (const item of items.potions) {
    if (
      !item ||
      !integer(item.id, 0, items.spawned - 1) ||
      !["giant", "dash"].includes(item.type) ||
      !canStand(game.floor, item.x, item.y) ||
      item.x % 1 !== 0.5 ||
      item.y % 1 !== 0.5 ||
      (initial &&
        item.id === 0 &&
        (item.x !== initial.x || item.y !== initial.y || item.type !== initial.type)) ||
      (sealedCenter(game, cellAt(item.x, item.y), raw.frame) && item.id !== 0)
    )
      return null;
  }
  const phase = raw.phase === "paused" ? raw.beforePause : raw.phase;
  if (
    (phase === "countdown" && (raw.countdown <= 0 || raw.frame !== 0)) ||
    (phase !== "countdown" && raw.countdown !== 0) ||
    (phase === "finished" ? raw.frame !== DURATION / STEP : raw.frame === DURATION / STEP)
  )
    return null;
  const paint = [...raw.paint].map((v) => (v === "x" ? -1 : Number(v)));
  if (
    paint.some(
      (v, i) =>
        (game.paintFloor[i] ? v < 0 : v !== -1) ||
        (v > 0 && sealedCenter(game, terrainCell(i), raw.frame)),
    ) ||
    (phase === "countdown" && paint.some((v) => v > 0))
  )
    return null;
  for (const p of raw.players)
    if (
      !p ||
      !integer(p.giantFrames, 0, GIANT_FRAMES) ||
      !integer(p.dashFrames, 0, DASH_FRAMES) ||
      !integer(p.warpCooldown, 0, 45) ||
      !integer(p.warpCount, 0, raw.frame) ||
      typeof p.warpLocked !== "boolean" ||
      (game.fieldId !== "warp" && (p.warpCount !== 0 || p.warpCooldown !== 0 || p.warpLocked)) ||
      !integer(p.stunFrames, 0, STUN_FRAMES) ||
      !integer(p.heading, 0, 3) ||
      (phase === "countdown" &&
        (p.giantFrames !== 0 ||
          p.stunFrames !== 0 ||
          p.dashFrames !== 0 ||
          p.warpCooldown !== 0 ||
          p.warpLocked)) ||
      !canStand(game.floor, p.x, p.y, wallRadius(p)) ||
      sealedCenter(game, cellAt(p.x, p.y), raw.frame) ||
      ![p.dx, p.dy].every((v) => Number.isFinite(v) && Math.abs(v) <= 11.01)
    )
      return null;
  return {
    ...game,
    phase: raw.phase,
    beforePause: raw.beforePause,
    countdown: raw.countdown,
    frame: raw.frame,
    warpSeed: raw.warpSeed,
    paint,
    items: {
      seed: items.seed,
      schedule: [...items.schedule],
      spawned: items.spawned,
      potions: items.potions.map(({ id, x, y, type }) => ({ id, x, y, type })),
    },
    contacts: [...raw.contacts],
    players: raw.players.map(
      ({
        x,
        y,
        dx,
        dy,
        heading,
        giantFrames,
        stunFrames,
        dashFrames,
        warpCooldown,
        warpCount,
        warpLocked,
      }) => ({
        x,
        y,
        dx,
        dy,
        heading,
        giantFrames,
        stunFrames,
        dashFrames,
        warpCooldown,
        warpCount,
        warpLocked,
      }),
    ),
  };
}
export function validState(m) {
  return (
    validId(m?.matchId) &&
    integer(m.round, 1) &&
    integer(m.epoch, 1) &&
    integer(m.serial, 1) &&
    integer(m.ackFrame) &&
    integer(m.controlAck) &&
    [m.ready, m.rematch].every(
      (flags) =>
        Array.isArray(flags) && flags.length === 2 && flags.every((v) => typeof v === "boolean"),
    )
  );
}
