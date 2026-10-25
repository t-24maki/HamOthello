// Dedicated generated atlas. Crops preserve the original transparent artwork.
const original = new URL("./art/table-friends.png", import.meta.url).href;
const revised = new URL("./art/table-friends-v2.png", import.meta.url).href;
const poses = new URL("./art/table-friends-v3.png", import.meta.url).href;
const takWin = new URL("./art/tak-win-no-brows.png", import.meta.url).href;
const columns = [
  [16, 350],
  [383, 339],
  [749, 326],
  [1107, 319],
];
const originalRows = [
  [85, 309],
  [403, 310],
  [727, 307],
];
const revisedRows = [
  [64, 320],
  [383, 321],
  [704, 304],
];
const poseColumns = [
  [8, 320],
  [328, 304],
  [632, 306],
  [934, 320],
];
const poseRows = [
  [40, 285],
  [334, 270],
  [616, 287],
  [920, 285],
];
let portraitId = 0;
export function portrait(character, pose = "neutral") {
  if (character === "tak" && pose === "win") {
    return `<svg class="character-art character-art-tak" viewBox="38 155 1176 1008" aria-hidden="true" focusable="false"><image href="${takWin}" width="1254" height="1254" /></svg>`;
  }
  const column = ["tak", "meg", "ham", "tapi"].indexOf(character);
  const row = pose === "back" ? 2 : pose === "tell" && character !== "tapi" ? 1 : 0;
  const newPose =
    pose === "win" ||
    pose === "lose" ||
    character === "tapi" ||
    (character === "tak" && pose === "back");
  const poseRow = pose === "win" ? 2 : pose === "lose" ? 3 : pose === "back" ? 1 : 0;
  const [x, width] = newPose ? poseColumns[column] : columns[column];
  const [y, height] = newPose
    ? poseRows[poseRow]
    : (character === "ham" ? originalRows : revisedRows)[row];
  const image = newPose ? poses : character === "ham" ? original : revised;
  const imageWidth = newPose ? 1254 : 1448;
  const imageHeight = newPose ? 1254 : 1086;
  const clip = `baccarat-portrait-${++portraitId}`;
  return `<svg class="character-art character-art-${character}" viewBox="${x} ${y} ${width} ${height}" aria-hidden="true" focusable="false"><defs><clipPath id="${clip}"><rect x="${x}" y="${y}" width="${width}" height="${height}" /></clipPath></defs><image href="${image}" width="${imageWidth}" height="${imageHeight}" clip-path="url(#${clip})" /></svg>`;
}
