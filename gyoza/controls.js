import { SHAPES, rotatedBounds } from "./shapes.js?v=20261027-gyoza3";
// Direct manipulation keeps the grabbed point under the finger; releasing never drops.
export function createControls({ board, read, move }) {
  let drag = null;
  function reset() {
    drag = null;
    board.classList.remove("dragging");
  }
  function location(e, state) {
    const rect = board.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - state.map.ox) / state.map.scale,
      y: (e.clientY - rect.top - state.map.oy) / state.map.scale,
    };
  }
  board.addEventListener("pointerdown", (e) => {
    const state = read();
    if (!state?.enabled || !state.map || drag || e.isPrimary === false || e.button > 0) return;
    e.preventDefault();
    board.focus({ preventScroll: true });
    const p = location(e, state),
      b = rotatedBounds(state.type, state.angle),
      pad = 18 / state.map.scale;
    const grabbed =
      p.x >= state.x + b.minX - pad &&
      p.x <= state.x + b.maxX + pad &&
      p.y >= state.y + b.minY - pad &&
      p.y <= state.y + b.maxY + pad;
    drag = { id: e.pointerId, offset: grabbed ? p.x - state.x : 0 };
    board.setPointerCapture(e.pointerId);
    board.classList.add("dragging");
    move(p.x - drag.offset);
  });
  board.addEventListener("pointermove", (e) => {
    const state = read();
    if (!drag || drag.id !== e.pointerId || !state?.enabled || !state.map) return;
    move(location(e, state).x - drag.offset);
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    board.addEventListener(name, (e) => {
      if (drag?.id === e.pointerId) {
        drag = null;
        board.classList.remove("dragging");
      }
    });
  return {
    reset,
    tick() {
      const state = read();
      board.dataset.interactive = String(!!state?.enabled);
      if (!state?.enabled) {
        reset();
        return;
      }
    },
  };
}

// Keep the entire rotate/drop row on screen and below the piece, at a stable height.
export function pieceControlsPosition(width, state, controlsWidth = 208) {
  const radius = Math.max(...SHAPES[state.type].points.map((p) => Math.hypot(p.x, p.y)));
  const inset = controlsWidth / 2 + 8;
  return {
    x: Math.max(inset, Math.min(width - inset, state.map.ox + state.x * state.map.scale)),
    y: state.map.oy + state.y * state.map.scale + Math.max(26, radius * state.map.scale) + 9,
  };
}
