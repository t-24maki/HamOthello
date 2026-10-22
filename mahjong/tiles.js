export const TILE_TYPES = Object.freeze([
  ...["tak", "meg"].flatMap((suit) =>
    Array.from({ length: 5 }, (_, i) => ({
      suit,
      number: i + 1,
      name: `${suit === "tak" ? "たくハム" : "めぐハム"}の${i + 1}`,
    })),
  ),
  ...["pink", "blue", "yellow"].map((color, i) => ({
    suit: "tapi",
    color,
    number: null,
    name: ["ぴんたぴ", "あおたぴ", "きたぴ"][i],
  })),
]);
export const TILE_COUNT = 39;
export const validTile = (id) => Number.isInteger(id) && id >= 0 && id < TILE_COUNT;
export const tileType = (id) => Math.floor(id / 3);
export const tileInfo = (id) => TILE_TYPES[tileType(id)];
export const freshTiles = () => Array.from({ length: TILE_COUNT }, (_, id) => id);
export const sortTiles = (tiles) => [...tiles].sort((a, b) => a - b);
export function tileMarkup(id, { button = false, selected = false, winning = false } = {}) {
  if (!validTile(id))
    return '<span class="tile tile-back" aria-label="裏向きの牌"><span>✿</span></span>';
  const info = tileInfo(id),
    type = info.suit === "tapi" ? `tapi-${info.color}` : info.suit;
  const face =
    info.suit === "tapi"
      ? `<span class="tile-tapi" data-tapi="${info.color}" aria-hidden="true"></span>`
      : `<img src="../assets/${info.suit === "tak" ? "pink" : "cream"}-piece.png" alt="" draggable="false" />`;
  const content = `${info.number === null ? "" : `<span class="tile-number">${info.number}</span>`}${face}`;
  return button
    ? `<button type="button" class="tile ${type}${selected ? " selected" : ""}" data-tile="${id}" aria-label="${info.name}" aria-pressed="${selected}">${content}</button>`
    : `<span class="tile ${type}${winning ? " winning-tile" : ""}" role="img" aria-label="${info.name}${winning ? "・上がり牌" : ""}">${content}</span>`;
}
// Draw the existing expressionless Tapi pose into small, cached CSS portraits.
// Only the pink body changes; dark outlines, eyes, and transparency are preserved.
export async function prepareTileArt(root = document.documentElement) {
  const image = new Image();
  image.src = "../battle/art/tapi.png?v=20261022-mahjong7";
  await image.decode();
  for (const [color, delta] of [
    ["pink", [0, 0, 0]],
    ["blue", [-50, 10, 25]],
    ["yellow", [0, 18, -40]],
  ]) {
    const canvas = document.createElement("canvas");
    canvas.width = 112;
    canvas.height = 106;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 76, 83, 380, 359, 0, 0, 112, 106);
    const data = context.getImageData(0, 0, 112, 106),
      pixels = data.data;
    for (let i = 0; i < pixels.length; i += 4) {
      if (!pixels[i + 3]) continue;
      const amount =
        Math.max(0, Math.min(1, (pixels[i + 1] - 175) / 15)) *
        Math.max(0, Math.min(1, (pixels[i] - pixels[i + 1] - 8) / 20));
      for (let c = 0; c < 3; c++) pixels[i + c] += delta[c] * amount;
    }
    context.putImageData(data, 0, 0);
    root.style.setProperty(`--tapi-${color}`, `url("${canvas.toDataURL()}")`);
  }
}
