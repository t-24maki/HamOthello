import test from "node:test";
import assert from "node:assert/strict";
import { PIECES, ROTATIONS, createGame, canPlace } from "../blocks/rules.js";
import {
  nearestGrip,
  rotateGrip,
  snapPointer,
  pointerPosition,
  bindPlacementDrag,
} from "../blocks/placement.js";

test("every shape can be picked up at any actual square; empty corners choose a real square", () => {
  for (const piece of PIECES)
    for (const cells of ROTATIONS[piece]) {
      for (const cell of cells) assert.deepEqual(nearestGrip(cells, ...cell), cell);
      for (const point of [
        [0, 0],
        [-8, 8],
        [2, 1],
      ]) {
        const grip = nearestGrip(cells, ...point);
        assert.ok(cells.some((c) => c[0] === grip[0] && c[1] === grip[1]));
      }
    }
  assert.deepEqual(nearestGrip(ROTATIONS.T[0], 1, 0), [1, 0]);
});

test("rotation keeps the grabbed square in the same board location and four turns restore it", () => {
  for (const piece of PIECES)
    for (let r = 0; r < ROTATIONS[piece].length; r++) {
      for (const handle of ROTATIONS[piece][r])
        for (const direction of [-1, 1]) {
          let rotation = r,
            grip = handle,
            anchor = { x: 2, y: 3 };
          const target = [anchor.x + grip[0], anchor.y + grip[1]];
          for (let n = 0; n < 4; n++) {
            const next = rotateGrip(piece, rotation, grip, direction);
            anchor = { x: anchor.x + grip[0] - next.grip[0], y: anchor.y + grip[1] - next.grip[1] };
            ({ rotation, grip } = next);
            assert.ok(ROTATIONS[piece][rotation].some((c) => c[0] === grip[0] && c[1] === grip[1]));
            assert.deepEqual([anchor.x + grip[0], anchor.y + grip[1]], target);
          }
          assert.equal(rotation, r);
          assert.deepEqual(grip, handle);
          assert.deepEqual(anchor, { x: 2, y: 3 });
        }
    }
});

test("snap uses the grabbed square at desktop and small phone cell sizes including gaps", () => {
  for (const step of [32.25, 56.5]) {
    const metrics = { x: 24.5, y: 167.25, stepX: step, stepY: step };
    for (const piece of PIECES)
      for (const cells of ROTATIONS[piece])
        for (const grip of cells) {
          for (const offset of [-0.49, 0, 0.49]) {
            assert.deepEqual(
              snapPointer(
                { x: metrics.x + (3 + offset) * step, y: metrics.y + 4 * step },
                metrics,
                grip,
              ),
              { x: 3 - grip[0], y: 4 - grip[1] },
            );
          }
        }
    assert.equal(snapPointer({ x: metrics.x - step, y: metrics.y }, metrics, [0, 0]), null);
    assert.equal(snapPointer({ x: metrics.x + 8 * step, y: metrics.y }, metrics, [0, 0]), null);
  }
});

test("off-edge previews stay invalid instead of sliding to a different legal place", () => {
  const state = createGame({ blocked: [24, 25, 26, 27] });
  const metrics = { x: 20, y: 20, stepX: 40, stepY: 40 };
  const anchor = snapPointer({ x: 20, y: 20 }, metrics, [1, 0]);
  assert.deepEqual(anchor, { x: -1, y: 0 });
  assert.equal(canPlace(state, { piece: "T", rotation: 0, ...anchor }), false);
  assert.equal(canPlace(state, { piece: "T", rotation: 0, x: 0, y: 0 }), true);
});

test("rotating the square block keeps both its footprint and handle unchanged", () => {
  for (const grip of ROTATIONS.O[0]) {
    assert.deepEqual(rotateGrip("O", 0, grip, 1), { rotation: 0, grip });
    assert.deepEqual(rotateGrip("O", 0, grip, -1), { rotation: 0, grip });
  }
});

test("touch drags lift the handle above the finger; taps and mouse keep the exact point", () => {
  const event = { clientX: 110, clientY: 240, pointerType: "touch" };
  const metrics = { stepY: 32 };
  assert.deepEqual(pointerPosition(event, metrics, true), { x: 110, y: 192 });
  assert.deepEqual(pointerPosition(event, metrics, false), { x: 110, y: 240 });
  assert.deepEqual(pointerPosition({ ...event, pointerType: "mouse" }, metrics, true), {
    x: 110,
    y: 240,
  });
});

class Events {
  listeners = new Map();
  captures = new Set();
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  setPointerCapture(id) {
    this.captures.add(id);
  }
  hasPointerCapture(id) {
    return this.captures.has(id);
  }
  releasePointerCapture(id) {
    this.captures.delete(id);
    this.emit("lostpointercapture", { pointerId: id });
  }
  emit(type, props = {}) {
    const event = {
      pointerId: 1,
      button: 0,
      isPrimary: true,
      clientX: 10,
      clientY: 20,
      prevented: false,
      stopped: false,
      preventDefault() {
        this.prevented = true;
      },
      stopImmediatePropagation() {
        this.stopped = true;
      },
      ...props,
    };
    for (const fn of this.listeners.get(type) ?? []) {
      fn(event);
      if (event.stopped) break;
    }
    return event;
  }
}
function harness(allowed = true) {
  const hand = new Events(),
    board = new Events(),
    events = new Events(),
    log = [];
  let time = 0;
  const controller = bindPlacementDrag({
    surfaces: [hand, board],
    events,
    now: () => time,
    begin: () => {
      log.push("begin");
      return allowed;
    },
    move: (e) => log.push(["move", e.clientX, e.clientY]),
    end: (e, moving) => log.push(["end", moving, e.clientX, e.clientY]),
    cancel: (restore) => log.push(["cancel", restore]),
  });
  return {
    hand,
    board,
    events,
    log,
    controller,
    advance: () => {
      time += 800;
    },
  };
}

test("tap does not become a drag from small finger jitter and its synthetic click is consumed", () => {
  const h = harness();
  h.hand.emit("pointerdown");
  h.events.emit("pointermove", { clientX: 12, clientY: 23 });
  h.events.emit("pointerup", { clientX: 12, clientY: 23 });
  assert.deepEqual(h.log, ["begin", ["end", false, 12, 23]]);
  assert.equal(h.hand.captures.size, 0);
  assert.equal(h.hand.emit("click", { detail: 1 }).stopped, true);
  assert.equal(h.hand.emit("click", { detail: 0 }).stopped, false);
  h.advance();
  assert.equal(h.hand.emit("click", { detail: 1 }).stopped, false);
});

test("a captured drag updates through release and ends once, including outside its source", () => {
  const h = harness();
  h.hand.emit("pointerdown");
  h.events.emit("pointermove", { clientX: 110 });
  h.events.emit("pointerup", { clientX: 210, clientY: 300 });
  h.events.emit("pointerup");
  assert.deepEqual(h.log, [
    "begin",
    ["move", 110, 20],
    ["move", 210, 300],
    ["end", true, 210, 300],
  ]);
  assert.equal(h.hand.captures.size, 0);
});

test("a second finger and right click cannot hijack or finish the held piece", () => {
  const h = harness();
  h.hand.emit("pointerdown", { button: 2 });
  h.hand.emit("pointerdown", { isPrimary: false });
  assert.deepEqual(h.log, []);
  h.hand.emit("pointerdown");
  h.board.emit("pointerdown", { pointerId: 2 });
  h.events.emit("pointermove", { pointerId: 2, clientX: 500 });
  h.events.emit("pointerup", { pointerId: 2 });
  assert.deepEqual(h.log, ["begin"]);
  assert.ok(h.hand.hasPointerCapture(1));
  h.events.emit("pointerup");
  assert.equal(h.log.at(-1)[0], "end");
});

test("pointer cancellation, lost capture and blur restore the preview without dropping", () => {
  for (const trigger of ["pointercancel", "lostpointercapture", "blur"]) {
    const h = harness();
    h.hand.emit("pointerdown");
    (trigger === "lostpointercapture" ? h.hand : h.events).emit(trigger);
    h.events.emit("pointerup");
    assert.deepEqual(h.log, ["begin", ["cancel", true]]);
    assert.equal(h.hand.captures.size, 0);
  }
});

test("a mode or turn change cancels without restoring an outdated position", () => {
  const h = harness();
  h.board.emit("pointerdown");
  h.controller.cancel(false);
  h.events.emit("pointermove", { clientX: 400 });
  h.events.emit("pointerup");
  assert.deepEqual(h.log, ["begin", ["cancel", false]]);
});

test("disabled or opponent-turn input never takes capture or suppresses normal scrolling", () => {
  const h = harness(false);
  assert.equal(h.hand.emit("pointerdown").prevented, false);
  assert.equal(h.events.emit("pointermove", { clientX: 100 }).prevented, false);
  h.events.emit("pointerup");
  assert.deepEqual(h.log, ["begin"]);
  assert.equal(h.hand.captures.size, 0);
});
