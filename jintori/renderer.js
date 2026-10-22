import {
  SIZE,
  PAINT_SIZE,
  PLAYERS,
  bodyScale,
  GIANT_FRAMES,
} from "./engine.js?v=20261022-jintori4";
const wallColor = (game) => (game.fieldId === "garden" ? "#bed3a8" : "#bedbe0");

// Show the final ownership of every small cell without characters covering it.
export function renderPaintMap(canvas, game) {
  const ctx = canvas.getContext("2d"),
    tile = canvas.width / PAINT_SIZE;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < game.paint.length; i++) {
    ctx.fillStyle = !game.paintFloor[i]
      ? wallColor(game)
      : game.paint[i] > 0
        ? PLAYERS[game.paint[i] - 1].color
        : "#faf3e4";
    ctx.fillRect((i % PAINT_SIZE) * tile, Math.floor(i / PAINT_SIZE) * tile, tile, tile);
  }
}
export async function loadArt() {
  const sources = [
    PLAYERS[0].asset,
    PLAYERS[1].asset,
    "../battle/art/normal-ham.png",
    "../battle/art/tapi.png",
  ];
  return Promise.all(
    sources.map(
      (src) =>
        new Promise((resolve) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => resolve(null);
          image.src = src;
        }),
    ),
  );
}
export function portrait(ctx, image, index, x, y, size) {
  if (!image) {
    ctx.fillStyle = PLAYERS[index].color;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (index === 2) ctx.drawImage(image, 82, 58, 389, 439, x + size * 0.06, y, size * 0.88, size);
  else if (index === 3) ctx.drawImage(image, 76, 83, 380, 359, x, y, size, size);
  else ctx.drawImage(image, x, y, size, size);
}
export function render(canvas, game, art = [], seat = 0, time = 0, preview = false) {
  const ctx = canvas.getContext("2d"),
    unit = canvas.width / SIZE,
    tile = canvas.width / PAINT_SIZE;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#dce9df";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < PAINT_SIZE * PAINT_SIZE; i++) {
    const x = (i % PAINT_SIZE) * tile,
      y = Math.floor(i / PAINT_SIZE) * tile;
    if (!game.paintFloor[i]) {
      ctx.fillStyle = wallColor(game);
      ctx.fillRect(x, y, tile + 0.5, tile + 0.5);
      if (i % 14 === 0) {
        ctx.fillStyle = game.fieldId === "garden" ? "#f1ddaa" : "#dceef0";
        ctx.beginPath();
        ctx.ellipse(x + tile * 0.5, y + tile * 0.6, tile * 0.2, tile * 0.07, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      continue;
    }
    const color = game.paint[i];
    ctx.fillStyle =
      color > 0
        ? PLAYERS[color - 1].color
        : ((i % PAINT_SIZE) + Math.floor(i / PAINT_SIZE)) % 2
          ? "#fff8e9"
          : "#f7efdf";
    ctx.fillRect(x, y, tile + 0.5, tile + 0.5);
    ctx.strokeStyle = color > 0 ? "#ffffff18" : "#c6b89b25";
    ctx.lineWidth = 0.7;
    ctx.strokeRect(x + 0.5, y + 0.5, tile - 1, tile - 1);
    // A short outline on the edge of the floor makes water boundaries readable.
    ctx.strokeStyle = "#8b927d60";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (!game.paintFloor[i - PAINT_SIZE]) {
      ctx.moveTo(x, y + 1);
      ctx.lineTo(x + tile, y + 1);
    }
    if (!game.paintFloor[i + PAINT_SIZE]) {
      ctx.moveTo(x, y + tile - 1);
      ctx.lineTo(x + tile, y + tile - 1);
    }
    if (!game.paintFloor[i - 1]) {
      ctx.moveTo(x + 1, y);
      ctx.lineTo(x + 1, y + tile);
    }
    if (!game.paintFloor[i + 1]) {
      ctx.moveTo(x + tile - 1, y);
      ctx.lineTo(x + tile - 1, y + tile);
    }
    ctx.stroke();
  }
  for (const item of game.items.potions) {
    const x = item.x * unit,
      y = item.y * unit;
    const bob = game.phase === "playing" ? Math.sin(time * 4 + item.id) * unit * 0.07 : 0;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.fillStyle = "#fff0bb99";
    ctx.beginPath();
    ctx.arc(0, 0, unit * 0.82, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c49ce6";
    ctx.strokeStyle = "#735784";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-unit * 0.23, -unit * 0.53);
    ctx.lineTo(unit * 0.23, -unit * 0.53);
    ctx.lineTo(unit * 0.23, -unit * 0.25);
    ctx.quadraticCurveTo(unit * 0.65, -unit * 0.1, unit * 0.56, unit * 0.48);
    ctx.quadraticCurveTo(0, unit * 0.7, -unit * 0.56, unit * 0.48);
    ctx.quadraticCurveTo(-unit * 0.65, -unit * 0.1, -unit * 0.23, -unit * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#eac173";
    ctx.fillRect(-unit * 0.29, -unit * 0.68, unit * 0.58, unit * 0.22);
    ctx.fillStyle = "#fffaf3";
    ctx.beginPath();
    ctx.arc(0, unit * 0.18, unit * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6e4688";
    ctx.font = `bold ${unit * 0.44}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("×2", 0, unit * 0.2);
    ctx.restore();
  }
  // Depth order only affects art; all four brushes and collisions are identical.
  const order = game.players.map((p, i) => ({ ...p, i })).sort((a, b) => a.y - b.y);
  for (const p of order) {
    const x = p.x * unit,
      y = p.y * unit;
    const body = unit * bodyScale(p);
    const bounce =
      Math.hypot(p.dx, p.dy) > 0.1 && game.phase === "playing"
        ? Math.sin(time * 18) * body * 0.05
        : 0;
    ctx.fillStyle = "#414b4230";
    ctx.beginPath();
    ctx.ellipse(x, y + body * 0.25, body * 0.58, body * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.i === seat && !preview ? "#ffffff" : PLAYERS[p.i].ink;
    ctx.lineWidth = p.i === seat && !preview ? 4 : 2;
    ctx.fillStyle = PLAYERS[p.i].color;
    ctx.beginPath();
    ctx.arc(x, y, body * 0.64, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (p.giantFrames > 0) {
      ctx.strokeStyle = "#fff2b8";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        x,
        y,
        body * 0.72,
        -Math.PI / 2,
        -Math.PI / 2 + (Math.PI * 2 * p.giantFrames) / GIANT_FRAMES,
      );
      ctx.stroke();
    }
    portrait(ctx, art[p.i], p.i, x - body * 0.62, y - body * 0.79 + bounce, body * 1.24);
    ctx.fillStyle = PLAYERS[p.i].ink;
    ctx.beginPath();
    ctx.arc(x + body * 0.54, y + body * 0.4, body * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `bold ${body * 0.33}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(String(p.i + 1), x + body * 0.54, y + body * 0.41);
    if (p.i === seat && !preview) {
      ctx.fillStyle = "#554638";
      ctx.beginPath();
      ctx.moveTo(x - body * 0.17, y - body * 1.15);
      ctx.lineTo(x + body * 0.17, y - body * 1.15);
      ctx.lineTo(x, y - body * 0.94);
      ctx.closePath();
      ctx.fill();
    }
    if (p.stunFrames > 0) {
      ctx.fillStyle = "#fff2a5";
      ctx.strokeStyle = "#a87d3e";
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) {
        const angle = (game.phase === "playing" ? time * 4 : 0) + (k * Math.PI * 2) / 3;
        const sx = x + Math.cos(angle) * body * 0.48,
          sy = y - body * 0.94 + Math.sin(angle) * body * 0.12;
        ctx.beginPath();
        for (let j = 0; j < 10; j++) {
          const a = -Math.PI / 2 + (j * Math.PI) / 5,
            radius = unit * (j % 2 ? 0.09 : 0.2);
          const px = sx + Math.cos(a) * radius,
            py = sy + Math.sin(a) * radius;
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  if (!preview && game.phase === "countdown") {
    ctx.fillStyle = "#fffaf0d9";
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, unit * 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6c584b";
    ctx.font = `bold ${unit * 2.6}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(Math.ceil(game.countdown / 60)), canvas.width / 2, canvas.height / 2);
  }
}
