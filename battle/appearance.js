import { CHARACTERS } from "./engine.js";
const PALETTES = {
  tak: { color: "#a98ac5", fill: "#dfd2eb", ink: "#795791", label: "むらさき" },
  meg: { color: "#e2b967", fill: "#f6e3bd", ink: "#8b6634", label: "クリーム色" },
  takAlt: { color: "#85a9d3", fill: "#dae9fa", ink: "#567ba5", label: "そら色" },
  megAlt: { color: "#d49c8d", fill: "#f8ded5", ink: "#9a695c", label: "もも色" },
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
// A cached runtime sprite palette swap. Only pale fur changes; outlines, glasses,
// eyes, pink cheeks and transparent pixels retain their original colors and alpha.
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
    }
  }
  return pixels;
}
