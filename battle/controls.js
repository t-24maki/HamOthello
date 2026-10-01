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
  for (const button of buttons) {
    button.addEventListener("pointerdown", (event) => {
      if (!isActive() || (event.pointerType === "mouse" && event.button !== 0)) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, {
        button,
        direction: ["left", "right"].includes(button.dataset.action),
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
      // Capture stays on the original button; coordinates choose the live direction.
      const rect = pad.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left - 16 &&
        event.clientX <= rect.right + 16 &&
        event.clientY >= rect.top - 16 &&
        event.clientY <= rect.bottom + 16;
      input.release(source(event.pointerId));
      if (inside)
        input.press(
          source(event.pointerId),
          event.clientX < (rect.left + rect.right) / 2 ? "left" : "right",
        );
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
