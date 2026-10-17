import test from "node:test";
import assert from "node:assert/strict";
import {
  CHARACTERS,
  createMatch,
  chooseOpponent,
  isCharacter,
  hurtbox,
  tick,
  STEP,
  EMPTY_INPUT,
} from "../battle/engine.js";
import { createCPU, cpuInput } from "../battle/cpu.js";
import { readGame, gameView } from "../battle/online-protocol.js";
import { getStage, mainPlatform, platformsAt, surfaceAt } from "../battle/stages.js";

const empty = () => ({ ...EMPTY_INPUT });
function game(character, opponent = "tak", stage = "meadow") {
  const g = createMatch(character, "normal", stage, opponent);
  g.phase = "playing";
  if (stage === "meadow") {
    Object.assign(g.fighters[0], { x: 380, y: 300 });
    Object.assign(g.fighters[1], { x: 420, y: 300 });
  }
  return g;
}
function step(g, input = {}) {
  tick(g, [{ ...empty(), ...input }, empty()]);
}

test("four character IDs are validated and every other fighter can be drawn as CPU", () => {
  for (const key of Object.keys(CHARACTERS)) {
    assert.ok(isCharacter(key));
    const opponents = [0, 0.4, 0.9].map((n) => chooseOpponent(key, () => n));
    assert.equal(new Set(opponents).size, 3);
    assert.ok(!opponents.includes(key));
  }
  for (const key of [null, ["tak"], "__proto__", "constructor", "other"])
    assert.equal(isCharacter(key), false);
});

test("Ham stays large, slow and low-jumping; small Tapi moves faster than Tak", () => {
  const box = (key) => hurtbox(game(key).fighters[0]);
  assert.equal(CHARACTERS.ham.size, 1.2);
  assert.equal(CHARACTERS.tapi.size, 0.5);
  assert.ok(Math.abs(box("ham").rx - box("tak").rx * 1.2 * 1.1) < 1e-9);
  assert.ok(Math.abs(box("ham").ry - box("tak").ry * 1.2 * 1.1) < 1e-9);
  assert.ok(Math.abs(box("tapi").rx - box("tak").rx * 0.5 * 0.9) < 1e-9);
  assert.ok(Math.abs(box("tapi").ry - box("tak").ry * 0.5 * 0.9) < 1e-9);
  const measured = Object.fromEntries(
    Object.keys(CHARACTERS).map((key) => {
      const g = game(key);
      g.fighters[1].x = 700;
      step(g, { jump: true });
      let top = g.fighters[0].y;
      for (let i = 0; i < 65; i++) {
        step(g, { move: -1 });
        top = Math.min(top, g.fighters[0].y);
      }
      return [key, { height: 300 - top, distance: 380 - g.fighters[0].x }];
    }),
  );
  assert.ok(measured.ham.height < measured.tak.height && measured.ham.height < measured.meg.height);
  assert.ok(measured.ham.distance < measured.meg.distance);
  assert.ok(measured.tapi.distance > measured.tak.distance);
});
test("a grazing normal strike catches Ham's expanded body but misses Tapi's smaller body", () => {
  for (const [character, distance, expected] of [
    ["ham", 113, 8],
    ["tapi", 95, 0],
  ]) {
    const g = game("tak", character);
    Object.assign(g.fighters[0], {
      x: 350,
      attack: { kind: "normal", age: 0.1, duration: CHARACTERS.tak.normal.duration, hit: false },
    });
    g.fighters[1].x = 350 + distance;
    step(g);
    assert.equal(g.fighters[1].damage, expected);
  }
});

test("new fighters deal their own damage and knockback once per strike", () => {
  const normal = {};
  for (const character of ["ham", "tapi", "tak", "meg"]) {
    for (const [button, kind] of [
      ["attack", "normal"],
      ["special", "special"],
    ]) {
      const g = game(character);
      step(g, { [button]: true });
      for (let i = 0; i < 25 && !g.fighters[1].damage; i++) step(g);
      assert.equal(
        g.fighters[1].damage,
        CHARACTERS[character][kind].damage,
        `${character}/${kind}`,
      );
      if (kind === "normal") normal[character] = g.fighters[1].vx;
      for (let i = 0; i < 60; i++) step(g);
      assert.equal(g.fighters[1].damage, CHARACTERS[character][kind].damage);
    }
  }
  assert.ok(normal.ham > normal.meg && normal.ham > normal.tak);
  assert.ok(normal.tapi < normal.tak && normal.tapi < normal.meg);
});

test("Tapi gets four jump presses, rejects a fifth, and recharges on landing", () => {
  for (const character of Object.keys(CHARACTERS)) {
    const g = game(character);
    g.fighters[1].x = 700;
    const f = g.fighters[0],
      max = character === "tapi" ? 4 : 2;
    for (let jump = 1; jump <= max; jump++) {
      step(g, { jump: true });
      assert.equal(f.jumps, jump);
      assert.ok(f.vy < -400);
      for (let i = 0; i < 10; i++) step(g);
    }
    const before = f.vy;
    step(g, { jump: true });
    assert.equal(f.jumps, max);
    assert.ok(f.vy > before);
    for (let i = 0; i < 360 && !f.grounded; i++) step(g);
    assert.equal(f.grounded, true);
    assert.equal(f.jumps, 0);
    step(g, { jump: true });
    assert.equal(f.jumps, 1);
  }
});

test("walking off a ledge leaves Tapi three air jumps, not four new jumps", () => {
  const g = game("tapi", "tak", "hill"),
    f = g.fighters[0],
    base = mainPlatform(getStage("hill"));
  Object.assign(f, { x: base.x + base.w - 1, y: base.y, vx: CHARACTERS.tapi.speed });
  for (let i = 0; i < 20 && f.grounded; i++) step(g, { move: 1 });
  assert.equal(f.grounded, false);
  assert.equal(f.jumps, 1);
});

function collision(kind, airborne = false, seat = 1, stage = "meadow") {
  const g = game(seat ? "ham" : "tapi", seat ? "tapi" : "ham", stage);
  const d = g.fighters[seat],
    a = g.fighters[1 - seat];
  const floor =
    stage === "cloud" ? platformsAt(getStage(stage), 0)[3] : mainPlatform(getStage(stage));
  d.x = floor.x + floor.w / 2;
  d.y = surfaceAt(floor, d.x) - (airborne ? 10 : 0);
  d.grounded = !airborne;
  d.platformId = airborne ? null : floor.id;
  a.x = d.x + (seat ? -20 : 20);
  a.y = surfaceAt(floor, a.x);
  a.facing = seat ? 1 : -1;
  a.attack = { kind, age: 0.12, duration: CHARACTERS.ham[kind].duration, hit: false };
  tick(g);
  return { g, a, d };
}
test("grounded Tapi avoids specials on slopes and moving floors from either seat", () => {
  for (const stage of ["hill", "meadow", "cloud"])
    for (const seat of [0, 1]) {
      const { a, d } = collision("special", false, seat, stage);
      assert.equal(d.grounded, true);
      assert.equal(d.damage, 0);
      assert.equal(d.stun, 0);
      assert.equal(d.shield, 100);
      assert.equal(a.attack.hit, false);
    }
});
test("Tapi still takes normal hits on the floor and special hits in the air", () => {
  for (const seat of [0, 1]) {
    assert.equal(collision("normal", false, seat).d.damage, 14);
    assert.equal(collision("special", true, seat).d.damage, 22);
  }
});
test("Tapi loses special immunity the moment it jumps", () => {
  const { g, a, d } = collision("special");
  tick(g, [empty(), { ...empty(), jump: true }]);
  assert.equal(d.damage, 22);
  assert.equal(a.attack.hit, true);
});
test("four-jump snapshots round-trip, while excess jumps are rejected per character", () => {
  for (const character of Object.keys(CHARACTERS)) {
    const g = game(character),
      f = g.fighters[0];
    f.grounded = false;
    f.jumps = CHARACTERS[character].maxJumps;
    assert.equal(readGame(gameView(g)).fighters[0].jumps, f.jumps);
    f.jumps++;
    assert.equal(readGame(gameView(g)), null);
  }
});
test("Tapi CPU uses its third and fourth jumps to recover; exhausted jumps do not repeat", () => {
  for (const used of [2, 3, 4]) {
    const g = game("tapi", "tak", "hill"),
      f = g.fighters[0];
    Object.assign(f, { x: 70, y: 450, vy: 100, grounded: false, jumps: used, airSpecial: true });
    const input = cpuInput(
      g,
      createCPU(() => 0.5),
      STEP,
      0,
    );
    assert.equal(input.jump, used < 4);
  }
});
test("CPU uses normal attacks instead of wasting specials against grounded Tapi", () => {
  const g = game("ham", "tapi"),
    input = cpuInput(
      g,
      createCPU(() => 0.01),
      STEP,
      0,
    );
  assert.equal(input.special, false);
  assert.equal(input.attack, true);
});
