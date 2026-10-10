import { ROTATIONS } from "./rules.js?v=20261010-blocks3";

// The handle is always a real square, including shapes with an empty top-left.
export function nearestGrip(cells, x, y) {
  return cells.reduce((best, cell) =>
    Math.hypot(cell[0] - x, cell[1] - y) < Math.hypot(best[0] - x, best[1] - y) ? cell : best,
  );
}
export function rotateGrip(piece, rotation, grip, direction) {
  if (ROTATIONS[piece].length === 1) return { rotation, grip };
  const cells = ROTATIONS[piece][rotation];
  const next = (rotation + direction + ROTATIONS[piece].length) % ROTATIONS[piece].length;
  const transform = ([x, y]) => (direction > 0 ? [-y, x] : [y, -x]);
  const turned = cells.map(transform);
  const left = Math.min(...turned.map(([x]) => x));
  const top = Math.min(...turned.map(([, y]) => y));
  const [x, y] = transform(grip);
  return { rotation: next, grip: [x - left, y - top] };
}
// Metrics start at the centre of the first board square, so CSS gaps and
// responsive cell sizes have the same snapping boundaries as the visible grid.
export function snapPointer(point, metrics, grip) {
  const x = Math.round((point.x - metrics.x) / metrics.stepX);
  const y = Math.round((point.y - metrics.y) / metrics.stepY);
  if (x < 0 || x >= 8 || y < 0 || y >= 8) return null;
  return { x: x - grip[0], y: y - grip[1] };
}
export function pointerPosition(event, metrics, moving) {
  return {
    x: event.clientX,
    // Lift touch drags clear of the finger; a simple tap uses its exact square.
    y: event.clientY - (event.pointerType === "touch" && moving ? metrics.stepY * 1.5 : 0),
  };
}

export function bindPlacementDrag({
  surfaces,
  events,
  begin,
  move,
  end,
  cancel,
  now = () => performance.now(),
}) {
  let active = null,
    suppressUntil = 0;
  function finish(restore, event) {
    if (!active) return;
    const current = active;
    active = null;
    suppressUntil = now() + 700;
    if (event) end(event, current.moving);
    else cancel(restore);
    if (current.surface.hasPointerCapture?.(current.id))
      current.surface.releasePointerCapture(current.id);
  }
  function update(event) {
    if (!active || event.pointerId !== active.id) return;
    if (Math.hypot(event.clientX - active.x, event.clientY - active.y) >= 6) active.moving = true;
    if (active.moving) {
      event.preventDefault();
      move(event);
    }
  }
  for (const surface of surfaces) {
    surface.addEventListener("pointerdown", (event) => {
      if (active || event.isPrimary === false || event.button !== 0) return;
      if (!begin(event, surface)) return;
      active = { id: event.pointerId, x: event.clientX, y: event.clientY, moving: false, surface };
      event.preventDefault();
      surface.setPointerCapture?.(event.pointerId);
    });
    surface.addEventListener("lostpointercapture", (event) => {
      if (active?.id === event.pointerId) finish(true);
    });
    surface.addEventListener(
      "click",
      (event) => {
        // Pointer input is handled above. Leave native keyboard clicks intact.
        if (event.detail > 0 && now() < suppressUntil) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
  }
  events.addEventListener("pointermove", update, { passive: false });
  events.addEventListener("pointerup", (event) => {
    if (active?.id !== event.pointerId) return;
    update(event);
    finish(false, event);
  });
  events.addEventListener("pointercancel", (event) => {
    if (active?.id === event.pointerId) finish(true);
  });
  events.addEventListener("blur", () => finish(true));
  return { cancel: (restore = true) => finish(restore) };
}
