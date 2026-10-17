import test from "node:test";
import assert from "node:assert/strict";
import {
  CHARACTERS,
  createMatch,
  tick,
  STEP,
  EMPTY_INPUT,
  hurtbox,
  attackArea,
  fighterSize,
  growthScale,
  predictMovement,
  pause,
  resume,
  advance,
} from "../battle/engine.js";
import { getStage, platformsAt, surfaceAt } from "../battle/stages.js";
import { gameView, readGame } from "../battle/online-protocol.js";
import { cpuInput, createCPU } from "../battle/cpu.js";
import { giantWarningOpacity } from "../battle/renderer.js";

function game(character = "tak", opponent = "meg", stage = "meadow", seed = 42) {
  const g = createMatch(character, "normal", stage, opponent, seed);
  g.phase = "playing";
  Object.assign(g.fighters[0], { x: 380, y: 300 });
  Object.assign(g.fighters[1], { x: 700, y: 400 });
  return g;
}
function potion(g, x = g.fighters[0].x, y = g.fighters[0].y - 18, platformId = null) {
  g.items.wait = 0;
  g.items.potion = { x, y, vy: 0, platformId };
}
function run(g, seconds) {
  for (let n = 0; n < Math.round(seconds / STEP); n++) tick(g);
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} vs ${b}`);

test("drops vary by seed, appear after 8–12 playing seconds and remain a single potion", () => {
  const drops = [];
  for (const seed of [1, 2345, 78291]) {
    const g = game("tak", "meg", "meadow", seed);
    g.fighters[0].x = 100;
    g.fighters[0].y = 400;
    const first = g.items.wait;
    assert.ok(first >= 8 && first < 12);
    run(g, 7.9);
    assert.equal(g.items.potion, null);
    while (!g.items.potion) tick(g);
    assert.ok(g.elapsed >= first && g.elapsed < first + STEP * 2);
    const item = g.items.potion;
    assert.ok(item.y < 0 && item.vy > 0);
    assert.ok(item.x >= 145 && item.x <= 655);
    drops.push([first, item.x]);
    run(g, 30);
    assert.equal(g.items.potion, item);
    assert.equal(g.items.wait, 0);
    assert.ok(readGame(gameView(g)));
  }
  assert.equal(new Set(drops.map(JSON.stringify)).size, 3);
});

test("potions land on every platform and travel with horizontal and vertical moving floors", () => {
  for (const stageId of ["hill", "meadow", "cloud"]) {
    const stage = getStage(stageId);
    for (const floor of stage.platforms) {
      const g = game("tak", "meg", stageId);
      g.fighters.forEach((f) => {
        f.respawn = 1;
      });
      const x = floor.x + floor.w / 2;
      potion(g, x, surfaceAt(floor, x) - 20);
      run(g, 0.4);
      assert.equal(g.items.potion.platformId, floor.id, `${stageId}/${floor.id}`);
      const startX = g.items.potion.x;
      for (let n = 0; n < 50; n++) {
        tick(g);
        const p = g.items.potion;
        const current = platformsAt(stage, g.elapsed).find((p) => p.id === floor.id);
        near(p.y + 18, surfaceAt(current, p.x));
        assert.equal(p.vy, 0);
        assert.ok(readGame(gameView(g)));
      }
      if (floor.motion?.axis === "x") assert.notEqual(g.items.potion.x, startX);
    }
  }
});

test("four fighters grow by the requested factor, including hurtboxes and attack reach", () => {
  for (const key of Object.keys(CHARACTERS)) {
    const g = game(key),
      f = g.fighters[0];
    const body = hurtbox(f);
    f.attack = { kind: "normal", age: 0.12, duration: CHARACTERS[key].normal.duration, hit: false };
    const area = attackArea(f);
    potion(g);
    tick(g);
    const scale = key === "tapi" ? 4 : 2;
    assert.equal(f.giant, true);
    assert.equal(growthScale(f), scale);
    near(fighterSize(f), CHARACTERS[key].size * scale);
    near(hurtbox(f).rx, body.rx * scale);
    near(hurtbox(f).ry, body.ry * scale);
    near(attackArea(f).rx, area.rx * scale);
    near(attackArea(f).ry, area.ry * scale);
    assert.equal(g.items.potion, null);
    assert.ok(g.items.wait >= 7 && g.items.wait < 20);
    assert.equal(g.events.filter((e) => e.type === "grow").length, 1);
    assert.ok(readGame(gameView(g)));
  }
});

test("another potion refreshes ten seconds without stacking size, power or resetting damage", () => {
  const g = game("tapi"),
    f = g.fighters[0];
  potion(g);
  tick(g);
  f.damage = 75;
  run(g, 7.5);
  near(f.giantTime, 2.5);
  const eventId = g.eventId;
  potion(g);
  tick(g);
  assert.equal(g.items.potion, null);
  assert.equal(growthScale(f), 4);
  assert.equal(f.damage, 75);
  assert.equal(f.giantTime, 10);
  assert.equal(giantWarningOpacity(f), 1);
  assert.equal(g.eventId, eventId);
  g.items.wait = 12;
  run(g, 10 - STEP);
  assert.equal(f.giant, true);
  tick(g);
  assert.equal(f.giant, false);
  assert.equal(f.giantTime, 0);
});

test("all four fighters revert size, hitboxes and strength exactly ten playing seconds after pickup", () => {
  for (const key of Object.keys(CHARACTERS)) {
    const g = game(key),
      f = g.fighters[0];
    const body = hurtbox(f);
    potion(g);
    tick(g);
    g.items.wait = 12;
    assert.equal(f.giantTime, 10);
    run(g, 10 - STEP);
    assert.equal(f.giant, true);
    assert.ok(f.giantTime > 0);
    tick(g);
    assert.equal(f.giant, false);
    assert.equal(f.giantTime, 0);
    assert.equal(fighterSize(f), CHARACTERS[key].size);
    assert.deepEqual(hurtbox(f), body);
    f.attack = { kind: "normal", age: 0.12, duration: CHARACTERS[key].normal.duration, hit: false };
    Object.assign(g.fighters[1], { x: 420, y: 300 });
    tick(g);
    assert.equal(g.fighters[1].damage, CHARACTERS[key].normal.damage);
    assert.ok(readGame(gameView(g)));
  }
});
test("the next natural drop can refresh an active giant before the first ten seconds expire", () => {
  const g = game();
  potion(g);
  tick(g);
  run(g, 10.1);
  assert.equal(g.fighters[0].giant, true);
  assert.ok(g.fighters[0].giantTime > 4);
});
test("warning starts in the last three seconds, pulses without disappearing, and respects reduced motion", () => {
  const f = game().fighters[0];
  Object.assign(f, { giant: true, giantTime: 3.1 });
  assert.equal(giantWarningOpacity(f), 1);
  f.giantTime = 3;
  near(giantWarningOpacity(f), 1);
  f.giantTime = 2.75;
  near(giantWarningOpacity(f), 0.44);
  assert.equal(giantWarningOpacity(f, true), 0.72);
  f.giantTime = 2.5;
  near(giantWarningOpacity(f), 1);
  assert.equal(giantWarningOpacity(f, true), 0.72);
  f.giant = false;
  f.giantTime = 0;
  assert.equal(giantWarningOpacity(f), 1);
});
test("pause and match end freeze both the giant countdown and warning phase", () => {
  const g = game();
  potion(g);
  tick(g);
  g.items.wait = 12;
  run(g, 7.25);
  pause(g);
  const remaining = g.fighters[0].giantTime,
    opacity = giantWarningOpacity(g.fighters[0]);
  run(g, 5);
  assert.equal(g.fighters[0].giantTime, remaining);
  assert.equal(giantWarningOpacity(g.fighters[0]), opacity);
  resume(g);
  tick(g);
  near(g.fighters[0].giantTime, remaining - STEP);
  g.phase = "finished";
  const ended = g.fighters[0].giantTime;
  run(g, 5);
  assert.equal(g.fighters[0].giantTime, ended);
});
test("guest prediction expires both fighters' known timers at the same step as the host", () => {
  const g = game();
  for (const f of g.fighters) Object.assign(f, { giant: true, giantTime: STEP * 2 });
  const copy = readGame(gameView(g));
  for (let n = 0; n < 2; n++) {
    predictMovement(copy, 0, EMPTY_INPUT);
    tick(g);
    assert.deepEqual(copy.fighters[0], g.fighters[0]);
    assert.deepEqual(
      copy.fighters.map((f) => [f.giant, f.giantTime]),
      g.fighters.map((f) => [f.giant, f.giantTime]),
    );
  }
  assert.equal(copy.fighters[0].giant, false);
});

test("only one fighter collects a simultaneous touch and exact ties can favor either seat", () => {
  const winners = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    const g = game("tak", "tak", "meadow", seed);
    Object.assign(g.fighters[1], { x: 380, y: 300 });
    potion(g);
    tick(g);
    assert.equal(g.fighters.filter((f) => f.giant).length, 1);
    winners.add(g.fighters.findIndex((f) => f.giant));
  }
  assert.equal(winners.size, 2);
});

test("respawning and eliminated fighters cannot collect a potion", () => {
  for (const state of [{ respawn: 0.5 }, { stocks: 0 }, { x: 900 }]) {
    const g = game();
    Object.assign(g.fighters[0], state);
    potion(g);
    tick(g);
    assert.equal(g.fighters[0].giant, false);
    assert.ok(g.items.potion);
  }
});

test("giant mode survives jumping and landing, and ends at every blast boundary or rematch", () => {
  for (const key of Object.keys(CHARACTERS)) {
    const g = game(key),
      f = g.fighters[0];
    potion(g);
    tick(g);
    tick(g, [{ ...EMPTY_INPUT, jump: true }, EMPTY_INPUT]);
    run(g, 2);
    assert.equal(f.grounded, true);
    assert.equal(f.giant, true);
    for (const pos of [{ x: -95 }, { x: 895 }, { y: -205 }, { y: 615 }]) {
      const out = game(key);
      Object.assign(out.fighters[0], { giant: true, giantTime: 10, grounded: false }, pos);
      tick(out);
      assert.equal(out.fighters[0].giant, false);
      assert.equal(out.fighters[0].stocks, 2);
    }
    assert.equal(createMatch(key).fighters[0].giant, false);
  }
});

function strike(aGiant, dGiant, kind = "normal", guarding = false, damage = 0) {
  const g = game("tak", "meg"),
    [a, d] = g.fighters;
  Object.assign(a, {
    giant: aGiant,
    giantTime: aGiant ? 10 : 0,
    attack: { kind, age: 0.1, duration: CHARACTERS.tak[kind].duration, hit: false },
  });
  Object.assign(d, { x: 430, y: 300, giant: dGiant, giantTime: dGiant ? 10 : 0, damage });
  tick(g, [EMPTY_INPUT, { ...EMPTY_INPUT, guard: guarding }]);
  assert.equal(a.attack.hit, true);
  return { g, d };
}
test("giant attack and defense scale actual damage by 1.2 and cancel when both are giant", () => {
  for (const kind of ["normal", "special"])
    for (const a of [false, true])
      for (const d of [false, true]) {
        const result = strike(a, d, kind);
        near(result.d.damage, (CHARACTERS.tak[kind].damage * (a ? 1.2 : 1)) / (d ? 1.2 : 1));
        assert.ok(readGame(gameView(result.g)));
      }
});
test("giant attack increases knockback, giant defense reduces both axes and shield damage", () => {
  const base = strike(false, false).d;
  const offense = strike(true, false).d;
  const defense = strike(false, true).d;
  assert.ok(offense.vx > base.vx && offense.vy < base.vy);
  assert.ok(defense.vx < base.vx && defense.vy > base.vy);
  for (const a of [false, true])
    for (const d of [false, true]) {
      const guarded = strike(a, d, "normal", true).d;
      near(guarded.shield, 100 - 32 * STEP - (22 * (a ? 1.2 : 1)) / (d ? 1.2 : 1));
      assert.equal(guarded.damage, 0);
    }
});

test("giant bonuses cancel at high damage and maximum launch speeds remain network-safe", () => {
  for (const kind of ["normal", "special"]) {
    const base = strike(false, false, kind, false, 900).d;
    const both = strike(true, true, kind, false, 900).d;
    assert.equal(both.damage, base.damage);
    assert.equal(both.vx, base.vx);
    assert.equal(both.vy, base.vy);
    const boosted = strike(true, false, kind, false, 900);
    near(boosted.d.vx, 1650 * 1.2);
    near(boosted.d.vy, -880 * 1.2);
    assert.ok(readGame(gameView(boosted.g)));
  }
});
test("giant Tapi keeps four jumps and grounded special immunity", () => {
  const g = game("ham", "tapi"),
    [a, d] = g.fighters;
  Object.assign(d, { x: 420, y: 300, giant: true, giantTime: 10 });
  a.attack = { kind: "special", age: 0.1, duration: CHARACTERS.ham.special.duration, hit: false };
  tick(g);
  assert.equal(d.damage, 0);
  for (let n = 1; n <= 4; n++) {
    a.attack = null;
    tick(g, [EMPTY_INPUT, { ...EMPTY_INPUT, jump: true }]);
    assert.equal(d.jumps, n);
    run(g, 0.1);
  }
});

test("countdown, pause and match end freeze falling items and their spawn timer", () => {
  for (const dropped of [false, true]) {
    const g = game();
    if (dropped) potion(g, 600, 50);
    for (const phase of ["countdown", "paused", "finished"]) {
      g.phase = phase;
      g.countdown = 2.6;
      const before = structuredClone(g.items);
      run(g, 0.5);
      assert.deepEqual(g.items, before);
    }
    g.phase = "playing";
    pause(g);
    resume(g);
    const before = structuredClone(g.items);
    run(g, 0.5);
    assert.notDeepEqual(g.items, before);
  }
});

test("snapshots preserve giant mode and the item random stream for deterministic continuation", () => {
  const g = game("tapi");
  potion(g);
  tick(g);
  const copy = readGame(gameView(g));
  assert.equal(copy.fighters[0].giant, true);
  for (let n = 0; n < 2400; n++) {
    tick(g);
    tick(copy);
    assert.deepEqual(copy.items, g.items);
    assert.deepEqual(copy.fighters, g.fighters);
  }
});
test("long respawn waits survive snapshots, count down and pause without an early drop", () => {
  const g = game();
  g.items.wait = 20;
  const copy = readGame(gameView(g));
  assert.ok(copy);
  const invalid = gameView(g);
  invalid.items.wait = 20.01;
  assert.equal(readGame(invalid), null);
  run(copy, 13);
  assert.equal(copy.items.potion, null);
  near(copy.items.wait, 7);
  pause(copy);
  run(copy, 2);
  near(copy.items.wait, 7);
  resume(copy);
  run(copy, 7 - STEP);
  assert.equal(copy.items.potion, null);
  run(copy, 2 * STEP);
  assert.ok(copy.items.potion);
});
test("guest movement prediction never spawns or collects a potion speculatively", () => {
  const g = game("tapi");
  potion(g);
  const before = structuredClone(g.items);
  predictMovement(g, 0, EMPTY_INPUT);
  assert.equal(g.fighters[0].giant, false);
  assert.deepEqual(g.items, before);
  tick(g);
  assert.equal(g.fighters[0].giant, true);
  const predicted = readGame(gameView(g)),
    authoritative = readGame(gameView(g));
  predictMovement(predicted, 0, { ...EMPTY_INPUT, jump: true });
  tick(authoritative, [{ ...EMPTY_INPUT, jump: true }, EMPTY_INPUT]);
  assert.deepEqual(predicted.fighters[0], authoritative.fighters[0]);
});
test("network validation rejects malformed item and growth states", () => {
  const g = game();
  potion(g, 500, 0);
  const mutations = [
    (s) => {
      delete s.items;
    },
    (s) => {
      s.items.seed = -1;
    },
    (s) => {
      s.items.seed = 2 ** 32;
    },
    (s) => {
      s.items.wait = Infinity;
    },
    (s) => {
      s.items.wait = 21;
    },
    (s) => {
      s.items.wait = 2;
    },
    (s) => {
      s.items.potion = [];
    },
    (s) => {
      s.items.potion.y = NaN;
    },
    (s) => {
      s.items.potion.vy = 900;
    },
    (s) => {
      s.items.potion.platformId = 3;
    },
    (s) => {
      s.fighters[0].giant = 2;
    },
    (s) => {
      delete s.fighters[0].giant;
    },
    (s) => {
      delete s.fighters[0].giantTime;
    },
    (s) => {
      s.fighters[0].giantTime = 10.1;
      s.fighters[0].giant = true;
    },
    (s) => {
      s.fighters[0].giantTime = NaN;
    },
    (s) => {
      s.fighters[0].giantTime = -1;
    },
    (s) => {
      s.fighters[0].giantTime = 5;
    },
    (s) => {
      s.fighters[0].giant = true;
    },
  ];
  for (const mutate of mutations) {
    const state = gameView(g);
    mutate(state);
    assert.equal(readGame(state), null);
  }
});
test("fixed-step potion drops match at 30, 60 and 144 rendering frames per second", () => {
  const states = [30, 60, 144].map((fps) => {
    const g = game();
    for (let i = 0; i < fps * 15; i++) advance(g, 1 / fps, () => [EMPTY_INPUT, EMPTY_INPUT]);
    return { items: g.items, fighters: g.fighters };
  });
  assert.deepEqual(states[0], states[1]);
  assert.deepEqual(states[0], states[2]);
});
test("CPU seeks a nearby useful potion, while giant CPU keeps engaging the opponent", () => {
  const g = game();
  g.fighters[0].x = 380;
  potion(g, 270, 342, 0);
  assert.equal(
    cpuInput(
      g,
      createCPU(() => 0.5),
      STEP,
      0,
    ).move,
    -1,
  );
  g.fighters[0].giant = true;
  g.fighters[0].giantTime = 10;
  assert.equal(
    cpuInput(
      g,
      createCPU(() => 0.5),
      STEP,
      0,
    ).move,
    1,
  );
  g.fighters[0].giantTime = 2;
  assert.equal(
    cpuInput(
      g,
      createCPU(() => 0.5),
      STEP,
      0,
    ).move,
    -1,
  );
});
