// Each pointer owns its input, so sliding a thumb never cancels another finger/key.
export function bindControls(controls, input, { isActive, onInteract }) {
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
    const rect = pad.getBoundingClientRect();
    const inside =
      x >= rect.left - 16 && x <= rect.right + 16 && y >= rect.top - 16 && y <= rect.bottom + 16;
    const dx = (x - (rect.left + rect.right) / 2) / ((rect.right - rect.left) / 2);
    const dy = (y - (rect.top + rect.bottom) / 2) / ((rect.bottom - rect.top) / 2);
    const actions = [];
    if (inside) {
      if (Math.abs(dx) > 0.28) actions.push(dx < 0 ? "left" : "right");
      if (Math.abs(dy) > 0.28) actions.push(dy < 0 ? "jump" : "guard");
    }
    // Preserve edges that remain held when a diagonal changes only on one axis.
    input.set(source(id), actions);
  }
  for (const button of buttons) {
    button.addEventListener("pointerdown", (event) => {
      if (!isActive() || (event.pointerType === "mouse" && event.button !== 0)) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, {
        button,
        direction: !!button.dataset.direction,
      });
      input.press(source(event.pointerId), button.dataset.action);
      refresh();
      onInteract();
    });
    button.addEventListener("pointermove", (event) => {
      const pointer = pointers.get(event.pointerId);
      if (!pointer?.direction) return;
      event.preventDefault();
      if (!isActive()) return release(event.pointerId);
      // Capture stays on the original button while one thumb can hold two axes.
      slide(event.pointerId, event.clientX, event.clientY);
      refresh();
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      button.addEventListener(type, (event) => release(event.pointerId));
    button.addEventListener("click", (event) => {
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
