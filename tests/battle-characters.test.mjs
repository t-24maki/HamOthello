import test from "node:test";
import assert from "node:assert/strict";
import { createMatch, tick, predictMovement, STEP, EMPTY_INPUT } from "../battle/engine.js";
import { gameView, readGame } from "../battle/online-protocol.js";

function game(character = "tak", opponent) {
  const g = createMatch(character, "normal", "meadow", opponent);
  g.phase = "playing";
  Object.assign(g.fighters[0], { x: 370, y: 300 });
  return g;
}
function step(g, input = {}, other = {}) {
  tick(g, [
    { ...EMPTY_INPUT, ...input },
    { ...EMPTY_INPUT, ...other },
  ]);
}
function run(g, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) step(g, input);
}

test("Tak covers more ground while Meg's jump reaches higher", () => {
  const [tak, meg] = [game("tak"), game("meg")];
  for (const g of [tak, meg]) run(g, 0.5, { move: -1 });
  assert.ok(370 - tak.fighters[0].x > (370 - meg.fighters[0].x) * 1.15);
  const heights = ["tak", "meg"].map((character) => {
    const g = game(character);
    step(g, { jump: true });
    let peak = g.fighters[0].y;
    for (let i = 0; i < 70; i++) {
      step(g);
      peak = Math.min(peak, g.fighters[0].y);
    }
    return 300 - peak;
  });
  assert.ok(heights[1] > heights[0] * 1.15);
});

test("each character deals its own normal and special damage, once per attack", () => {
  for (const [character, normal, special] of [
    ["tak", 8, 13],
    ["meg", 10, 17],
  ]) {
    for (const [action, damage] of [
      ["attack", normal],
      ["special", special],
    ]) {
      const g = game(character);
      Object.assign(g.fighters[1], { x: 435, y: 300 });
      step(g, { [action]: true });
      run(g, 0.55);
      assert.equal(g.fighters[1].damage, damage, `${character} ${action}`);
    }
  }
});

test("Tak can guard after a missed swing sooner, while Meg must finish her recovery", () => {
  for (const character of ["tak", "meg"]) {
    const g = game(character);
    step(g, { attack: true });
    run(g, 0.28, { guard: true });
    assert.equal(g.fighters[0].guarding, character === "tak");
    run(g, 0.15, { guard: true });
    assert.equal(g.fighters[0].guarding, true);
  }
});

test("Tak fits more attacks into the same window, without a one-sided damage-rate advantage", () => {
  const swings = ["tak", "meg"].map((character) => {
    const g = game(character);
    run(g, 1.9, { attack: true });
    return g.events.filter((e) => e.type === "swing").length;
  });
  assert.ok(swings[0] > swings[1]);
  assert.ok(Math.abs(swings[0] * 8 - swings[1] * 10) <= 10);
});

test("specials trade horizontal travel for vertical reach, and both need a landing to recharge", () => {
  const fighters = ["tak", "meg"].map((character) => {
    const g = game(character);
    step(g, { special: true });
    run(g, 0.24);
    const position = { x: g.fighters[0].x, y: g.fighters[0].y };
    assert.equal(g.fighters[0].airSpecial, true);
    assert.ok(g.fighters[0].specialCooldown > 0);
    Object.assign(g.fighters[0], { specialCooldown: 0, attack: null });
    step(g, { special: true });
    assert.equal(g.fighters[0].attack, null);
    return position;
  });
  assert.ok(fighters[0].x > fighters[1].x + 10);
  assert.ok(fighters[1].y < fighters[0].y - 10);
});

test("both hamsters take the same knockback and damage from the same incoming hit", () => {
  const received = ["tak", "meg"].map((opponent) => {
    const g = game("tak", opponent);
    Object.assign(g.fighters[1], { x: 435, y: 300, damage: 80 });
    step(g, { attack: true });
    for (let i = 0; i < 20 && g.fighters[1].damage === 80; i++) step(g);
    assert.equal(g.fighters[1].damage, 88);
    const { damage, vx, vy, stun } = g.fighters[1];
    return { damage, vx, vy, stun };
  });
  assert.deepEqual(received[0], received[1]);
});

test("same-character mirrored attacks have identical results for both seats", () => {
  for (const character of ["tak", "meg"]) {
    const g = game(character, character);
    Object.assign(g.fighters[0], { x: 365, y: 300 });
    Object.assign(g.fighters[1], { x: 435, y: 300 });
    step(g, { attack: true }, { attack: true });
    run(g, 0.15);
    const [a, b] = g.fighters;
    assert.equal(a.damage, b.damage);
    assert.ok(a.damage > 0);
    assert.equal(a.stun, b.stun);
    assert.equal(a.vx, -b.vx);
    assert.ok(Math.abs(a.x + b.x - 800) < 1e-8);
  }
});

test("prediction uses the same movement, jump and special physics for either character", () => {
  for (const character of ["tak", "meg", "ham", "tapi"]) {
    for (const action of ["jump", "attack", "special"]) {
      const authoritative = game(character);
      const predicted = structuredClone(authoritative);
      for (let i = 0; i < 50; i++) {
        const input = { ...EMPTY_INPUT, move: -1, [action]: i === 0 };
        tick(authoritative, [input, EMPTY_INPUT]);
        predictMovement(predicted, 0, input);
        assert.deepEqual(predicted.fighters[0], authoritative.fighters[0]);
      }
    }
  }
});

test("network snapshots accept each character's attacks and reject the other character's duration", () => {
  for (const character of ["tak", "meg", "ham", "tapi"]) {
    for (const action of ["attack", "special"]) {
      const g = game(character);
      step(g, { [action]: true });
      const state = gameView(g);
      assert.deepEqual(readGame(state).fighters, g.fighters);
      const other = game(character === "tak" ? "meg" : "tak");
      step(other, { [action]: true });
      state.fighters[0].attack.duration = other.fighters[0].attack.duration;
      assert.equal(readGame(state), null);
    }
  }
});
