import test from "node:test";
import assert from "node:assert/strict";
import { createMatch, tick, advance, pause, resume, EMPTY_INPUT } from "../battle/engine.js";
import { createInput, KEY_ACTIONS } from "../battle/input.js";
import { bindControls, protectGameSurface } from "../battle/controls.js";
const empty = () => ({ ...EMPTY_INPUT });
function game() {
  const g = createMatch();
  g.phase = "playing";
  return g;
}
function step(g, action = {}) {
  tick(g, [{ ...empty(), ...action }, empty()]);
}
function run(g, count) {
  for (let i = 0; i < count; i++) step(g);
}
function events(g, type) {
  return g.events.filter((e) => e.type === type).length;
}

test("jump tapped shortly before an attack ends starts exactly once after it ends", () => {
  const g = game();
  step(g, { attack: true });
  run(g, 24);
  step(g, { jump: true });
  assert.equal(events(g, "jump"), 0);
  run(g, 14);
  assert.equal(events(g, "jump"), 1);
  assert.equal(g.fighters[0].grounded, false);
  run(g, 150);
  assert.equal(events(g, "jump"), 1);
});
test("a tap made too early expires instead of surprising the player later", () => {
  const g = game();
  step(g, { attack: true });
  step(g, { jump: true });
  run(g, 48);
  assert.equal(events(g, "jump"), 0);
  assert.equal(g.fighters[0].grounded, true);
});
test("an early landing jump works after both air jumps have been spent", () => {
  const g = game(),
    f = g.fighters[0];
  Object.assign(f, { x: 400, y: 353, vy: 180, grounded: false, jumps: 2 });
  step(g, { jump: true });
  assert.equal(events(g, "jump"), 0);
  run(g, 12);
  assert.equal(events(g, "jump"), 1);
  assert.equal(f.jumps, 1);
  assert.ok(f.vy < 0);
});
test("attack and special taps survive the last part of their cooldown, without repeating", () => {
  for (const action of ["attack", "special"]) {
    const g = game(),
      f = g.fighters[0];
    f[action === "attack" ? "cooldown" : "specialCooldown"] = 0.09;
    step(g, { [action]: true });
    assert.equal(f.attack, null);
    run(g, 14);
    assert.equal(f.attack?.kind, action === "attack" ? "normal" : "special");
    run(g, 90);
    assert.equal(events(g, action === "attack" ? "swing" : "special"), 1);
  }
});
test("a held keyboard jump does not turn a buffered tap into automatic air jumps", () => {
  const g = game(),
    input = createInput();
  step(g, { attack: true });
  run(g, 25);
  for (let i = 0; i < 65; i++) {
    input.press("key:Space", "jump");
    tick(g, [input.consume(), empty()]);
  }
  assert.equal(events(g, "jump"), 1);
});
test("simultaneous attack buttons keep special priority without a delayed normal attack", () => {
  const g = game();
  step(g, { attack: true, special: true });
  run(g, 80);
  assert.equal(events(g, "special"), 1);
  assert.equal(events(g, "swing"), 0);
});
test("pause discards queued actions and resuming does not execute an old tap", () => {
  const g = game();
  g.fighters[0].cooldown = 0.09;
  step(g, { attack: true });
  pause(g);
  resume(g);
  run(g, 24);
  assert.equal(events(g, "swing"), 0);
});
test("respawn and match end discard queued actions", () => {
  const g = game(),
    f = g.fighters[0];
  f.cooldown = 0.09;
  Object.assign(f, { x: -100, y: 500, grounded: false });
  step(g, { attack: true });
  run(g, 120);
  assert.equal(events(g, "swing"), 0);
  assert.equal(f.stocks, 2);
  f.cooldown = 0.09;
  g.remaining = 0.001;
  step(g, { attack: true });
  assert.equal(g.phase, "finished");
  assert.ok(Object.values(f.buffered).every((value) => value === 0));
});
test("buffered actions have the same result at 30, 60 and 144 rendering fps", () => {
  const states = [30, 60, 144].map((fps) => {
    const g = game();
    let n = 0;
    for (let frame = 0; frame < fps * 2; frame++)
      advance(g, 1 / fps, () => {
        const action = n === 0 ? { attack: true } : n === 25 ? { jump: true } : {};
        n++;
        return [{ ...empty(), ...action }, empty()];
      });
    assert.equal(events(g, "jump"), 1);
    return g.fighters;
  });
  assert.deepEqual(states[0], states[1]);
  assert.deepEqual(states[0], states[2]);
});

// Exercise the production event handlers with independent captured pointers.
class Button extends EventTarget {
  constructor(action) {
    super();
    this.dataset = { action };
    if (["left", "right", "jump", "guard"].includes(action)) this.dataset.direction = action;
    this.captured = new Set();
    this.held = false;
    this.classList = {
      toggle: (_, state) => {
        this.held = state;
      },
    };
  }
  setPointerCapture(id) {
    this.captured.add(id);
  }
  hasPointerCapture(id) {
    return this.captured.has(id);
  }
  releasePointerCapture(id) {
    this.captured.delete(id);
    send(this, "lostpointercapture", id);
  }
}
function send(button, type, id = 1, x = 36, y = 234, extra = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, {
    pointerId: id,
    pointerType: "touch",
    clientX: x,
    clientY: y,
    button: 0,
    detail: 1,
    ...extra,
  });
  button.dispatchEvent(event);
  return event;
}
function controls() {
  const input = createInput();
  const buttons = Object.fromEntries(
    ["left", "right", "jump", "attack", "special", "guard"].map((action) => [
      action,
      new Button(action),
    ]),
  );
  const rect = { left: 10, right: 122, top: 200, bottom: 268 };
  let active = true;
  const surface = Object.assign(new EventTarget(), {
    querySelectorAll: () => Object.values(buttons),
    querySelector: () => ({ getBoundingClientRect: () => rect }),
  });
  const binding = bindControls(surface, input, { isActive: () => active, onInteract: () => {} });
  return {
    input,
    buttons,
    binding,
    rect,
    surface,
    deactivate: () => {
      active = false;
    },
  };
}
test("one captured thumb slides left to right and back, then releasing clears both", () => {
  const { input, buttons: b } = controls();
  send(b.left, "pointerdown");
  assert.equal(input.consume().move, -1);
  send(b.left, "pointermove", 1, 95);
  assert.equal(input.consume().move, 1);
  assert.equal(b.right.held, true);
  assert.equal(b.left.held, false);
  send(b.left, "pointermove", 1, 36);
  assert.equal(input.consume().move, -1);
  send(b.left, "pointerup");
  assert.equal(input.consume().move, 0);
  assert.equal(b.left.held || b.right.held, false);
});
test("sliding preserves a second finger's jump or guard and separately held keyboard inputs", () => {
  const { input, buttons: b } = controls();
  send(b.left, "pointerdown", 1);
  send(b.jump, "pointerdown", 2);
  send(b.guard, "pointerdown", 3);
  send(b.left, "pointermove", 1, 95);
  assert.deepEqual(input.consume(), { ...empty(), move: 1, jump: true, guard: true });
  input.press("key:D", "right");
  send(b.left, "pointerup", 1);
  assert.equal(input.consume().move, 1);
  send(b.guard, "pointerup", 3);
  assert.equal(input.consume().guard, false);
  input.release("key:D");
  assert.equal(input.consume().move, 0);
});
test("leaving the direction pad stops movement, returning restores it and uses resized bounds", () => {
  const { input, buttons: b, rect } = controls();
  send(b.left, "pointerdown");
  send(b.left, "pointermove", 1, 95, 100);
  assert.equal(input.consume().move, 0);
  send(b.left, "pointermove", 1, 95);
  assert.equal(input.consume().move, 1);
  Object.assign(rect, { left: 100, right: 220 });
  send(b.left, "pointermove", 1, 130);
  assert.equal(input.consume().move, -1);
});
test("pointer cancellation and lost capture cannot leave a direction or guard stuck", () => {
  for (const type of ["pointercancel", "lostpointercapture"]) {
    const { input, buttons: b } = controls();
    send(b.left, "pointerdown", 1);
    send(b.guard, "pointerdown", 2);
    send(b.left, "pointermove", 1, 95);
    send(b.left, type, 1);
    send(b.guard, type, 2);
    assert.deepEqual(input.consume(), empty());
    assert.equal(b.right.held || b.guard.held, false);
  }
});
test("pausing clears captured pointers, keys and pending taps; an old drag cannot reactivate them", () => {
  const { input, buttons: b, binding } = controls();
  send(b.left, "pointerdown", 1);
  send(b.jump, "pointerdown", 2);
  input.press("key:D", "right");
  binding.clear();
  send(b.left, "pointermove", 1, 95);
  assert.deepEqual(input.consume(), empty());
  assert.equal(b.left.hasPointerCapture(1), false);
  assert.equal(b.jump.hasPointerCapture(2), false);
});
test("inactive controls and secondary mouse buttons do not act, accessible clicks still jump", () => {
  const { input, buttons: b, deactivate } = controls();
  send(b.left, "pointerdown", 1, 36, 234, { pointerType: "mouse", button: 2 });
  assert.deepEqual(input.consume(), empty());
  send(b.jump, "click", 1, 0, 0, { detail: 0 });
  assert.equal(input.consume().jump, true);
  deactivate();
  send(b.jump, "pointerdown", 2);
  send(b.jump, "click", 1, 0, 0, { detail: 0 });
  assert.deepEqual(input.consume(), empty());
});

test("WASD directions combine with left I/B special and right O/A attack independently", () => {
  const input = createInput();
  for (const key of ["KeyD", "KeyW", "KeyI"]) input.press(key, KEY_ACTIONS[key]);
  assert.deepEqual(input.consume(), { ...empty(), move: 1, jump: true, special: true });
  input.press("KeyW", KEY_ACTIONS.KeyW);
  input.release("KeyI");
  input.press("KeyO", KEY_ACTIONS.KeyO);
  assert.deepEqual(input.consume(), { ...empty(), move: 1, attack: true });
  input.release("KeyD");
  input.press("KeyA", KEY_ACTIONS.KeyA);
  input.press("KeyS", KEY_ACTIONS.KeyS);
  assert.deepEqual(input.consume(), { ...empty(), move: -1, guard: true });
  assert.equal(KEY_ACTIONS.ArrowDown, "guard");
});

test("diagonal sliding jumps once, keeps the held axis through turns, and supports a second jump", () => {
  const { input, buttons: b } = controls();
  send(b.left, "pointerdown");
  send(b.left, "pointermove", 1, 36, 210);
  assert.deepEqual(input.consume(), { ...empty(), move: -1, jump: true });
  send(b.left, "pointermove", 1, 35, 211);
  assert.equal(input.consume().jump, false);
  send(b.left, "pointermove", 1, 95, 211);
  assert.deepEqual(input.consume(), { ...empty(), move: 1 });
  send(b.left, "pointermove", 1, 95, 234);
  send(b.left, "pointermove", 1, 95, 210);
  assert.deepEqual(input.consume(), { ...empty(), move: 1, jump: true });
});

test("down-diagonal guard, central neutral, and an independent A/B finger release cleanly", () => {
  const { input, buttons: b } = controls();
  send(b.left, "pointerdown");
  send(b.left, "pointermove", 1, 36, 260);
  send(b.attack, "pointerdown", 2);
  assert.deepEqual(input.consume(), { ...empty(), move: -1, guard: true, attack: true });
  send(b.left, "pointermove", 1, 66, 234);
  assert.deepEqual(input.consume(), empty());
  assert.equal(input.has("attack"), true);
  send(b.attack, "pointerup", 2);
  send(b.special, "pointerdown", 3);
  send(b.left, "pointercancel");
  assert.deepEqual(input.consume(), { ...empty(), special: true });
  send(b.special, "pointerup", 3);
  assert.equal(input.has("special"), false);
});

test("game surfaces cancel native touch, zoom, selection and drag without blocking event delivery", () => {
  const surface = new EventTarget();
  const subscriptions = [];
  const add = surface.addEventListener.bind(surface);
  surface.addEventListener = (type, listener, options) => {
    subscriptions.push({ type, options });
    add(type, listener, options);
  };
  protectGameSurface(surface);
  for (const type of [
    "touchstart",
    "touchmove",
    "touchend",
    "gesturestart",
    "gesturechange",
    "gestureend",
    "dblclick",
    "contextmenu",
    "selectstart",
    "dragstart",
  ]) {
    let delivered = false;
    add(type, () => {
      delivered = true;
    });
    const event = new Event(type, { cancelable: true });
    surface.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true, type);
    assert.equal(delivered, true, type);
    assert.equal(subscriptions.find((s) => s.type === type).options.passive, false, type);
  }
});

test("gesture protection leaves outside-page gestures and ordinary activation available", () => {
  const surface = new EventTarget(),
    outside = new EventTarget();
  protectGameSurface(surface);
  for (const type of ["touchstart", "touchmove", "touchend", "selectstart", "gesturechange"])
    assert.equal(send(outside, type).defaultPrevented, false, type);
  for (const type of ["click", "keydown", "pointerdown", "pointerup", "wheel"])
    assert.equal(send(surface, type).defaultPrevented, false, type);
  const unpreventable = new Event("touchmove");
  unpreventable.preventDefault = () => assert.fail("non-cancelable events must be left alone");
  surface.dispatchEvent(unpreventable);
});

test("rapid taps produce one action each while another finger keeps moving", () => {
  const { input, buttons: b, surface } = controls();
  send(b.left, "pointerdown", 1);
  input.consume();
  for (let i = 0; i < 20; i++) {
    const action = i % 2 ? "special" : "attack";
    send(b[action], "pointerdown", 2);
    assert.equal(send(surface, "touchstart", 2).defaultPrevented, true);
    assert.deepEqual(input.consume(), { ...empty(), move: -1, [action]: true });
    send(b[action], "pointerup", 2);
    assert.equal(send(surface, "touchend", 2).defaultPrevented, true);
    send(b[action], "click", 2);
    assert.deepEqual(input.consume(), { ...empty(), move: -1 });
  }
  send(b.left, "pointerup", 1);
  assert.deepEqual(input.consume(), empty());
});

test("countdown/inactive control touches cannot start a native gesture or queue an attack", () => {
  const { input, buttons: b, surface, deactivate } = controls();
  deactivate();
  send(b.attack, "pointerdown");
  for (const type of ["touchstart", "touchmove", "touchend"])
    assert.equal(send(surface, type).defaultPrevented, true);
  send(b.attack, "pointerup");
  send(b.attack, "click");
  assert.deepEqual(input.consume(), empty());
});

test("sliding an attack finger cancels its native movement and releases on interruption", () => {
  const { input, buttons: b, deactivate } = controls();
  send(b.attack, "pointerdown");
  assert.equal(input.consume().attack, true);
  assert.equal(send(b.attack, "pointermove", 1, 95).defaultPrevented, true);
  assert.equal(input.has("attack"), true);
  assert.equal(input.consume().attack, false);
  deactivate();
  send(b.attack, "pointermove", 1, 95);
  assert.equal(input.has("attack"), false);
});

test("small vertical thumb drift keeps horizontal movement without jumping or guarding", () => {
  const { input, buttons: b } = controls();
  send(b.left, "pointerdown");
  for (const y of [224, 220, 234, 246, 250]) {
    send(b.left, "pointermove", 1, 36, y);
    assert.deepEqual(input.consume(), { ...empty(), move: -1 });
  }
  send(b.left, "pointermove", 1, 36, 210);
  assert.deepEqual(input.consume(), { ...empty(), move: -1, jump: true });
});

test("jitter at the jump boundary cannot consume a second jump until the thumb returns to neutral", () => {
  const { input, buttons: b } = controls();
  send(b.left, "pointerdown");
  send(b.left, "pointermove", 1, 36, 214);
  assert.equal(input.consume().jump, true);
  for (const y of [217, 219, 215, 217, 214]) {
    send(b.left, "pointermove", 1, 36, y);
    assert.deepEqual(input.consume(), { ...empty(), move: -1 });
    assert.equal(input.has("jump"), true);
  }
  send(b.left, "pointermove", 1, 36, 234);
  assert.equal(input.has("jump"), false);
  send(b.left, "pointermove", 1, 36, 214);
  assert.equal(input.consume().jump, true);
});

test("returning from outside the pad resets the directional hysteresis", () => {
  const { input, buttons: b } = controls();
  send(b.jump, "pointerdown");
  input.consume();
  send(b.jump, "pointermove", 1, 36, 100);
  assert.deepEqual(input.consume(), empty());
  send(b.jump, "pointermove", 1, 36, 220);
  assert.deepEqual(input.consume(), { ...empty(), move: -1 });
});

test("an explicitly exempt native control can still activate inside a protected match surface", () => {
  const surface = new EventTarget();
  let nativeControl = false;
  protectGameSurface(surface, { allowTarget: (target) => nativeControl && target === surface });
  assert.equal(send(surface, "touchend").defaultPrevented, true);
  nativeControl = true;
  for (const type of ["touchstart", "touchmove", "touchend", "click"])
    assert.equal(send(surface, type).defaultPrevented, false);
  nativeControl = false;
  assert.equal(send(surface, "touchstart").defaultPrevented, true);
});
