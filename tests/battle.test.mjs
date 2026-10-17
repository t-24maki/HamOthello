import test from "node:test";
import assert from "node:assert/strict";
import { createMatch, tick, STEP, EMPTY_INPUT, advance, pause, resume } from "../battle/engine.js";
import { createCPU, cpuInput } from "../battle/cpu.js";
import { createInput } from "../battle/input.js";
import {
  STAGES,
  mainPlatform,
  stageBounds,
  platformsAt,
  surfaceAt,
  spawnPoint,
  supports,
} from "../battle/stages.js";
const empty = () => ({ ...EMPTY_INPUT });
function playing(char = "tak") {
  const g = createMatch(char);
  g.phase = "playing";
  return g;
}
function run(g, seconds, inputs = [empty(), empty()]) {
  for (let i = 0; i < Math.round(seconds / STEP); i++)
    tick(g, typeof inputs === "function" ? inputs() : inputs);
}
function sparring(damage = 0) {
  const g = playing();
  Object.assign(g.fighters[0], { x: 350 });
  Object.assign(g.fighters[1], { x: 415, damage });
  return g;
}
function punch(g, special = false) {
  tick(g, [{ ...empty(), [special ? "special" : "attack"]: true }, empty()]);
  run(g, 0.12);
}
const seeded =
  (n = 1) =>
  () =>
    (n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 2 ** 32;
test("both characters are selectable; their opponent is always the other hamster", () => {
  for (const character of ["tak", "meg"]) {
    const g = createMatch(character);
    assert.equal(g.fighters[0].character, character);
    assert.notEqual(g.fighters[1].character, character);
    assert.deepEqual(
      g.fighters.map((f) => f.stocks),
      [3, 3],
    );
    assert.equal(g.remaining, 120);
  }
});
test("countdown never runs the clock or moves fighters and then starts", () => {
  const g = createMatch();
  run(g, 2, [{ ...empty(), move: 1 }, empty()]);
  assert.equal(g.remaining, 120);
  assert.equal(g.fighters[0].x, 250);
  run(g, 0.7);
  assert.equal(g.phase, "playing");
});
test("air jump has a two-jump limit and landing recharges it", () => {
  const g = playing(),
    f = g.fighters[0];
  tick(g, [{ ...empty(), jump: true }, empty()]);
  assert.equal(f.jumps, 1);
  run(g, 0.16);
  tick(g, [{ ...empty(), jump: true }, empty()]);
  assert.equal(f.jumps, 2);
  f.vy = 10;
  tick(g, [{ ...empty(), jump: true }, empty()]);
  assert.ok(f.vy > 0);
  run(g, 2);
  assert.ok(f.grounded);
  assert.equal(f.jumps, 0);
});
test("walking off the edge leaves one air jump and falling crosses the lower blast line", () => {
  const g = playing(),
    f = g.fighters[0];
  Object.assign(f, { x: 686, vx: 300 });
  tick(g, [{ ...empty(), move: 1 }, empty()]);
  assert.equal(f.grounded, false);
  assert.equal(f.jumps, 1);
  run(g, 2);
  assert.equal(f.stocks, 2);
});
test("one-way platforms permit rising through and landing on the upper face", () => {
  const g = playing(),
    f = g.fighters[0];
  Object.assign(f, { x: 270, y: 340, vy: -650, grounded: false, jumps: 1 });
  run(g, 0.7);
  assert.equal(f.y, 260);
  assert.ok(f.grounded);
});
test("normal attack increases damage once per swing, in front of the fighter", () => {
  const g = sparring();
  punch(g);
  assert.equal(g.fighters[1].damage, 8);
  run(g, 0.2);
  assert.equal(g.fighters[1].damage, 8);
  const back = sparring();
  back.fighters[0].facing = -1;
  punch(back);
  assert.equal(back.fighters[1].damage, 0);
});
test("higher damage causes stronger horizontal and vertical knockback", () => {
  const low = sparring(),
    high = sparring(85);
  punch(low);
  punch(high);
  assert.ok(high.fighters[1].vx > low.fighters[1].vx);
  assert.ok(high.fighters[1].vy < low.fighters[1].vy);
});
test("Tak's special lifts the fighter, deals 13 damage, and cannot repeat before landing", () => {
  const g = sparring();
  punch(g, true);
  assert.equal(g.fighters[1].damage, 13);
  assert.ok(g.fighters[0].vy < 0);
  assert.ok(g.fighters[0].airSpecial);
  Object.assign(g.fighters[0], { specialCooldown: 0, attack: null, vy: 20 });
  tick(g, [{ ...empty(), special: true }, empty()]);
  assert.equal(g.fighters[0].attack, null);
  assert.ok(g.fighters[0].vy > 0);
});
test("shield blocks damage but loses energy, cannot be held indefinitely, and recovers", () => {
  const g = sparring(),
    f = g.fighters[1];
  tick(g, [
    { ...empty(), attack: true },
    { ...empty(), guard: true },
  ]);
  run(g, 0.16, [empty(), { ...empty(), guard: true }]);
  assert.equal(f.damage, 0);
  assert.ok(f.shield < 80);
  run(g, 2.5, [empty(), { ...empty(), guard: true }]);
  assert.ok(f.guardLock > 0);
  assert.ok(f.stun > 0);
  run(g, 1.5);
  assert.ok(f.shield > 20);
  assert.equal(f.guardLock, 0);
});
test("guard is unavailable in the air or during an attack", () => {
  const g = playing(),
    f = g.fighters[0];
  Object.assign(f, { grounded: false, y: 100 });
  tick(g, [{ ...empty(), guard: true }, empty()]);
  assert.equal(f.guarding, false);
  Object.assign(f, {
    grounded: true,
    y: 370,
    attack: { kind: "normal", age: 0, duration: 0.29, hit: false },
  });
  tick(g, [{ ...empty(), guard: true }, empty()]);
  assert.equal(f.guarding, false);
});
test("opposing simultaneous attacks both hit without side priority", () => {
  const g = sparring();
  tick(g, [
    { ...empty(), attack: true },
    { ...empty(), attack: true },
  ]);
  run(g, 0.12);
  assert.deepEqual(
    g.fighters.map((f) => f.damage),
    [10, 8],
  );
  assert.deepEqual(
    g.fighters.map((f) => f.attack),
    [null, null],
  );
});
test("respawn consumes exactly one stock, resets damage, and grants temporary protection", () => {
  const g = playing(),
    f = g.fighters[0];
  Object.assign(f, { x: -95, damage: 160 });
  tick(g);
  assert.equal(f.stocks, 2);
  assert.equal(f.damage, 0);
  assert.ok(f.respawn > 0);
  run(g, 0.5);
  assert.equal(f.stocks, 2);
  assert.ok(f.invincible > 0);
  const x = f.x;
  tick(g, [{ ...empty(), move: 1, attack: true }, empty()]);
  assert.equal(f.x, x);
});
test("respawn protection prevents hits and attacking gives up that protection", () => {
  const g = sparring();
  g.fighters[1].invincible = 1;
  punch(g);
  assert.equal(g.fighters[1].damage, 0);
  tick(g, [empty(), { ...empty(), attack: true }]);
  assert.equal(g.fighters[1].damage, 8);
  assert.ok(g.fighters[1].invincible <= 0.12);
});
test("any blast boundary removes a stock", () => {
  for (const pos of [{ x: -95 }, { x: 895 }, { y: -205 }, { y: 615 }]) {
    const g = playing();
    Object.assign(g.fighters[0], pos, { grounded: false });
    tick(g);
    assert.equal(g.fighters[0].stocks, 2);
  }
});
test("last stock ends the match and further simulation cannot change the result", () => {
  const g = playing();
  Object.assign(g.fighters[0], { stocks: 1, y: 620 });
  tick(g);
  assert.equal(g.phase, "finished");
  assert.equal(g.winner, 1);
  const before = structuredClone(g);
  run(g, 3);
  assert.deepEqual(g, before);
});
test("simultaneous final-stock falls are a draw", () => {
  const g = playing();
  for (const f of g.fighters) Object.assign(f, { stocks: 1, y: 620 });
  tick(g);
  assert.equal(g.phase, "finished");
  assert.equal(g.winner, null);
});
test("time limit compares stocks first, then damage, then declares a draw", () => {
  for (const [stocks, damage, winner] of [
    [3, 200, 0],
    [2, 0, 1],
    [3, 0, null],
    [3, 8, 1],
  ]) {
    const g = playing();
    g.remaining = STEP / 2;
    Object.assign(g.fighters[0], { stocks, damage });
    if (stocks === 3 && damage === 200) g.fighters[1].stocks = 2;
    tick(g);
    assert.equal(g.winner, winner);
    assert.equal(g.reason, "time");
    assert.equal(g.remaining, 0);
  }
});
test("pause freezes physics, countdown, effects and time; resume continues the previous phase", () => {
  for (const phase of ["countdown", "playing"]) {
    const g = createMatch();
    g.phase = phase;
    assert.ok(pause(g));
    const before = structuredClone(g);
    run(g, 2);
    assert.deepEqual(g, before);
    assert.ok(resume(g));
    assert.equal(g.phase, phase);
  }
});
test("fresh rematch resets stocks, damage, cooldowns and timer", () => {
  const old = playing("meg");
  Object.assign(old.fighters[0], { stocks: 1, damage: 99, airSpecial: true });
  old.remaining = 2;
  const next = createMatch(old.fighters[0].character, "hard");
  assert.equal(next.fighters[0].character, "meg");
  assert.equal(next.fighters[0].damage, 0);
  assert.equal(next.fighters[0].stocks, 3);
  assert.equal(next.remaining, 120);
  assert.equal(next.phase, "countdown");
});
test("fixed-step outcome is identical at 30, 60 and 144 rendered frames per second", () => {
  const snapshots = [30, 60, 144].map((fps) => {
    const g = playing();
    for (let i = 0; i < fps * 2; i++) advance(g, 1 / fps, () => [empty(), empty()]);
    return { fighters: g.fighters, remaining: g.remaining, elapsed: g.elapsed };
  });
  assert.deepEqual(snapshots[0], snapshots[1]);
  assert.deepEqual(snapshots[0], snapshots[2]);
});
test("invalid or excessive elapsed time cannot fast-forward or poison physics", () => {
  const g = playing();
  for (const t of [NaN, Infinity, -1]) advance(g, t, () => [empty(), empty()]);
  assert.equal(g.remaining, 120);
  advance(g, 20, () => [empty(), empty()]);
  assert.ok(g.remaining > 119.8);
});
test("input retains short taps until a simulation tick and key-repeat does not add jumps", () => {
  const input = createInput();
  input.press("key:Space", "jump");
  input.press("key:Space", "jump");
  input.release("key:Space");
  const g = playing();
  advance(g, 1 / 240, () => [input.consume(), empty()]);
  assert.equal(g.fighters[0].jumps, 0);
  advance(g, 1 / 240, () => [input.consume(), empty()]);
  assert.equal(g.fighters[0].jumps, 1);
  assert.equal(input.consume().jump, false);
});
test("multi-touch movement and jump combine, releasing one source preserves others", () => {
  const input = createInput();
  input.press("pointer:1", "right");
  input.press("key:D", "right");
  input.press("pointer:2", "jump");
  assert.deepEqual(input.consume(), {
    move: 1,
    jump: true,
    attack: false,
    special: false,
    guard: false,
  });
  input.release("pointer:1");
  assert.equal(input.consume().move, 1);
  input.press("pointer:3", "guard");
  input.clear();
  assert.deepEqual(input.consume(), empty());
});
test("all CPU levels approach and hit an idle player in an actual match", () => {
  for (const level of ["easy", "normal", "hard"]) {
    const g = playing();
    g.difficulty = level;
    const brain = createCPU(seeded(42));
    run(g, 12, () => [empty(), cpuInput(g, brain, STEP)]);
    assert.ok(g.fighters[0].damage > 0 || g.fighters[0].stocks < 3, level);
    assert.ok(g.fighters.every((f) => Number.isFinite(f.x) && Number.isFinite(f.y)));
  }
});
test("CPU returns toward stage with jumps and special instead of chasing off the edge", () => {
  for (const x of [90, 710]) {
    const g = playing(),
      brain = createCPU(seeded());
    Object.assign(g.fighters[1], { x, y: 400, vy: 100, grounded: false, jumps: 1 });
    let control = cpuInput(g, brain, STEP);
    assert.equal(control.move, x < 400 ? 1 : -1);
    assert.ok(control.jump);
    g.fighters[1].jumps = 2;
    brain.jumpWait = 0;
    control = cpuInput(g, brain, STEP);
    assert.ok(control.special);
  }
});
test("CPU vs CPU matches finish without invalid physics or unbounded effects", () => {
  for (const level of ["easy", "normal", "hard"]) {
    const g = playing();
    g.difficulty = level;
    const brains = [createCPU(seeded(12)), createCPU(seeded(84))];
    run(g, 123, () => brains.map((b, i) => cpuInput(g, b, STEP, i)));
    assert.equal(g.phase, "finished", level);
    assert.ok(g.effects.length < 50);
    assert.ok(g.fighters.every((f) => Number.isFinite(f.x) && f.stocks >= 0));
  }
});
test("CPU can route from directly below the high platform to an elevated opponent", () => {
  const g = playing(),
    brain = createCPU(seeded(91));
  Object.assign(g.fighters[0], { x: 400, y: 165 });
  Object.assign(g.fighters[1], { x: 400, y: 370 });
  run(g, 15, () => [empty(), cpuInput(g, brain, STEP)]);
  assert.ok(g.fighters[0].damage > 0 || g.fighters[0].stocks < 3);
});
test("CPU leaves an upper platform to pursue an opponent below", () => {
  const g = playing(),
    brain = createCPU(seeded(12));
  Object.assign(g.fighters[0], { x: 400, y: 370 });
  Object.assign(g.fighters[1], { x: 400, y: 165 });
  run(g, 12, () => [empty(), cpuInput(g, brain, STEP)]);
  assert.ok(g.fighters[0].damage > 0 || g.fighters[0].stocks < 3);
});

// Gameplay regressions: measure complete trajectories, not just the force formula.
function flight(damage, special = false, stageId = "hill") {
  const g = createMatch("tak", "normal", stageId);
  g.phase = "playing";
  Object.assign(g.fighters[0], { x: 335 });
  Object.assign(g.fighters[1], { x: 400, damage });
  tick(g, [{ ...empty(), [special ? "special" : "attack"]: true }, empty()]);
  let maxX = 400;
  for (let i = 0; i < 180; i++) {
    tick(g);
    if (g.fighters[1].stocks < 3) break;
    maxX = Math.max(maxX, g.fighters[1].x);
  }
  return { distance: maxX - 400, out: g.fighters[1].stocks < 3 };
}
test("low damage makes short recoverable nudges while high damage can launch offstage", () => {
  for (const special of [false, true]) {
    const low = flight(0, special),
      medium = flight(60, special),
      high = flight(100, special);
    assert.ok(low.distance < (special ? 80 : 45));
    assert.equal(low.out, false);
    assert.equal(medium.out, false);
    assert.ok(medium.distance > low.distance * 2.5);
    assert.ok(high.distance > medium.distance * 1.8);
    assert.equal(high.out, true);
  }
});
test("knockback grows continuously over the playable damage range without a threshold cliff", () => {
  for (const special of [false, true]) {
    let lastVX = 0,
      lastVY = 0;
    for (let damage = 0; damage <= 150; damage += 5) {
      const g = sparring(damage);
      punch(g, special);
      const f = g.fighters[1];
      assert.ok(f.vx > lastVX);
      assert.ok(-f.vy > lastVY);
      if (lastVX) assert.ok(f.vx - lastVX < 90);
      lastVX = f.vx;
      lastVY = -f.vy;
    }
  }
});
test("six distinct stages spawn both characters safely, with a safe fallback for unknown ids", () => {
  assert.equal(STAGES.length, 6);
  assert.equal(new Set(STAGES.map((s) => JSON.stringify(s.platforms))).size, 6);
  assert.equal(createMatch("tak", "normal", "missing").stageId, "hill");
  for (const stage of STAGES)
    for (const character of ["tak", "meg"]) {
      const g = createMatch(character, "normal", stage.id);
      g.phase = "playing";
      run(g, 2);
      assert.equal(g.stageId, stage.id);
      assert.ok(
        g.fighters.every(
          (f) =>
            f.stocks === 3 &&
            f.grounded &&
            platformsAt(stage, g.elapsed).some(
              (p) => supports(p, f.x) && f.y === surfaceAt(p, f.x),
            ),
        ),
      );
    }
});
test("every selected platform catches descending fighters at its displayed height", () => {
  for (const stage of STAGES)
    for (const platform of stage.platforms) {
      const g = createMatch("tak", "normal", stage.id);
      g.phase = "playing";
      const f = g.fighters[0];
      Object.assign(f, {
        x: platform.x + platform.w / 2,
        y: surfaceAt(platform, platform.x + platform.w / 2) - 20,
        vy: 120,
        grounded: false,
      });
      run(g, 0.2);
      assert.equal(
        f.y,
        surfaceAt(
          platformsAt(stage, g.elapsed).find((p) => p.id === platform.id),
          f.x,
        ),
        `${stage.id}: ${platform.id}`,
      );
      assert.ok(f.grounded);
    }
});
test("the slope stage has no invisible platforms inherited from the hill", () => {
  for (const id of ["hill", "meadow"]) {
    const g = createMatch("tak", "normal", id);
    g.phase = "playing";
    Object.assign(g.fighters[0], { x: 270, y: 240, vy: 100, grounded: false });
    run(g, 0.6);
    assert.equal(g.fighters[0].y, id === "hill" ? 260 : 360);
  }
});
test("falling, respawning and rematching preserve the selected terrain", () => {
  for (const stage of STAGES) {
    const g = createMatch("meg", "hard", stage.id);
    g.phase = "playing";
    Object.assign(g.fighters[0], { x: -95, damage: 120 });
    tick(g);
    run(g, 2.5);
    assert.equal(g.stageId, stage.id);
    assert.equal(g.fighters[0].stocks, 2);
    assert.ok(g.fighters[0].grounded);
    assert.ok(
      platformsAt(stage, g.elapsed).some((p) => surfaceAt(p, g.fighters[0].x) === g.fighters[0].y),
    );
    const next = createMatch(g.fighters[0].character, g.difficulty, g.stageId);
    assert.equal(next.stageId, stage.id);
    assert.equal(next.fighters[0].stocks, 3);
    assert.equal(next.fighters[0].y, spawnPoint(stage, 0).y);
  }
});
test("CPU reaches opponents on every terrace and descends to the main stage", () => {
  for (const stage of STAGES)
    for (const p of stage.platforms)
      for (const above of [true, false]) {
        const g = createMatch("tak", "normal", stage.id);
        g.phase = "playing";
        const b = createCPU(seeded(53));
        Object.assign(g.fighters[above ? 0 : 1], {
          x: p.x + p.w / 2,
          y: surfaceAt(p, p.x + p.w / 2),
        });
        const x = stage.id === "islands" ? stage.spawns[0] : 400;
        Object.assign(g.fighters[above ? 1 : 0], { x, y: surfaceAt(mainPlatform(stage), x) });
        run(g, 20, () => [empty(), cpuInput(g, b, STEP)]);
        assert.ok(
          g.fighters[0].damage > 0 || g.fighters[0].stocks < 3,
          `${stage.id} ${p.y} ${above}`,
        );
      }
});
test("CPU can recover from both sides using each stage actual boundaries", () => {
  for (const stage of STAGES)
    for (const side of [-1, 1]) {
      const g = createMatch("tak", "normal", stage.id);
      g.phase = "playing";
      const b = createCPU(seeded(11)),
        base = stageBounds(stage),
        f = g.fighters[1];
      Object.assign(f, {
        x: side < 0 ? base.x - 60 : base.x + base.w + 60,
        y: base.y + 10,
        vy: 50,
        jumps: 1,
        grounded: false,
      });
      let returned = false;
      for (let t = 0; t < 720; t++) {
        tick(g, [empty(), cpuInput(g, b, STEP)]);
        if (f.grounded) {
          returned = true;
          break;
        }
      }
      assert.equal(f.stocks, 3, stage.id);
      assert.ok(returned, stage.id);
    }
});
test("all stage and difficulty combinations complete CPU matches with valid state", () => {
  for (const stage of STAGES)
    for (const level of ["easy", "normal", "hard"]) {
      const g = createMatch("meg", level, stage.id);
      g.phase = "playing";
      const brains = [createCPU(seeded(29)), createCPU(seeded(92))];
      run(g, 123, () => brains.map((b, i) => cpuInput(g, b, STEP, i)));
      assert.equal(g.phase, "finished", `${stage.id} ${level}`);
      assert.ok(
        g.fighters.every((f) => Number.isFinite(f.x) && Number.isFinite(f.y) && f.stocks >= 0),
      );
      assert.equal(g.stageId, stage.id);
    }
});

test("easy CPU approaches at a gentler pace and leaves a response window after attacking", () => {
  const distance = {};
  for (const difficulty of ["easy", "normal"]) {
    const g = createMatch("tak", difficulty, "meadow", "tak");
    g.phase = "playing";
    const brain = createCPU(seeded(22));
    run(g, 0.8, () => [empty(), cpuInput(g, brain, STEP)]);
    distance[difficulty] = 620 - g.fighters[1].x;
  }
  assert.ok(distance.easy < distance.normal * 0.75);
  assert.ok(distance.easy > 0);
  const g = createMatch("tak", "easy", "meadow");
  g.phase = "playing";
  Object.assign(g.fighters[0], { x: 370, y: 300 });
  Object.assign(g.fighters[1], { x: 435, y: 300 });
  const brain = createCPU(seeded(3));
  const first = cpuInput(g, brain, STEP);
  assert.ok(first.attack || first.special);
  assert.ok(brain.attackWait > 1);
  assert.ok(brain.restTime >= 0.45);
  for (let i = 0; i < 45; i++) assert.deepEqual(cpuInput(g, brain, STEP), empty());
  Object.assign(g.fighters[1], { x: 40, y: 450, grounded: false, jumps: 1, vy: 0 });
  const rescue = cpuInput(g, brain, STEP);
  assert.equal(rescue.move, 1);
  assert.equal(rescue.jump, true);
});
