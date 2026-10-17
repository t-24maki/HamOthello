import { CHARACTERS } from "./engine.js?v=20261017-battle19";
const PALETTES = {
  tak: { color: "#a98ac5", fill: "#dfd2eb", ink: "#795791", label: "むらさき" },
  meg: { color: "#e2b967", fill: "#f6e3bd", ink: "#8b6634", label: "クリーム色" },
  takAlt: { color: "#85a9d3", fill: "#dae9fa", ink: "#567ba5", label: "そら色" },
  megAlt: { color: "#d49c8d", fill: "#f8ded5", ink: "#9a695c", label: "もも色" },
  ham: { color: "#e8ad59", fill: "#fae7bf", ink: "#99632c", label: "青まわし" },
  hamAlt: { color: "#7eaf94", fill: "#deeee3", ink: "#477d60", label: "緑まわし" },
  tapi: { color: "#df9eaa", fill: "#f9e0e5", ink: "#a05d70", label: "もも色" },
  tapiAlt: { color: "#a1cfe6", fill: "#e1f1fa", ink: "#4f829f", label: "水色" },
};
// Derive the palette from seats, not the viewing player: both screens see the same colors.
export function fighterAppearance(game, index) {
  const character = game.fighters[index].character;
  const same = game.fighters[0].character === game.fighters[1].character;
  const alternate = same && index === 1;
  const key = character + (alternate ? "Alt" : "");
  return {
    ...PALETTES[key],
    key,
    alternate,
    character,
    name: same
      ? `${PALETTES[key].label}の${CHARACTERS[character].name}`
      : CHARACTERS[character].name,
  };
}
// Cached runtime palette swap: Ham changes only his blue belt; the other
// characters change body color. Outlines, faces and alpha remain intact.
export function tintFur(pixels, character) {
  const clamp = (v) => Math.max(0, Math.min(1, v));
  for (let i = 0; i < pixels.length; i += 4) {
    if (!pixels[i + 3]) continue;
    const r = pixels[i],
      g = pixels[i + 1],
      b = pixels[i + 2];
    if (character === "tak") {
      const amount =
        clamp((Math.min(r, g, b) - 140) / 40) * clamp((b - g - 6) / 16) * clamp((b - r + 22) / 16);
      pixels[i] = Math.round(r - 42 * amount);
      pixels[i + 1] = Math.min(255, Math.round(g + 6 * amount));
      pixels[i + 2] = Math.min(255, Math.round(b + amount));
    } else if (character === "meg" && r >= g && g >= b && r - g < 24) {
      const amount = clamp((Math.min(r, g, b) - 150) / 40) * clamp((g - b - 3) / 10);
      pixels[i] = Math.min(255, Math.round(r + 3 * amount));
      pixels[i + 1] = Math.round(g - 27 * amount);
      pixels[i + 2] = Math.round(b - 18 * amount);
    } else if (character === "ham") {
      const amount = clamp((b - Math.max(r, g) - 12) / 28) * clamp((b - 70) / 35);
      pixels[i] = Math.min(255, Math.round(r + 10 * amount));
      pixels[i + 1] = Math.min(255, Math.round(g + 70 * amount));
      pixels[i + 2] = Math.round(b - 90 * amount);
    } else if (character === "tapi") {
      const amount = clamp((g - 175) / 15) * clamp((r - g - 8) / 20);
      pixels[i] = Math.round(r - 50 * amount);
      pixels[i + 1] = Math.min(255, Math.round(g + 10 * amount));
      pixels[i + 2] = Math.min(255, Math.round(b + 25 * amount));
    }
  }
  return pixels;
}
