export const KEY_ACTIONS = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "jump",
  KeyW: "jump",
  ArrowDown: "guard",
  KeyS: "guard",
  KeyI: "special",
  KeyO: "attack",
  Space: "jump",
  KeyZ: "attack",
  KeyJ: "attack",
  KeyX: "special",
  KeyK: "special",
  KeyC: "guard",
  KeyL: "guard",
};
export function createInput() {
  const held = new Map(),
    pending = new Set();
  return {
    press(source, action) {
      if (held.has(source)) return;
      this.set(source, [action]);
    },
    set(source, actions) {
      const previous = held.get(source) || new Set();
      const next = new Set(actions);
      for (const action of next)
        if (!previous.has(action) && ["jump", "attack", "special"].includes(action))
          pending.add(action);
      if (next.size) held.set(source, next);
      else held.delete(source);
    },
    release(source) {
      held.delete(source);
    },
    clear() {
      held.clear();
      pending.clear();
    },
    has(action) {
      return [...held.values()].some((actions) => actions.has(action));
    },
    consume() {
      const state = {
        move: Number(this.has("right")) - Number(this.has("left")),
        guard: this.has("guard"),
        jump: pending.has("jump"),
        attack: pending.has("attack"),
        special: pending.has("special"),
      };
      pending.clear();
      return state;
    },
  };
}
