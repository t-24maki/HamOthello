import { CHARACTERS } from "./engine.js?v=20261021-battle21";
const PALETTES = {
  tak: { color: "#a98ac5", fill: "#dfd2eb", ink: "#795791", label: "むらさき" },
  meg: { color: "#e2b967", fill: "#f6e3bd", ink: "#8b6634", label: "クリーム色" },
  takAlt: { color: "#85a9d3", fill: "#dae9fa", ink: "#567ba5", label: "そら色" },
  megAlt: { color: "#d49c8d", fill: "#f8ded5", ink: "#9a695c", label: "もも色" },
  ham: { color: "#e8ad59", fill: "#fae7bf", ink: "#99632c", label: "青まわし" },
  hamAlt: { color: "#7eaf94", fill: "#deeee3", ink: "#477d60", label: "緑まわし" },
  tapi: { color: "#df9eaa", fill: "#f9e0e5", ink: "#a05d70", label: "もも色" },
  tapiAlt: { color: "#a1cfe6", fill: "#e1f1fa", ink: "#4f829f", label: "水色" },
  takAlt2: { color: "#d99ba8", fill: "#f7dde4", ink: "#9d536b", label: "もも色" },
  takAlt3: { color: "#8ebfad", fill: "#ddf1e7", ink: "#467f70", label: "ミント色" },
  megAlt2: { color: "#8ebfad", fill: "#ddf1e7", ink: "#467f70", label: "ミント色" },
  megAlt3: { color: "#b19bce", fill: "#e9def5", ink: "#795791", label: "すみれ色" },
  hamAlt2: { color: "#d58094", fill: "#f5dce3", ink: "#9d4660", label: "赤まわし" },
  hamAlt3: { color: "#ac92d3", fill: "#e7ddf4", ink: "#795791", label: "紫まわし" },
  tapiAlt2: { color: "#9ebf93", fill: "#e4f0df", ink: "#557e4a", label: "ミント色" },
  tapiAlt3: { color: "#bd9bcf", fill: "#f0e1f6", ink: "#835495", label: "すみれ色" },
};
export const PALETTE_SUFFIXES = ["", "Alt", "Alt2", "Alt3"];
export function fighterLabel(
  game,
  index,
  localPlayer = game.localPlayer ?? 0,
  online = !!game.online,
) {
  if (index === localPlayer) return "YOU";
  if (online && index < 2) return "相手";
  return game.fighters.length === 4 ? `CPU ${online ? index - 1 : index}` : "CPU";
}
// Derive the palette from seats, not the viewing player: both screens see the same colors.
export function fighterAppearance(game, index) {
  const character = game.fighters[index].character;
  const same = game.fighters.filter((f) => f.character === character).length > 1;
  const variant = game.fighters.slice(0, index).filter((f) => f.character === character).length;
  const alternate = variant > 0;
  const suffix = PALETTE_SUFFIXES[variant];
  const key = character + suffix;
  return {
    ...PALETTES[key],
    key,
    alternate,
    variant,
    suffix,
    character,
    name: same
      ? `${PALETTES[key].label}の${CHARACTERS[character].name}`
      : CHARACTERS[character].name,
  };
}
// Cached runtime palette swap: Ham changes only his blue belt; the other
// characters change body color. Outlines, faces and alpha remain intact.
export function tintFur(pixels, character, variant = 1) {
  if (!variant) return pixels;
  const shifts = {
    tak: [
      [-42, 6, 1],
      [15, -12, -45],
      [-35, 18, -25],
    ],
    meg: [
      [3, -27, -18],
      [-45, -5, 5],
      [-20, -35, 15],
    ],
    ham: [
      [10, 70, -90],
      [140, -35, -95],
      [55, -20, 25],
    ],
    tapi: [
      [-50, 10, 25],
      [-35, 15, -5],
      [-18, -15, 25],
    ],
  };
  const delta = shifts[character][variant - 1];
  const clamp = (v) => Math.max(0, Math.min(1, v));
  for (let i = 0; i < pixels.length; i += 4) {
    if (!pixels[i + 3]) continue;
    const r = pixels[i],
      g = pixels[i + 1],
      b = pixels[i + 2];
    let amount = 0;
    if (character === "tak") {
      amount =
        clamp((Math.min(r, g, b) - 140) / 40) * clamp((b - g - 6) / 16) * clamp((b - r + 22) / 16);
    } else if (character === "meg" && r >= g && g >= b && r - g < 24) {
      amount = clamp((Math.min(r, g, b) - 150) / 40) * clamp((g - b - 3) / 10);
    } else if (character === "ham") {
      amount = clamp((b - Math.max(r, g) - 12) / 28) * clamp((b - 70) / 35);
    } else if (character === "tapi") {
      amount = clamp((g - 175) / 15) * clamp((r - g - 8) / 20);
    }
    for (let channel = 0; channel < 3; channel++)
      pixels[i + channel] = Math.max(
        0,
        Math.min(255, Math.round(pixels[i + channel] + delta[channel] * amount)),
      );
  }
  return pixels;
}
