import {
  CHARACTERS,
  createMatch,
  isCharacter,
  MATCH_TIME,
  STOCKS,
  matchWinner,
} from "./engine.js?v=20261021-battle21";
import { STAGES } from "./stages.js?v=20261021-battle21";
import { GIANT_DURATION } from "./items.js?v=20261021-battle21";
export const PROTOCOL = "poyon-online-20261021-12";
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
  giantTime: [0, GIANT_DURATION],
};
const fighterFlags = ["grounded", "guarding", "airSpecial", "giant"];
function readFighter(f, base, stage, index, count) {
  if (
    !f ||
    !isCharacter(f.character) ||
    ![-1, 1].includes(f.facing) ||
    !int(f.stocks, 0, STOCKS) ||
    !int(f.jumps, 0, CHARACTERS[f.character].maxJumps) ||
    !fighterFlags.every((k) => bool(f[k])) ||
    f.giant !== f.giantTime > 0 ||
    !Object.entries(fighterNumbers).every(([k, [lo, hi]]) => num(f[k], lo, hi)) ||
    !(f.platformId === null || stage.platforms.some((p) => p.id === f.platformId)) ||
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
    if (a.hitTargets !== undefined) {
      if (
        !Array.isArray(a.hitTargets) ||
        a.hitTargets.length > count - 1 ||
        !a.hitTargets.every((i) => int(i, 0, count - 1) && i !== index) ||
        new Set(a.hitTargets).size !== a.hitTargets.length ||
        a.hit !== a.hitTargets.length > 0
      )
        return null;
      attack.hitTargets = [...a.hitTargets];
    }
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
  const count = Array.isArray(raw?.fighters) ? raw.fighters.length : 0;
  if (
    !raw ||
    !STAGES.some((s) => s.id === raw.stageId) ||
    !["countdown", "playing", "paused", "finished"].includes(raw.phase) ||
    !num(raw.remaining, 0, MATCH_TIME) ||
    !num(raw.elapsed, 0, MATCH_TIME + 0.01) ||
    !num(raw.countdown, 0, 2.6) ||
    !int(raw.eventId) ||
    !(raw.winner === null || int(raw.winner, 0, count - 1)) ||
    !["easy", "normal", "hard"].includes(raw.difficulty) ||
    !["", "stocks", "time"].includes(raw.reason) ||
    !Array.isArray(raw.fighters) ||
    ![2, 4].includes(count) ||
    !Array.isArray(raw.events) ||
    raw.events.length > 32
  )
    return null;
  const items = raw.items;
  if (!items || !int(items.seed, 0, 2 ** 32 - 1) || !num(items.wait, 0, 20)) return null;
  let potion = null;
  if (items.potion !== null) {
    const p = items.potion;
    if (
      !p ||
      !num(p.x, -200, 1000) ||
      !num(p.y, -18, 600) ||
      !num(p.vy, 0, 240) ||
      !(
        p.platformId === null ||
        STAGES.find((s) => s.id === raw.stageId).platforms.some(
          (floor) => floor.id === p.platformId,
        )
      ) ||
      items.wait !== 0
    )
      return null;
    potion = { x: p.x, y: p.y, vy: p.vy, platformId: p.platformId };
  }
  if (raw.phase === "paused" && !["playing", "countdown"].includes(raw.beforePause)) return null;
  const g = createMatch(
    "tak",
    raw.difficulty,
    raw.stageId,
    undefined,
    0,
    count === 4 ? ["ham", "tapi"] : [],
  );
  g.fighters = raw.fighters.map((f, i) =>
    readFighter(
      f,
      g.fighters[i],
      STAGES.find((s) => s.id === raw.stageId),
      i,
      count,
    ),
  );
  if (g.fighters.some((f) => !f)) return null;
  if (raw.phase !== "finished" && (raw.winner !== null || raw.reason !== "")) return null;
  if (
    raw.phase === "finished" &&
    (raw.reason === "" ||
      (raw.reason === "time" && raw.remaining !== 0) ||
      (raw.reason === "stocks" && g.fighters.filter((f) => f.stocks > 0).length > 1))
  )
    return null;
  if (!Array.isArray(raw.effects) || raw.effects.length > 64) return null;
  const effects = [];
  for (const e of raw.effects) {
    if (
      !e ||
      !["hit", "guard", "jump", "out", "grow"].includes(e.type) ||
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
    if (matchWinner(g.fighters) !== raw.winner) return null;
  }
  const types = [
    "start",
    "jump",
    "special",
    "swing",
    "break",
    "hit",
    "block",
    "out",
    "finish",
    "grow",
  ];
  let prev = 0;
  const events = [];
  for (const e of raw.events) {
    if (!e || !int(e.id, 1, raw.eventId) || e.id <= prev || !types.includes(e.type)) return null;
    if (e.type === "out" && !int(e.player, 0, count - 1)) return null;
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
    items: { seed: items.seed, wait: items.wait, potion },
    accumulator: 0,
  });
  return g;
}
export function gameView(g) {
  const {
    stageId,
    difficulty,
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
    items,
  } = g;
  return structuredClone({
    stageId,
    difficulty,
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
    items,
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
