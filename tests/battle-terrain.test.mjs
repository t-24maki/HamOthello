import test from "node:test";
import assert from "node:assert/strict";
import { createMatch, tick, advance, pause, resume, EMPTY_INPUT } from "../battle/engine.js";
import { getStage, platformsAt, surfaceAt, mainPlatform } from "../battle/stages.js";
const empty = () => ({ ...EMPTY_INPUT });
function game(stage) {
  const g = createMatch("tak", "normal", stage);
  g.phase = "playing";
  return g;
}
function ride(g, id) {
  const p = platformsAt(getStage(g.stageId), g.elapsed)[id],
    f = g.fighters[0];
  Object.assign(f, {
    x: p.x + p.w / 2,
    y: surfaceAt(p, p.x + p.w / 2),
    vx: 0,
    vy: 0,
    grounded: true,
    platformId: id,
  });
  return f;
}
test("both directions follow the whole slope without falling, hovering or spending jumps", () => {
  const terrain = mainPlatform(getStage("meadow"));
  for (const direction of [-1, 1]) {
    const g = game("meadow"),
      f = g.fighters[0];
    Object.assign(f, { x: direction > 0 ? 150 : 650, y: 400 });
    let highest = 400;
    for (let t = 0; t < 240; t++) {
      tick(g, [{ ...empty(), move: direction }, empty()]);
      highest = Math.min(highest, f.y);
      assert.ok(f.grounded);
      assert.equal(f.y, surfaceAt(terrain, f.x));
      assert.equal(f.jumps, 0);
      if (direction > 0 ? f.x > 640 : f.x < 160) break;
    }
    assert.equal(highest, 300);
    assert.equal(f.stocks, 3);
  }
});
test("jumping from a slope detaches and lands on the new height", () => {
  const g = game("meadow"),
    f = g.fighters[0],
    base = mainPlatform(getStage("meadow"));
  Object.assign(f, { x: 275, y: surfaceAt(base, 275) });
  tick(g, [{ ...empty(), jump: true, move: 1 }, empty()]);
  assert.equal(f.grounded, false);
  for (let t = 0; t < 130; t++) tick(g, [{ ...empty(), move: t < 35 ? 1 : 0 }, empty()]);
  assert.ok(f.grounded);
  assert.equal(f.y, surfaceAt(base, f.x));
  assert.equal(f.jumps, 0);
});
test("sloped terrain allows rising through from below and landing on the top", () => {
  const g = game("meadow"),
    f = g.fighters[0];
  Object.assign(f, { x: 400, y: 375, vy: -700, grounded: false, jumps: 1 });
  tick(g);
  assert.ok(f.y > 300);
  assert.equal(f.grounded, false);
  for (let t = 0; t < 120; t++) tick(g);
  assert.equal(f.y, 300);
  assert.ok(f.grounded);
});
test("horizontal platforms carry stationary riders through a complete round trip", () => {
  for (const id of [1, 2]) {
    const g = game("cloud"),
      f = ride(g, id),
      start = f.x;
    let farthest = 0;
    for (let t = 0; t < 720; t++) {
      tick(g);
      const p = platformsAt(getStage("cloud"), g.elapsed)[id];
      assert.ok(f.grounded);
      assert.ok(Math.abs(f.x - (p.x + p.w / 2)) < 1e-7);
      assert.equal(f.y, p.y);
      farthest = Math.max(farthest, Math.abs(f.x - start));
    }
    assert.ok(farthest > 60);
    assert.ok(Math.abs(f.x - start) < 1e-6);
    assert.equal(f.stocks, 3);
  }
});
test("vertical elevator carries a rider upward and downward without losing contact", () => {
  const g = game("cloud"),
    f = ride(g, 3);
  let low = Infinity,
    high = -Infinity;
  for (let t = 0; t < 600; t++) {
    tick(g);
    const p = platformsAt(getStage("cloud"), g.elapsed)[3];
    assert.ok(f.grounded);
    assert.equal(f.y, p.y);
    assert.equal(f.jumps, 0);
    low = Math.min(low, f.y);
    high = Math.max(high, f.y);
  }
  assert.ok(high - low > 89);
  assert.equal(f.stocks, 3);
});
test("jumping away from a moving floor stops its horizontal carry immediately", () => {
  const g = game("cloud"),
    f = ride(g, 1);
  tick(g, [{ ...empty(), jump: true }, empty()]);
  const x = f.x;
  for (let t = 0; t < 25; t++) tick(g);
  assert.equal(f.grounded, false);
  assert.ok(Math.abs(f.x - x) < 1e-7);
  assert.equal(f.jumps, 1);
});
test("a rising moving floor does not trap a fighter approaching its underside", () => {
  const g = game("cloud");
  g.elapsed = 2.5;
  const p = platformsAt(getStage("cloud"), g.elapsed)[3],
    f = g.fighters[0];
  Object.assign(f, { x: 400, y: p.y + 40, vy: -700, grounded: false, jumps: 1 });
  for (let t = 0; t < 12; t++) tick(g);
  assert.equal(f.grounded, false);
  assert.ok(f.y < platformsAt(getStage("cloud"), g.elapsed)[3].y);
});
test("walking off a moving floor grants only one remaining air jump", () => {
  const g = game("cloud"),
    f = ride(g, 1);
  for (let t = 0; t < 90 && f.grounded; t++) tick(g, [{ ...empty(), move: -1 }, empty()]);
  assert.equal(f.grounded, false);
  assert.equal(f.jumps, 1);
});
test("pause freezes moving floors and their riders; resume and rematch are deterministic", () => {
  const g = game("cloud");
  ride(g, 3);
  for (let t = 0; t < 100; t++) tick(g);
  pause(g);
  const before = structuredClone(g),
    positions = platformsAt(getStage("cloud"), g.elapsed);
  for (let t = 0; t < 120; t++) tick(g);
  assert.deepEqual(g, before);
  assert.deepEqual(platformsAt(getStage("cloud"), g.elapsed), positions);
  resume(g);
  tick(g);
  assert.notEqual(g.fighters[0].y, before.fighters[0].y);
  const fresh = createMatch("tak", "normal", "cloud");
  assert.equal(fresh.elapsed, 0);
  assert.deepEqual(
    platformsAt(getStage("cloud"), fresh.elapsed),
    platformsAt(getStage("cloud"), 0),
  );
});
test("moving-floor rider physics agrees at 30, 60 and 144 rendering frames per second", () => {
  const results = [30, 60, 144].map((fps) => {
    const g = game("cloud");
    ride(g, 1);
    for (let n = 0; n < fps * 3; n++) advance(g, 1 / fps, () => [empty(), empty()]);
    return { f: g.fighters, time: g.elapsed };
  });
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[0], results[2]);
});
