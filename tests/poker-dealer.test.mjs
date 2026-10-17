import test from "node:test";
import assert from "node:assert/strict";
import { createDealer } from "../poker/dealer.js";

// Manually settled Web Animations make cancellation and reduced motion
// deterministic, without depending on a real-time animation or a browser.
function fixture({ reduced = false } = {}) {
  const pending = [];
  class Card {
    constructor(face = "back", rect = { left: 200, top: 300, width: 100, height: 150 }) {
      this.face = face;
      this.rect = rect;
      this.style = { visibility: "" };
      this.classList = { add() {}, remove() {} };
    }
    removeAttribute() {}
    setAttribute() {}
    querySelector() {
      return null;
    }
    cloneNode() {
      return new Card(this.face, this.rect);
    }
    getBoundingClientRect() {
      return this.rect;
    }
    remove() {
      layer.children = layer.children.filter((node) => node !== this);
    }
    animate(frames, options) {
      let resolve, reject;
      const finished = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
      const animation = { finished, finish: resolve, cancel: () => reject(new Error("cancelled")) };
      pending.push({ animation, frames, options, ghost: this });
      return animation;
    }
  }
  const layer = {
    children: [],
    append(node) {
      this.children.push(node);
    },
    getBoundingClientRect: () => ({ left: 20, top: 30 }),
  };
  const deck = new Card("back", { left: 80, top: 160, width: 50, height: 75 });
  deck.querySelector = () => new Card("back");
  const discard = new Card("back", { left: 400, top: 160, width: 50, height: 75 });
  const cards = [new Card("gold 9"), new Card("silver 4"), new Card("bronze 1")];
  const dealer = createDealer({
    window: { matchMedia: () => ({ matches: reduced }) },
    layer,
    deck,
    discard,
  });
  return { dealer, cards, layer, pending };
}

test("incoming cards travel face down, land one by one, and restore their real faces", async () => {
  const { dealer, cards, layer, pending } = fixture();
  const flight = dealer.fly(cards, "in");
  assert.equal(layer.children.length, 3);
  assert.ok(layer.children.every((card) => card.face === "back"));
  assert.ok(cards.every((card) => card.style.visibility === "hidden"));
  assert.ok(pending[0].options.delay < pending[1].options.delay);
  assert.ok(pending[1].options.delay < pending[2].options.delay);
  pending[0].animation.finish();
  await Promise.resolve();
  assert.equal(cards[0].style.visibility, "");
  assert.equal(cards[1].style.visibility, "hidden");
  for (const { animation } of pending.slice(1)) animation.finish();
  await flight;
  assert.equal(layer.children.length, 0);
  assert.ok(cards.every((card) => card.style.visibility === ""));
  assert.deepEqual(
    cards.map((card) => card.face),
    ["gold 9", "silver 4", "bronze 1"],
  );
});

test("cancelling an exchange removes every flight and restores concealed cards", async () => {
  const { dealer, cards, layer } = fixture();
  cards[0].style.visibility = "visible";
  const flight = dealer.fly(cards, "out");
  assert.deepEqual(
    layer.children.map((card) => card.face),
    ["gold 9", "silver 4", "bronze 1"],
  );
  dealer.cancel();
  assert.equal(layer.children.length, 0);
  await flight;
  assert.deepEqual(
    cards.map((card) => card.style.visibility),
    ["visible", "", ""],
  );
  const replay = dealer.fly(cards, "in");
  assert.equal(layer.children.length, 3);
  dealer.finish();
  await replay;
  assert.equal(layer.children.length, 0);
});

test("settling flights after a viewport change cannot leave cards hidden", async () => {
  const { dealer, cards, layer } = fixture();
  const flight = dealer.fly(cards, "in");
  dealer.finish();
  await flight;
  assert.equal(layer.children.length, 0);
  assert.ok(cards.every((card) => card.style.visibility === ""));
});

test("reduced motion and exchanging zero cards complete without flying or hiding cards", async () => {
  const { dealer, cards, layer, pending } = fixture({ reduced: true });
  await dealer.fly(cards, "in");
  await dealer.fly(cards, "out");
  assert.equal(pending.length, 0);
  assert.equal(layer.children.length, 0);
  assert.ok(cards.every((card) => card.style.visibility === ""));
  const normal = fixture();
  await normal.dealer.fly([], "out");
  assert.equal(normal.pending.length, 0);
});
