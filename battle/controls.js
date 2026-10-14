// Pointer input and browser touch gestures are separate. Cancel the latter only
// on game surfaces, including gaps/labels and touches during the countdown.
export function protectGameSurface(surface, { allowTarget = () => false } = {}) {
  const prevent = (event) => {
    if (!allowTarget(event.target) && event.cancelable) event.preventDefault();
  };
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
  ])
    surface.addEventListener(type, prevent, { passive: false, capture: true });
}

// Each pointer owns its input, so sliding a thumb never cancels another finger/key.
export function bindControls(controls, input, { isActive, onInteract }) {
  protectGameSurface(controls);
  const buttons = [...controls.querySelectorAll("[data-action]")];
  const pad = controls.querySelector(".move-controls");
  const pointers = new Map();
  const source = (id) => `pointer:${id}`;
  function refresh() {
    for (const button of buttons)
      button.classList.toggle("is-held", input.has(button.dataset.action));
  }
  function release(id) {
    pointers.delete(id);
    input.release(source(id));
    refresh();
  }
  function slide(id, x, y) {
    const pointer = pointers.get(id);
    const rect = pad.getBoundingClientRect();
    const inside =
      x >= rect.left - 16 && x <= rect.right + 16 && y >= rect.top - 16 && y <= rect.bottom + 16;
    const dx = (x - (rect.left + rect.right) / 2) / ((rect.right - rect.left) / 2);
    const dy = (y - (rect.top + rect.bottom) / 2) / ((rect.bottom - rect.top) / 2);
    const actions = [];
    if (inside) {
      // Enter farther from the centre than we release: slight thumb jitter must
      // neither jump accidentally nor retrigger a held jump at the boundary.
      const axis = (value, negative, positive, enter, leave) => {
        const action = value < 0 ? negative : positive;
        const threshold = pointer.actions.has(action) ? leave : enter;
        if (Math.abs(value) > threshold) actions.push(action);
      };
      axis(dx, "left", "right", 0.34, 0.22);
      axis(dy, "jump", "guard", 0.52, 0.35);
    }
    // Preserve edges that remain held when a diagonal changes only on one axis.
    input.set(source(id), actions);
    pointer.actions = new Set(actions);
  }
  for (const button of buttons) {
    button.addEventListener("pointerdown", (event) => {
      if (!isActive() || (event.pointerType === "mouse" && event.button !== 0)) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, {
        button,
        direction: !!button.dataset.direction,
        actions: new Set([button.dataset.action]),
      });
      input.press(source(event.pointerId), button.dataset.action);
      refresh();
      onInteract();
    });
    button.addEventListener("pointermove", (event) => {
      const pointer = pointers.get(event.pointerId);
      if (!pointer) return;
      event.preventDefault();
      if (!isActive()) return release(event.pointerId);
      // Capture stays on the original button while one thumb can hold two axes.
      if (pointer.direction) slide(event.pointerId, event.clientX, event.clientY);
      refresh();
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      button.addEventListener(type, (event) => release(event.pointerId));
    button.addEventListener("click", (event) => {
      // Touches are handled by pointer events; retain keyboard/assistive clicks.
      if (event.detail !== 0) event.preventDefault();
      if (event.detail === 0 && isActive()) {
        input.press("accessible", button.dataset.action);
        input.release("accessible");
        onInteract();
      }
    });
  }
  return {
    refresh,
    clear() {
      const active = [...pointers];
      pointers.clear();
      input.clear();
      for (const [id, { button }] of active)
        if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
      refresh();
    },
  };
}
