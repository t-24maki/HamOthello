import { SPOTS, WHEEL, OUTER_COUNT, color } from "./rules.js?v=20261030-roulette7";
const polar = (radius, degrees) => {
  const a = (degrees * Math.PI) / 180;
  return [160 + radius * Math.cos(a), 160 + radius * Math.sin(a)];
};
const point = (r, a) => polar(r, a).join(" ");
function wedge(inner, outer, a, b) {
  return `M ${point(outer, a)} A ${outer} ${outer} 0 0 1 ${point(outer, b)} L ${point(inner, b)} A ${inner} ${inner} 0 0 0 ${point(inner, a)} Z`;
}
const sector = 360 / OUTER_COUNT;
const wheelSector = 360 / WHEEL.length;
const angle = (n) => -90 + (n - 1) * sector;
export function boardMarkup() {
  let body = `<circle class="rim" cx="160" cy="160" r="146"/>`;
  for (let n = 1; n <= OUTER_COUNT; n++) {
    const a = angle(n),
      [x, y] = polar(113, a);
    body += `<g class="number ${color(n)}" data-spot="n${n}" role="button" tabindex="0" aria-label="${n}に1枚"><path d="${wedge(76, 138, a - sector / 2, a + sector / 2)}"/><text x="${x}" y="${y + 8}">${n}</text></g>`;
  }
  body += `<g class="number green" data-spot="n0" role="button" tabindex="0" aria-label="0に1枚"><circle cx="160" cy="160" r="76"/><text x="160" y="169">0</text></g>`;
  for (const s of SPOTS.filter((s) => s.kind === 2 || s.kind === 3)) {
    const n = Number(s.id.replace(/\D/g, ""));
    const [x, y] = polar(
      s.id.startsWith("edge") ? 113 : 76,
      angle(n) + (s.id.startsWith("zero") ? 0 : sector / 2),
    );
    const mark =
      s.kind === 3
        ? `<path class="dot" d="M ${x} ${y - 9} l9 9 -9 9 -9 -9 Z"/>`
        : `<circle class="dot" cx="${x}" cy="${y}" r="7"/>`;
    const line = s.id.startsWith("edge")
      ? `<path class="hit-line" d="M ${point(91, angle(n) + sector / 2)} L ${point(138, angle(n) + sector / 2)}"/>`
      : "";
    body += `<g class="boundary" data-kind="${s.kind}" data-spot="${s.id}" role="button" tabindex="0" aria-label="${s.label}に1枚"><title>${s.label}に1枚</title>${line}<circle class="hit" cx="${x}" cy="${y}" r="14"/>${mark}</g>`;
  }
  for (const [id, y, label] of [
    ["red", 110, "赤"],
    ["black", 252, "黒"],
  ]) {
    body += `<g class="color-bet ${id}" data-spot="${id}" role="button" tabindex="0" aria-label="${label}に1枚"><path d="M 343 ${y - 32} L 376 ${y} L 343 ${y + 32} L 310 ${y} Z"/><text x="343" y="${y + 7}">${label}</text></g>`;
  }
  return `<svg viewBox="0 -80 390 400" role="group" aria-label="賭ける場所。数字・境界・交点に1枚置きます">${body}<g id="chip-layer" aria-hidden="true"></g></svg>`;
}
export function chipPoint(id) {
  if (id === "red") return [343, 130];
  if (id === "black") return [343, 272];
  if (id === "n0") return [160, 193];
  const n = Number(id.replace(/\D/g, ""));
  if (id.startsWith("n")) return polar(94, angle(n));
  return polar(
    id.startsWith("edge") ? 113 : 76,
    angle(n) + (id.startsWith("zero") ? 0 : sector / 2),
  );
}
export function chipsMarkup(players, ownSeat = 0, outcome = null) {
  return SPOTS.map((s) => {
    const entries = players.flatMap((bets, p) => {
      const bet = bets?.find((b) => b.id === s.id);
      return bet ? [{ player: p, amount: bet.amount }] : [];
    });
    return entries
      .map((b) => {
        const [x, y] = placedChipPoint(players, b.player, s.id);
        const won = outcome !== null && s.numbers.includes(outcome);
        return `<g class="chip ${b.player === ownSeat ? "own-chip" : ""} ${won ? "winning-chip" : ""}" data-player="${b.player}" data-bet="${s.id}" transform="translate(${x} ${y})">${chipFace(b.amount)}</g>`;
      })
      .join("");
  }).join("");
}
export function chipFace(amount) {
  return `<circle cy="2" r="9" class="chip-shadow"/><circle r="9"/><circle class="chip-inner" r="6.7"/><text y="3.5">${amount}</text>`;
}
export function placedChipPoint(players, player, id) {
  const entries = players.flatMap((bets, p) => (bets?.some((b) => b.id === id) ? [p] : []));
  const index = entries.indexOf(player),
    [x, y] = chipPoint(id);
  // Shared by the resting chips and the flight destination, including overlaps.
  return [
    x + (entries.length > 1 ? (index % 2 ? 8 : -8) : 0),
    y + (entries.length > 2 ? (index < 2 ? -8 : 8) : 0),
  ];
}
export function wheelMarkup() {
  return `<svg viewBox="0 0 320 320" aria-hidden="true">
  <defs>
    <radialGradient id="wheel-wood"><stop stop-color="#cfa36b"/><stop offset=".65" stop-color="#a87546"/><stop offset="1" stop-color="#65442d"/></radialGradient>
    <radialGradient id="wheel-brass" cx="35%" cy="25%"><stop stop-color="#fff6cc"/><stop offset=".55" stop-color="#d9b263"/><stop offset="1" stop-color="#88602d"/></radialGradient>
  </defs>
  <circle class="wheel-rim" cx="160" cy="160" r="151"/>
  <circle class="wheel-track" cx="160" cy="160" r="143"/>
  <circle cx="160" cy="160" r="136" fill="url(#wheel-wood)"/>
  ${WHEEL.map((n, i) => {
    const a = -90 + i * wheelSector,
      [x, y] = polar(122, a);
    return `<g class="${color(n)}"><path d="${wedge(109, 136, a - wheelSector / 2, a + wheelSector / 2)}"/><text class="wheel-number" x="${x}" y="${y + 6}" transform="rotate(${i * wheelSector} ${x} ${y})">${n}</text><path class="wheel-pocket" d="${wedge(92, 109, a - wheelSector / 2, a + wheelSector / 2)}"/></g>`;
  }).join("")}
  <circle class="wheel-bowl-edge" cx="160" cy="160" r="91"/>
  <path class="wheel-grain" d="M 88 145 Q 160 110 234 148 M 89 174 Q 160 136 233 177 M 105 200 Q 160 174 215 201"/>
  <g class="wheel-spindle"><path d="M 118 160 H202 M160 118 V202"/>${[
    [118, 160],
    [202, 160],
    [160, 118],
    [160, 202],
  ]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8"/>`)
    .join("")}<circle cx="160" cy="160" r="21" fill="url(#wheel-brass)"/></g>
  </svg>`;
}
export const landingRotation = (pocket) => 360 * 6 + ((360 - pocket * wheelSector) % 360);
