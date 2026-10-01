export const KEY_ACTIONS = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "jump",
  KeyW: "jump",
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
      held.set(source, action);
      if (["jump", "attack", "special"].includes(action)) pending.add(action);
    },
    release(source) {
      held.delete(source);
    },
    clear() {
      held.clear();
      pending.clear();
    },
    has(action) {
      return [...held.values()].includes(action);
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
