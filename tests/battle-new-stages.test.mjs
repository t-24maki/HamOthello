import test from "node:test";
import assert from "node:assert/strict";
import {
  CHARACTERS,
  createMatch,
  tick,
  STEP,
  EMPTY_INPUT,
  pause,
  resume,
  predictMovement,
} from "../battle/engine.js";
import { getStage, platformsAt, surfaceAt, supports, spawnPoint } from "../battle/stages.js";
import { createCPU, cpuInput } from "../battle/cpu.js";
import { createItems, movePotion } from "../battle/items.js";
import { gameView, readGame } from "../battle/online-protocol.js";

const stages = ["islands", "seesaw", "planet"];
const seeded = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
function game(stage, character = "tak", level = "normal") {
  const g = createMatch(character, level, stage, character, 42);
  g.phase = "playing";
  return g;
}
function stand(g, seat, x, id = 0) {
  const floor = platformsAt(getStage(g.stageId), g.elapsed).find((p) => p.id === id);
  Object.assign(g.fighters[seat], {
    x,
    y: surfaceAt(floor, x),
    vx: 0,
    vy: 0,
    grounded: true,
    platformId: id,
  });
}
function run(g, seconds, inputs = () => [EMPTY_INPUT, EMPTY_INPUT]) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) tick(g, inputs());
}

test("the middle of the twin islands is a real hole for normal and giant fighters", () => {
  for (const character of Object.keys(CHARACTERS))
    for (const giant of [false, true]) {
      const g = game("islands", character),
        f = g.fighters[0];
      Object.assign(f, {
        x: 400,
        y: 340,
        grounded: false,
        platformId: null,
        giant,
        giantTime: giant ? 10 : 0,
      });
      run(g, 0.25);
      assert.equal(f.grounded, false);
      assert.ok(f.y > 370);
      run(g, 2);
      assert.equal(f.stocks, 2);
      assert.ok(f.grounded);
      assert.ok(f.x < 335);
    }
});
for (const stage of stages) {
  test(`${stage}: all four characters spawn and respawn over solid terrain on both seats`, () => {
    for (const character of Object.keys(CHARACTERS))
      for (const seat of [0, 1]) {
        const g = game(stage, character),
          f = g.fighters[seat];
        assert.deepEqual(
          { x: f.x, y: f.y, platformId: f.platformId },
          spawnPoint(getStage(stage), seat),
        );
        run(g, 1.25);
        Object.assign(f, { x: -95, grounded: false, platformId: null });
        tick(g);
        run(g, 3);
        assert.equal(f.stocks, 2);
        assert.ok(f.grounded);
        const floor = platformsAt(getStage(stage), g.elapsed).find((p) => p.id === f.platformId);
        assert.ok(supports(floor, f.x));
        assert.equal(f.y, surfaceAt(floor, f.x));
        assert.ok(readGame(gameView(g)));
      }
  });
  test(`${stage}: local prediction follows the same floor as the host and rejects nonexistent floor IDs`, () => {
    const host = game(stage),
      guest = readGame(gameView(host));
    for (let i = 0; i < 360; i++) {
      const input = { ...EMPTY_INPUT, move: i < 40 ? 1 : 0, jump: i === 40 };
      tick(host, [input, EMPTY_INPUT]);
      predictMovement(guest, 0, input);
      assert.deepEqual(guest.fighters[0], host.fighters[0]);
    }
    const bad = gameView(host);
    bad.fighters[0].platformId = getStage(stage).platforms.length;
    assert.equal(readGame(bad), null);
  });
}
test("the seesaw carries both riders through its complete tilt cycle, including pause and resume", () => {
  const g = game("seesaw");
  const start = g.fighters.map((f) => f.y);
  const extremes = [[], []];
  for (let i = 0; i < 840; i++) {
    tick(g);
    const p = platformsAt(getStage("seesaw"), g.elapsed)[0];
    for (const [seat, f] of g.fighters.entries()) {
      assert.ok(f.grounded);
      assert.equal(f.y, surfaceAt(p, f.x));
      assert.equal(f.jumps, 0);
      extremes[seat].push(f.y);
    }
    assert.ok(Math.abs(g.fighters[0].y + g.fighters[1].y - 690) < 1e-8);
  }
  for (const [i, f] of g.fighters.entries()) {
    assert.ok(Math.abs(f.y - start[i]) < 1e-8);
    assert.ok(Math.max(...extremes[i]) - Math.min(...extremes[i]) > 76);
  }
  pause(g);
  const before = structuredClone(g);
  run(g, 1);
  assert.deepEqual(g, before);
  resume(g);
  tick(g);
  assert.notEqual(g.fighters[0].y, start[0]);
});
test("jumping detaches from the tilted board and lands on its new angle", () => {
  const g = game("seesaw");
  run(g, 0.75);
  tick(g, [{ ...EMPTY_INPUT, jump: true }, EMPTY_INPUT]);
  assert.equal(g.fighters[0].grounded, false);
  run(g, 1.5);
  assert.ok(g.fighters[0].grounded);
  assert.equal(
    g.fighters[0].y,
    surfaceAt(platformsAt(getStage("seesaw"), g.elapsed)[0], g.fighters[0].x),
  );
});
test("the planet is circular and fighters follow both sides of its curved surface without spending jumps", () => {
  const stage = getStage("planet"),
    p = stage.platforms[0];
  for (const [x, y] of p.profile) assert.ok(Math.abs((x - 230) ** 2 + y ** 2 - 230 ** 2) < 1e-8);
  for (const direction of [-1, 1]) {
    const g = game("planet");
    stand(g, 0, direction > 0 ? 210 : 590);
    let top = 500;
    for (let i = 0; i < 180; i++) {
      tick(g, [{ ...EMPTY_INPUT, move: direction }, EMPTY_INPUT]);
      const f = g.fighters[0];
      top = Math.min(top, f.y);
      assert.ok(f.grounded);
      assert.equal(f.y, surfaceAt(p, f.x));
      assert.equal(f.jumps, 0);
      if (direction > 0 ? f.x > 590 : f.x < 210) break;
    }
    assert.ok(top < 201);
    assert.equal(g.fighters[0].stocks, 3);
  }
});
test("potions fall on both islands, never the gap, and stay attached to curved and tilting floors", () => {
  const islands = getStage("islands"),
    visited = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    const items = createItems(seed * 2654435761);
    items.wait = 0;
    movePotion(items, islands, platformsAt(islands, 0), platformsAt(islands, STEP), STEP);
    const p = islands.platforms.find((p) => supports(p, items.potion.x, 0));
    assert.ok(p);
    visited.add(p.id);
  }
  assert.equal(visited.size, 2);
  for (const id of ["seesaw", "planet"]) {
    const stage = getStage(id),
      p = stage.platforms[0],
      x = p.x + p.w * 0.25;
    const items = {
      ...createItems(42),
      wait: 0,
      potion: { x, y: surfaceAt(p, x) - 18, vy: 0, platformId: p.id },
    };
    for (let i = 0; i < 840; i++) {
      const floors = platformsAt(stage, (i + 1) * STEP);
      movePotion(items, stage, platformsAt(stage, i * STEP), floors, STEP);
      assert.equal(items.potion.platformId, p.id);
      assert.equal(items.potion.y, surfaceAt(floors[0], x) - 18);
    }
  }
});
for (const character of Object.keys(CHARACTERS)) {
  test(`${character}: CPU crosses the central gap from either side at all difficulties without losing a stock`, () => {
    for (const level of ["easy", "normal", "hard"])
      for (const seat of [0, 1]) {
        const g = game("islands", character, level),
          f = g.fighters[seat];
        const brain = createCPU(seeded(53));
        let crossed = false;
        for (let i = 0; i < 120 * 8; i++) {
          const inputs = [EMPTY_INPUT, EMPTY_INPUT];
          inputs[seat] = cpuInput(g, brain, STEP, seat);
          tick(g, inputs);
          if (f.grounded && f.platformId === 1 - seat) {
            crossed = true;
            break;
          }
        }
        assert.equal(f.stocks, 3, `${level}/${seat}`);
        assert.ok(crossed, `${level}/${seat}`);
      }
  });
}
