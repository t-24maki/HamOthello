import { protectGameSurface } from "../battle/controls.js?v=20261021-battle21";

export const DEAD_ZONE = 0.12;
export function stickVector(dx, dy, radius) {
  if (![dx, dy, radius].every(Number.isFinite) || radius <= 0) return { x: 0, y: 0 };
  const distance = Math.hypot(dx, dy);
  const magnitude = Math.min(1, distance / radius);
  if (magnitude <= DEAD_ZONE) return { x: 0, y: 0 };
  const speed = (magnitude - DEAD_ZONE) / (1 - DEAD_ZONE);
  return { x: (dx / distance) * speed, y: (dy / distance) * speed };
}

export function bindStick(controls, input, { isActive }) {
  protectGameSurface(controls);
  const stick = controls.querySelector(".stick");
  const thumb = stick.querySelector(".stick-thumb");
  let pointer = null;
  const source = "stick";
  function radius() {
    return Math.max(
      1,
      (stick.getBoundingClientRect().width - thumb.getBoundingClientRect().width) / 2 - 6,
    );
  }
  function refresh() {
    const vector = input.read();
    const length = Math.max(1, Math.hypot(vector.x, vector.y));
    const travel = radius();
    stick.style.setProperty("--stick-x", `${(vector.x / length) * travel}px`);
    stick.style.setProperty("--stick-y", `${(vector.y / length) * travel}px`);
    stick.classList.toggle("is-held", pointer !== null || !!(vector.x || vector.y));
  }
  function release(id) {
    if (pointer !== id) return;
    pointer = null;
    input.release(source);
    if (stick.hasPointerCapture(id)) stick.releasePointerCapture(id);
    refresh();
  }
  function move(event) {
    if (pointer !== event.pointerId) return;
    if (!isActive()) return release(event.pointerId);
    event.preventDefault();
    const rect = stick.getBoundingClientRect();
    input.setVector(
      source,
      stickVector(
        event.clientX - rect.left - rect.width / 2,
        event.clientY - rect.top - rect.height / 2,
        radius(),
      ),
    );
    refresh();
  }
  stick.addEventListener("pointerdown", (event) => {
    if (!isActive() || pointer !== null || (event.pointerType === "mouse" && event.button !== 0))
      return;
    event.preventDefault();
    pointer = event.pointerId;
    stick.setPointerCapture(pointer);
    move(event);
  });
  stick.addEventListener("pointermove", move);
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    stick.addEventListener(type, (event) => release(event.pointerId));
  return {
    refresh,
    clear() {
      if (pointer !== null) release(pointer);
      input.clear();
      refresh();
    },
  };
}
