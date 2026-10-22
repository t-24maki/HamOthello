import { transparentPaper } from "./battle/renderer.js?v=20261022-site1";

// Reuse the game's edge-connected paper removal; pale fur stays opaque.
// The SVG layout remains visible while these shared sheets are prepared.
const sheets = new Map();
for (const frame of document.querySelectorAll(".art svg svg")) {
  const image = frame.querySelector("image");
  const source = image.getAttribute("href");
  if (!/sanpo\/art\/(cream|lavender)\.png$/.test(source)) {
    frame.style.removeProperty("mix-blend-mode");
    continue;
  }
  if (!sheets.has(source)) {
    const sheet = new Image();
    sheet.src = source;
    sheets.set(
      source,
      sheet.decode().then(() => transparentPaper(sheet).toDataURL()),
    );
  }
  sheets
    .get(source)
    .then((data) => {
      image.setAttribute("href", data);
      frame.style.removeProperty("mix-blend-mode");
    })
    .catch(() => {
      // Retain the original artwork if canvas preparation is unavailable.
    });
}
