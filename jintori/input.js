// Keyboard and analog input share a vector, without reducing angles to 8 ways.
export const KEYS = {
  KeyW: "jump",
  ArrowUp: "jump",
  KeyS: "guard",
  ArrowDown: "guard",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};
export function createInput() {
  const held = new Map();
  const analog = new Map();
  let pulse = null,
    pulseTime = 0;
  const has = (action) => [...held.values()].some((actions) => actions.has(action));
  function read() {
    const active = (action) => has(action) || (pulseTime > 0 && pulse === action);
    const digital = {
      x: Number(active("right")) - Number(active("left")),
      y: Number(active("guard")) - Number(active("jump")),
    };
    if (digital.x || digital.y) return digital;
    return { ...([...analog.values()].at(-1) || { x: 0, y: 0 }) };
  }
  return {
    press(source, action) {
      held.set(source, new Set([action]));
      if (source === "accessible") {
        pulse = action;
        pulseTime = 0.15;
      }
    },
    set(source, actions) {
      held.set(source, new Set(actions));
    },
    setVector(source, vector) {
      const x = Number.isFinite(vector.x) ? vector.x : 0;
      const y = Number.isFinite(vector.y) ? vector.y : 0;
      const length = Math.max(1, Math.hypot(x, y));
      analog.set(source, { x: x / length, y: y / length });
    },
    release(source) {
      held.delete(source);
      analog.delete(source);
    },
    has,
    read,
    clear() {
      held.clear();
      analog.clear();
      pulse = null;
      pulseTime = 0;
    },
    consume(dt = 1 / 60) {
      const input = read();
      pulseTime = Math.max(0, pulseTime - dt);
      return input;
    },
  };
}
