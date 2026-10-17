import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  startGame,
  launch,
  advance,
  ballsLeft,
  cueBall,
  canPlaceCue,
  findCuePlacement,
  placeCue,
  CENTER,
  BALL_RADIUS,
  TABLE_RADIUS,
  POCKET_RADIUS,
  MAX_SPEED,
  MAX_DRAG,
  FIXED_STEP,
  TURNS,
} from "../billiards/physics.js";
function random(seed) {
  return () => (seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 2 ** 32;
}
function ball(id, owner, x, y) {
  return { id, kind: owner === null ? "cue" : "color", owner, x, y, vx: 0, vy: 0, active: true };
}
function fixture(balls = [ball(0, null, 300, 360), ball(1, 0, 440, 440), ball(2, 1, 430, 290)]) {
  const g = createGame(random(41));
  g.balls = balls;
  startGame(g);
  return g;
}
function settle(g) {
  for (let i = 0; i < 3000 && g.phase === "moving"; i++) advance(g, 1 / 120);
  assert.notEqual(g.phase, "moving");
}
function scratch(g, points = 5) {
  const p = g.pockets.find((p) => p.points === points);
  Object.assign(cueBall(g), { x: p.x, y: p.y });
  assert.ok(launch(g, 0, 15, 0));
  settle(g);
}
test("openings have one centered white cue, five colors each, no black balls, and clear spacing", () => {
  for (const g of [
    ...Array.from({ length: 100 }, (_, seed) => createGame(random(seed))),
    createGame(() => 0),
  ]) {
    assert.equal(g.phase, "ready");
    assert.equal(g.balls.length, 11);
    assert.equal(ballsLeft(g, 0), 5);
    assert.equal(ballsLeft(g, 1), 5);
    assert.equal(ballsLeft(g, null), 0);
    assert.deepEqual(
      g.balls.filter((b) => b.kind === "cue"),
      [cueBall(g)],
    );
    assert.equal(cueBall(g).x, CENTER);
    assert.equal(cueBall(g).y, CENTER);
    assert.deepEqual(
      g.pockets.map((p) => p.points).sort((a, b) => a - b),
      [-1, 1, 2, 3, 4, 5],
    );
    for (const b of g.balls) {
      assert.ok(g.pockets.every((p) => Math.hypot(p.x - b.x, p.y - b.y) > 80));
      for (const other of g.balls)
        if (b !== other) assert.ok(Math.hypot(b.x - other.x, b.y - other.y) >= 52 - 1e-8);
    }
  }
});
test("balls and all pockets are 1.5 times larger, with equal +/-1 and smaller high-score pockets", () => {
  const g = createGame(random(1));
  const radius = (points) => g.pockets.find((p) => p.points === points).radius;
  assert.equal(radius(-1), POCKET_RADIUS);
  assert.equal(radius(1), POCKET_RADIUS);
  assert.equal(BALL_RADIUS, 21);
  for (const points of [-1, 1, 2, 3, 4, 5])
    assert.equal(radius(points), (24 - Math.max(0, points - 1) * 2.5) * 1.5);
  for (let points = 2; points <= 5; points++) assert.ok(radius(points) < radius(points - 1));
});
test("both players shoot the same white cue and cannot directly shoot either color", () => {
  for (const owner of [0, 1]) {
    const g = fixture();
    g.turn = owner;
    const before = structuredClone(g);
    for (const b of g.balls.filter((b) => b.kind === "color"))
      assert.equal(launch(g, b.id, 60, 0), false);
    assert.deepEqual(g, before);
    assert.ok(launch(g, 0, 60, 0));
    assert.equal(g.shots[owner], 1);
    assert.equal(g.shots[1 - owner], 0);
  }
});
test("invalid, nonfinite, tiny, premature and repeated gestures cannot spend turns", () => {
  const g = createGame(random(7));
  assert.equal(launch(g, 0, 40, 0), false);
  startGame(g);
  const before = structuredClone(g);
  for (const [id, x, y] of [
    [0, 0, 0],
    [0, 3, 2],
    [999, 40, 0],
    [0, NaN, 0],
    [0, Infinity, 0],
    [0, Number.MAX_VALUE, Number.MAX_VALUE],
  ])
    assert.equal(launch(g, id, x, y), false);
  assert.deepEqual(g, before);
  assert.ok(launch(g, 0, MAX_DRAG * 5, 0));
  assert.equal(cueBall(g).vx, MAX_SPEED);
  assert.equal(launch(g, 0, 40, 0), false);
  assert.deepEqual(g.shots, [1, 0]);
});
test("shot vectors preserve direction and scale strength to the maximum", () => {
  const g = fixture();
  launch(g, 0, MAX_DRAG * 0.3, -MAX_DRAG * 0.4);
  assert.ok(Math.abs(Math.hypot(cueBall(g).vx, cueBall(g).vy) - MAX_SPEED * 0.5) < 1e-8);
  assert.ok(cueBall(g).vx > 0 && cueBall(g).vy < 0);
});
test("the circular cushion reflects white back into the table", () => {
  const g = fixture([
    ball(0, null, CENTER + TABLE_RADIUS - BALL_RADIUS - 1, CENTER),
    ball(1, 0, 320, 300),
  ]);
  launch(g, 0, 70, 0);
  advance(g, FIXED_STEP);
  assert.ok(cueBall(g).vx < 0);
  assert.ok(
    Math.hypot(cueBall(g).x - CENTER, cueBall(g).y - CENTER) <= TABLE_RADIUS - BALL_RADIUS + 1e-6,
  );
});
test("a head-on white collision transfers momentum without tunneling through a color", () => {
  const g = fixture([ball(0, null, 300, 360), ball(1, 1, 300 + 2 * BALL_RADIUS + 0.01, 360)]);
  launch(g, 0, 80, 0);
  advance(g, FIXED_STEP);
  assert.ok(g.balls[1].vx > 500);
  assert.ok(cueBall(g).vx < 40);
  assert.ok(g.balls[1].x - cueBall(g).x >= 2 * BALL_RADIUS - 1e-6);
  assert.equal(g.turn, 0);
});
test("off-center impact sends the color sideways and deflects the white in the opposite direction", () => {
  const g = fixture([ball(0, null, 300, 360), ball(1, 0, 340, 374)]);
  launch(g, 0, 80, 0);
  advance(g, FIXED_STEP * 2);
  assert.ok(g.balls[1].vx > 0 && g.balls[1].vy > 0);
  assert.ok(cueBall(g).vx > 0 && cueBall(g).vy < 0);
});
test("fast opposing balls collide without gaining energy", () => {
  const g = fixture([ball(0, null, 330, 360), ball(1, 1, 383, 360)]);
  launch(g, 0, MAX_DRAG, 0);
  g.balls[1].vx = -MAX_SPEED;
  advance(g, FIXED_STEP * 3);
  assert.ok(cueBall(g).vx < 0 && g.balls[1].vx > 0);
  assert.ok(g.balls.every((b) => Math.hypot(b.vx, b.vy) <= MAX_SPEED));
});
test("white can knock a color into each of the six pockets, including the smallest", () => {
  for (let i = 0; i < 6; i++) {
    const g = fixture();
    const p = g.pockets[i],
      dx = Math.cos(p.angle),
      dy = Math.sin(p.angle);
    Object.assign(cueBall(g), { x: p.x - dx * 110, y: p.y - dy * 110 });
    Object.assign(g.balls[1], { x: p.x - dx * 65, y: p.y - dy * 65 });
    // Keep another color on the table so we can also verify turn change.
    Object.assign(g.balls[2], { x: CENTER - dx * 100, y: CENTER - dy * 100 });
    launch(g, 0, dx * MAX_DRAG, dy * MAX_DRAG);
    settle(g);
    assert.equal(g.balls[1].active, false, `pocket ${i}`);
    assert.equal(g.scores[0], p.points);
    assert.equal(g.pots.length, 1);
    assert.equal(cueBall(g).active, true);
    assert.equal(g.turn, 1);
  }
});
test("off-center approaches fit original pockets but miss the smallest pocket", () => {
  for (const points of [-1, 1, 5]) {
    const g = fixture(),
      p = g.pockets.find((p) => p.points === points);
    const ux = Math.cos(p.angle),
      uy = Math.sin(p.angle);
    const target = ball(10, 1, p.x - ux * 13 - uy * 20, p.y - uy * 13 + ux * 20);
    g.balls.push(target);
    launch(g, 0, -20, 0);
    advance(g, FIXED_STEP);
    assert.equal(target.active, points === 5);
    assert.equal(g.scores[1], points === 5 ? 0 : points);
  }
});
test("positive and negative credits always belong to the potted color, regardless of shooter", () => {
  for (const owner of [0, 1])
    for (const value of [-1, 5]) {
      const g = fixture(),
        p = g.pockets.find((p) => p.points === value);
      g.balls.push(ball(10, owner, p.x, p.y));
      launch(g, 0, -35, 0);
      settle(g);
      assert.equal(g.scores[owner], value);
      assert.equal(g.scores[1 - owner], 0);
      assert.equal(g.pots.length, 1);
      assert.equal(g.turn, 1);
    }
});
test("multiple colors score exactly once in the same shot without extra turns", () => {
  const g = fixture(),
    minus = g.pockets.find((p) => p.points === -1),
    plus = g.pockets.find((p) => p.points === 4);
  g.balls.push(ball(10, 0, minus.x, minus.y), ball(11, 1, plus.x, plus.y));
  launch(g, 0, -30, 0);
  settle(g);
  assert.deepEqual(g.scores, [-1, 4]);
  assert.deepEqual(g.log[0].delta, [-1, 4]);
  assert.equal(g.pots.length, 2);
  assert.equal(g.turn, 1);
});
test("white scratch into any pocket gives zero points and hands placement to the next player", () => {
  for (const points of [-1, 1, 2, 3, 4, 5]) {
    const g = fixture();
    g.scores = [4, -2];
    scratch(g, points);
    assert.deepEqual(g.scores, [4, -2]);
    assert.deepEqual(Object.keys(g.scores), ["0", "1"]);
    assert.equal(g.phase, "placing");
    assert.equal(g.turn, 1);
    assert.equal(cueBall(g).active, false);
    assert.equal(g.log[0].scratch, true);
    assert.deepEqual(g.log[0].delta, [0, 0]);
    assert.equal(g.pots[0].points, 0);
    assert.equal(g.pots.length, 1);
  }
});
test("scratch waits for other moving balls before allowing placement", () => {
  const g = fixture(),
    p = g.pockets[0];
  Object.assign(cueBall(g), { x: p.x, y: p.y });
  launch(g, 0, 15, 0);
  g.balls[1].vx = 160;
  advance(g, FIXED_STEP);
  assert.equal(cueBall(g).active, false);
  assert.equal(g.phase, "moving");
  assert.equal(g.turn, 0);
  assert.equal(placeCue(g, CENTER, CENTER), false);
  settle(g);
  assert.equal(g.phase, "placing");
  assert.equal(g.turn, 1);
});
test("scratch keeps color points earned during the same shot", () => {
  const g = fixture(),
    p = g.pockets.find((p) => p.points === 5);
  g.balls.push(ball(10, 0, p.x, p.y));
  scratch(g, -1);
  assert.deepEqual(g.scores, [5, 0]);
  assert.deepEqual(g.log[0].delta, [5, 0]);
  assert.equal(g.log[0].scratch, true);
  assert.equal(g.phase, "placing");
});
test("placing white consumes no shot, reactivates it, and only then allows the next shot", () => {
  const g = fixture();
  assert.equal(placeCue(g, CENTER, CENTER), false);
  scratch(g);
  assert.equal(launch(g, 0, 20, 0), false);
  assert.ok(placeCue(g, CENTER, CENTER));
  assert.equal(g.phase, "aiming");
  assert.equal(g.turn, 1);
  assert.deepEqual(g.shots, [1, 0]);
  assert.equal(cueBall(g).x, CENTER);
  assert.equal(cueBall(g).y, CENTER);
  assert.equal(cueBall(g).vx, 0);
  assert.equal(placeCue(g, 380, 360), false);
  assert.ok(launch(g, 0, 20, 0));
  assert.deepEqual(g.shots, [1, 1]);
});
test("placement rejects overlapping colors, cushions, pockets and nonfinite coordinates without state changes", () => {
  const g = fixture();
  scratch(g);
  const before = structuredClone(g);
  for (const [x, y] of [
    [NaN, 360],
    [360, Infinity],
    [-20, 360],
    [CENTER + TABLE_RADIUS, CENTER],
    ...g.pockets.map((p) => [p.x, p.y]),
    ...g.balls.filter((b) => b.kind === "color").map((b) => [b.x, b.y]),
  ]) {
    assert.equal(canPlaceCue(g, x, y), false);
    assert.equal(placeCue(g, x, y), false);
  }
  assert.deepEqual(g, before);
});
test("a suggested placement stays clear even when the center is occupied", () => {
  const g = fixture();
  scratch(g);
  Object.assign(g.balls[1], { x: CENTER, y: CENTER });
  const p = findCuePlacement(g);
  assert.ok(p);
  assert.ok(canPlaceCue(g, p.x, p.y));
  assert.ok(Math.hypot(p.x - CENTER, p.y - CENTER) >= 2 * BALL_RADIUS + 4);
  assert.ok(placeCue(g, p.x, p.y));
});
test("turn changes only once after motion stops and keeps the white's ending position", () => {
  const g = fixture();
  // A short horizontal shot avoids pockets at either size.
  launch(g, 0, -20, 0);
  advance(g, 0.05);
  assert.equal(g.phase, "moving");
  assert.equal(g.turn, 0);
  settle(g);
  assert.equal(g.phase, "aiming");
  assert.equal(g.turn, 1);
  assert.deepEqual(g.shots, [1, 0]);
  assert.equal(g.log.length, 1);
  assert.notEqual(cueBall(g).x, CENTER);
  const position = [cueBall(g).x, cueBall(g).y];
  advance(g, 1);
  assert.deepEqual([cueBall(g).x, cueBall(g).y], position);
});
test("each player takes exactly five shots before comparing scores", () => {
  const g = fixture();
  g.pockets = [];
  for (let i = 0; i < TURNS * 2; i++) {
    assert.equal(g.turn, i % 2);
    assert.equal(g.phase, "aiming");
    assert.ok(launch(g, 0, 14, 0));
    assert.equal(g.winner, null);
    settle(g);
  }
  assert.deepEqual(g.shots, [5, 5]);
  assert.equal(g.log.length, 10);
  assert.equal(g.phase, "finished");
  assert.equal(g.winner, "draw");
  assert.equal(launch(g, 0, 40, 0), false);
});
test("a scratch on the final shot ends the match without offering needless placement", () => {
  const g = fixture();
  g.shots = [5, 4];
  g.turn = 1;
  g.scores = [3, 2];
  scratch(g);
  assert.equal(g.phase, "finished");
  assert.equal(g.winner, 0);
  assert.deepEqual(g.shots, [5, 5]);
  assert.equal(placeCue(g, CENTER, CENTER), false);
});
test("the final shot can change the winner, and negative totals compare correctly", () => {
  const g = fixture(),
    p = g.pockets.find((p) => p.points === 5);
  g.shots = [5, 4];
  g.turn = 1;
  g.scores = [2, -1];
  g.balls.push(ball(10, 1, p.x, p.y));
  launch(g, 0, 20, 0);
  settle(g);
  assert.deepEqual(g.scores, [2, 4]);
  assert.equal(g.winner, 1);
  const h = fixture();
  h.shots = [4, 5];
  h.scores = [-1, -3];
  h.pockets = [];
  launch(h, 0, 15, 0);
  settle(h);
  assert.equal(h.winner, 0);
});
test("a player with no own colors can still use white and is not automatically skipped", () => {
  const g = fixture([ball(0, null, 300, 360), ball(1, 1, 440, 440)]);
  g.pockets = [];
  assert.equal(g.turn, 0);
  assert.deepEqual(g.shots, [0, 0]);
  assert.ok(launch(g, 0, 15, 0));
  settle(g);
  assert.equal(g.turn, 1);
  assert.equal(g.log.length, 1);
});
test("a table with only white ends immediately, with no phantom pass records", () => {
  const g = fixture([ball(0, null, 360, 360)]);
  assert.equal(g.phase, "finished");
  assert.equal(g.winner, "draw");
  assert.deepEqual(g.shots, [0, 0]);
  assert.equal(g.log.length, 0);
});
test("the last color and white can fall together and end immediately after all motion stops", () => {
  const g = fixture([ball(0, null, 300, 360), ball(1, 0, 440, 440)]);
  const p = g.pockets.find((p) => p.points === 4);
  Object.assign(g.balls[1], { x: p.x, y: p.y });
  scratch(g, -1);
  assert.equal(g.phase, "finished");
  assert.equal(g.winner, 0);
  assert.deepEqual(g.scores, [4, 0]);
});
test("repeated scratches and placements finish after ten shots without getting stuck", () => {
  const g = fixture();
  for (let i = 0; i < 10; i++) {
    assert.equal(g.turn, i % 2);
    scratch(g);
    if (i < 9) assert.ok(placeCue(g, CENTER, CENTER));
  }
  assert.equal(g.phase, "finished");
  assert.deepEqual(g.shots, [5, 5]);
  assert.equal(g.log.length, 10);
  assert.equal(g.winner, "draw");
});
test("fixed stepping is independent of rendering frequency", () => {
  const a = fixture(),
    b = fixture();
  launch(a, 0, 100, -40);
  launch(b, 0, 100, -40);
  for (let i = 0; i < 60; i++) advance(a, 1 / 60);
  for (let i = 0; i < 30; i++) advance(b, 1 / 30);
  for (let i = 0; i < a.balls.length; i++)
    for (const k of ["x", "y", "vx", "vy"])
      assert.ok(Math.abs(a.balls[i][k] - b.balls[i][k]) < 1e-7, k);
  assert.deepEqual(a.scores, b.scores);
  assert.equal(a.turn, b.turn);
});
