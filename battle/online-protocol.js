import { CHARACTERS, createMatch, isCharacter, MATCH_TIME, STOCKS } from "./engine.js";
import { STAGES } from "./stages.js";
export const PROTOCOL = "poyon-online-20261001-3";
export const SEND_MS = 100;
export const ACTIONS = ["jump", "attack", "special"];
export const emptyEdges = () => ({ jump: 0, attack: 0, special: 0 });
const num = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
const int = (v, lo = 0, hi = 10000000) => Number.isSafeInteger(v) && v >= lo && v <= hi;
const bool = (v) => typeof v === "boolean";
export const validEdges = (e) => e && ACTIONS.every((k) => int(e[k]));
export const validId = (s) => typeof s === "string" && s.length > 0 && s.length <= 100;
export function validInput(m) {
  return (
    m &&
    int(m.seq, 1) &&
    int(m.frame) &&
    [-1, 0, 1].includes(m.move) &&
    bool(m.guard) &&
    validEdges(m.edges)
  );
}
const fighterNumbers = {
  x: [-200, 1000],
  y: [-300, 800],
  vx: [-2000, 2000],
  vy: [-1200, 1200],
  damage: [0, 999],
  shield: [0, 100],
  guardLock: [0, 2],
  stun: [0, 2],
  invincible: [0, 3],
  respawn: [0, 1],
  cooldown: [0, 1],
  specialCooldown: [0, 2],
};
const fighterFlags = ["grounded", "guarding", "airSpecial"];
function readFighter(f, base) {
  if (
    !f ||
    !isCharacter(f.character) ||
    ![-1, 1].includes(f.facing) ||
    !int(f.stocks, 0, STOCKS) ||
    !int(f.jumps, 0, 2) ||
    !fighterFlags.every((k) => bool(f[k])) ||
    !Object.entries(fighterNumbers).every(([k, [lo, hi]]) => num(f[k], lo, hi)) ||
    !(f.platformId === null || int(f.platformId, 0, 3)) ||
    !f.buffered ||
    !ACTIONS.every((k) => num(f.buffered[k], 0, 0.121))
  )
    return null;
  let attack = null;
  if (f.attack !== null) {
    const a = f.attack;
    if (
      !a ||
      !["normal", "special"].includes(a.kind) ||
      !bool(a.hit) ||
      a.duration !== CHARACTERS[f.character][a.kind].duration ||
      !num(a.age, 0, a.duration)
    )
      return null;
    attack = { kind: a.kind, hit: a.hit, duration: a.duration, age: a.age };
  }
  return {
    ...base,
    character: f.character,
    facing: f.facing,
    stocks: f.stocks,
    jumps: f.jumps,
    platformId: f.platformId,
    attack,
    buffered: Object.fromEntries(ACTIONS.map((k) => [k, f.buffered[k]])),
    ...Object.fromEntries([...Object.keys(fighterNumbers), ...fighterFlags].map((k) => [k, f[k]])),
  };
}
export function readGame(raw) {
  if (
    !raw ||
    !STAGES.some((s) => s.id === raw.stageId) ||
    !["countdown", "playing", "paused", "finished"].includes(raw.phase) ||
    !num(raw.remaining, 0, MATCH_TIME) ||
    !num(raw.elapsed, 0, MATCH_TIME + 0.01) ||
    !num(raw.countdown, 0, 2.6) ||
    !int(raw.eventId) ||
    ![null, 0, 1].includes(raw.winner) ||
    !["", "stocks", "time"].includes(raw.reason) ||
    !Array.isArray(raw.fighters) ||
    raw.fighters.length !== 2 ||
    !Array.isArray(raw.events) ||
    raw.events.length > 32
  )
    return null;
  if (raw.phase === "paused" && !["playing", "countdown"].includes(raw.beforePause)) return null;
  const g = createMatch("tak", "normal", raw.stageId);
  g.fighters = raw.fighters.map((f, i) => readFighter(f, g.fighters[i]));
  if (g.fighters.some((f) => !f)) return null;
  if (raw.phase !== "finished" && (raw.winner !== null || raw.reason !== "")) return null;
  if (
    raw.phase === "finished" &&
    (raw.reason === "" ||
      (raw.reason === "time" && raw.remaining !== 0) ||
      (raw.reason === "stocks" && g.fighters.every((f) => f.stocks > 0)))
  )
    return null;
  if (!Array.isArray(raw.effects) || raw.effects.length > 64) return null;
  const effects = [];
  for (const e of raw.effects) {
    if (
      !e ||
      !["hit", "guard", "jump", "out"].includes(e.type) ||
      !num(e.x, -200, 1000) ||
      !num(e.y, -300, 800) ||
      !num(e.life, 0, 1) ||
      !num(e.age, 0, 1) ||
      !/^#[0-9a-f]{6}$/i.test(e.color)
    )
      return null;
    effects.push({ type: e.type, x: e.x, y: e.y, life: e.life, age: e.age, color: e.color });
  }
  if (raw.phase === "finished") {
    const [a, b] = g.fighters;
    const winner =
      a.stocks !== b.stocks
        ? a.stocks > b.stocks
          ? 0
          : 1
        : a.damage !== b.damage
          ? a.damage < b.damage
            ? 0
            : 1
          : null;
    if (winner !== raw.winner) return null;
  }
  const types = ["start", "jump", "special", "swing", "break", "hit", "block", "out", "finish"];
  let prev = 0;
  const events = [];
  for (const e of raw.events) {
    if (!e || !int(e.id, 1, raw.eventId) || e.id <= prev || !types.includes(e.type)) return null;
    if (e.type === "out" && ![0, 1].includes(e.player)) return null;
    prev = e.id;
    events.push({ id: e.id, type: e.type, ...(e.type === "out" ? { player: e.player } : {}) });
  }
  Object.assign(g, {
    phase: raw.phase,
    beforePause: raw.beforePause,
    remaining: raw.remaining,
    elapsed: raw.elapsed,
    countdown: raw.countdown,
    winner: raw.winner,
    reason: raw.reason,
    eventId: raw.eventId,
    events,
    effects,
    accumulator: 0,
  });
  return g;
}
export function gameView(g) {
  const {
    stageId,
    phase,
    beforePause,
    remaining,
    elapsed,
    countdown,
    winner,
    reason,
    eventId,
    events,
    fighters,
    effects,
  } = g;
  return structuredClone({
    stageId,
    phase,
    beforePause,
    remaining,
    elapsed,
    countdown,
    winner,
    reason,
    eventId,
    events,
    fighters,
    effects,
  });
}
export function validState(m) {
  return (
    m &&
    validId(m.matchId) &&
    int(m.round, 1) &&
    int(m.epoch, 1) &&
    int(m.serial, 1) &&
    int(m.ackFrame) &&
    validEdges(m.ackEdges) &&
    int(m.controlAck) &&
    Array.isArray(m.ready) &&
    m.ready.length === 2 &&
    m.ready.every(bool) &&
    Array.isArray(m.rematch) &&
    m.rematch.length === 2 &&
    m.rematch.every(bool) &&
    num(m.echo, 0, Number.MAX_SAFE_INTEGER)
  );
}
