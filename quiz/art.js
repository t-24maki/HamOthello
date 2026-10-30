import { ART_SHAPES } from "../gyoza/shapes.js?v=20261027-gyoza3";
const cast = new URL("./art/show-cast-v1.png", import.meta.url).href;
const phone = new URL("./art/phone-megs-v1.png", import.meta.url).href;
// Native SVG windows display the original transparent atlases without editing pixels.
export function performer(character, pose = 0, instance = "stage") {
  if (character === "tak" && pose === "deadpan") return `<img class="cast-art deadpan-art" src="${new URL("./art/tak-deadpan-v1.png", import.meta.url).href}" alt="" />`;
  const x = character === "tak" ? 122 : 520;
  const rows = [32, 386, 754, 1110];
  return `<svg class="cast-art" preserveAspectRatio="xMidYMax meet" viewBox="${x} ${rows[pose]} 410 360" aria-hidden="true"><defs><clipPath id="quiz-${instance}-${character}-${pose}"><rect x="${x}" y="${rows[pose]}" width="410" height="360"/></clipPath></defs><image clip-path="url(#quiz-${instance}-${character}-${pose})" href="${cast}" width="1024" height="1536"/></svg>`;
}
export function phoneMeg(index) {
  return `<svg class="phone-art" viewBox="${(index % 2) * 512} ${Math.floor(index / 2) * 512} 512 512" aria-hidden="true"><defs><clipPath id="quiz-phone-${index}"><rect x="${(index % 2) * 512}" y="${Math.floor(index / 2) * 512}" width="512" height="512"/></clipPath></defs><image clip-path="url(#quiz-phone-${index})" href="${phone}" width="1024" height="1024"/></svg>`;
}
export function seedIcon() {
  return '<svg viewBox="0 0 24 32" aria-hidden="true"><path d="M12 2C6 9 2 16 5 23c2 5 5 7 7 7s5-2 7-7c3-7-1-14-7-21Z" fill="#8b6951" stroke="#5f4639" stroke-width="1.5"/><path d="M12 5c-3 8-4 16 0 23M13 5c3 9 3 17 0 23" fill="none" stroke="#f5e7bd" stroke-width="2"/></svg>';
}

// Reuse the dumpling game's outlines without importing its physics or game loop.
export function dumpling(index, instance) {
  const s = ART_SHAPES[index % ART_SHAPES.length], id = `quiz-dumpling-${instance}`;
  const path = `M${s.points.map(p => `${p.x},${p.y}`).join("L")}Z`;
  return `<svg class="count-art" viewBox="-70 -65 140 105" aria-hidden="true"><defs><clipPath id="${id}"><path d="${path}"/></clipPath></defs><path d="${path}" fill="#faecd2"/><ellipse cx="${s.centerX}" cy="${s.bottom}" rx="${s.width * .45}" ry="${s.height * .2}" fill="#e4a449" clip-path="url(#${id})"/><g fill="none" stroke="#574639" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/>${s.folds.map(([a,b,c]) => `<path d="M${a.x},${a.y}Q${b.x},${b.y} ${c.x},${c.y}"/>`).join("")}</g></svg>`;
}
