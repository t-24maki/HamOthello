import test from "node:test";
import assert from "node:assert/strict";
import { createMatch } from "../battle/engine.js";
import { fighterAppearance, tintFur } from "../battle/appearance.js";
test("only the guest receives alternate colors when both players select the same character", () => {
  for (const character of ["tak", "meg", "ham", "tapi"]) {
    const game = createMatch(character, "normal", "hill", character);
    const host = fighterAppearance(game, 0),
      guest = fighterAppearance(game, 1);
    assert.equal(host.alternate, false);
    assert.equal(guest.alternate, true);
    assert.notEqual(host.color, guest.color);
    assert.notEqual(host.name, guest.name);
    game.localPlayer = 1;
    assert.deepEqual(fighterAppearance(game, 1), guest);
    assert.equal(game.fighters[0].character, game.fighters[1].character);
    assert.equal(fighterAppearance(createMatch(character), 1).alternate, false);
  }
});
test("runtime fur palettes retain dark outlines, glasses, pink cheeks and transparency", () => {
  for (const character of ["tak", "meg", "ham", "tapi"]) {
    const pixels = new Uint8ClampedArray([
      110, 65, 29, 255, 252, 157, 182, 255, 255, 255, 255, 255, 239, 220, 250, 0,
    ]);
    const original = pixels.slice();
    tintFur(pixels, character);
    assert.deepEqual(pixels, original);
  }
});
test("lavender fur becomes soft blue, cream fur becomes peach without changing opacity", () => {
  const tak = new Uint8ClampedArray([232, 210, 250, 192]),
    meg = new Uint8ClampedArray([253, 247, 231, 255]);
  tintFur(tak, "tak");
  tintFur(meg, "meg");
  assert.ok(tak[0] < 210 && tak[2] > tak[1] && tak[1] > tak[0]);
  assert.equal(tak[3], 192);
  assert.ok(meg[0] > meg[1] && meg[1] < 230 && meg[2] < 220);
  assert.equal(meg[3], 255);
});
test("Ham changes only his blue belt to green; Tapi becomes light blue with the same blank face", () => {
  const ham = new Uint8ClampedArray([254, 191, 100, 253, 75, 110, 200, 253]);
  const tapi = new Uint8ClampedArray([252, 216, 216, 253, 78, 49, 34, 253, 250, 190, 194, 253]);
  tintFur(ham, "ham");
  tintFur(tapi, "tapi");
  assert.deepEqual(Array.from(ham.slice(0, 4)), [254, 191, 100, 253]);
  assert.ok(ham[5] > ham[4] && ham[5] > ham[6]);
  assert.ok(tapi[2] > tapi[1] && tapi[1] > tapi[0] && tapi[0] >= 190);
  assert.deepEqual(Array.from(tapi.slice(4, 8)), [78, 49, 34, 253]);
  assert.ok(tapi[10] > tapi[9] && tapi[9] >= tapi[8]);
  assert.equal(ham[3], 253);
  assert.equal(tapi[3], 253);
});
