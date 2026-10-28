import { ART_SHAPES, GYOZA_SCALE } from "./shapes.js?v=20261027-gyoza3";
import { WIDTH, PLATE_Y, PLATE_WIDTH } from "./engine.js?v=20261027-gyoza3";
import { drawFriends } from "./friends.js?v=20261027-gyoza5";
function ellipse(ctx, x, y, rx, ry, color, angle = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}
export function drawGyoza(ctx, type, x, y, angle = 0, scale = 1, alpha = 1) {
  const s = ART_SHAPES[type],
    p = s.points;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale * GYOZA_SCALE, scale * GYOZA_SCALE);
  ctx.globalAlpha *= alpha;
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    for (const v of p.slice(1)) ctx.lineTo(v.x, v.y);
    ctx.closePath();
  };
  outline();
  ctx.fillStyle = "#faecd2";
  ctx.fill();
  ctx.save();
  ctx.clip();
  // One broad golden patch and a few clear folds stay readable at phone size.
  ellipse(
    ctx,
    s.centerX + s.width * 0.08,
    s.bottom + s.height * 0.015,
    s.width * 0.47,
    s.height * 0.2,
    "#e4a449",
    -0.1,
  );
  ctx.strokeStyle = "#393b32";
  ctx.lineWidth = 3.7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [a, b, c] of s.folds) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(b.x, b.y, c.x, c.y);
    ctx.stroke();
  }
  ctx.restore();
  outline();
  ctx.lineJoin = "round";
  ctx.lineWidth = 4.3;
  ctx.strokeStyle = "#393b32";
  ctx.stroke();
  ctx.restore();
}
// Only the viewport size affects this transform, never the falling body or stack.
export function boardTransform(width, height) {
  const scale = Math.min(width / WIDTH, height / (PLATE_Y + 65));
  return { scale, ox: (width - WIDTH * scale) / 2, oy: height - (PLATE_Y + 65) * scale };
}
export function previewY(v, map) {
  // Keep the piece handle reachable even when a very tall stack extends above view.
  return Math.max(v.spawnY, -map.oy / map.scale + 65);
}
export function drawPlate(ctx) {
  const y = PLATE_Y,
    w = PLATE_WIDTH;
  ellipse(ctx, 240, y + 35, w * 0.62, 13, "#5e5a4922");
  ctx.fillStyle = "#dee8dd";
  ctx.strokeStyle = "#728d86";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(240 - w / 2, y);
  ctx.bezierCurveTo(240 - w / 2 + 3, y + 28, 240 + w / 2 - 3, y + 28, 240 + w / 2, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ellipse(ctx, 240, y, w / 2, 9, "#fafbf0");
  ctx.stroke();
  ctx.strokeStyle = "#a4bdb0";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(240, y + 1, w / 2 - 13, 4, 0, 0, Math.PI);
  ctx.stroke();
  for (const dx of [-82, 82]) {
    ctx.save();
    ctx.translate(240 + dx, y + 12);
    ctx.strokeStyle = "#7c9d91";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.quadraticCurveTo(0, -7, 6, 0);
    ctx.stroke();
    ctx.restore();
  }
}
export function render(
  canvas,
  v,
  { preview = null, active = false, friends = false, time = 0, reduced = false } = {},
) {
  const r = canvas.getBoundingClientRect(),
    dpr = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr)) {
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
  }
  const ctx = canvas.getContext("2d"),
    w = r.width,
    h = r.height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const background = ctx.createLinearGradient(0, 0, 0, h);
  background.addColorStop(0, "#f8f3e8");
  background.addColorStop(1, "#f1e8d7");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#a6b6a012";
  ctx.lineWidth = 1;
  for (let x = 18; x < w; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 16; y < h; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  const map = boardTransform(w, h),
    { scale, ox, oy } = map;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  if (friends) drawFriends(ctx, v, { time, reduced, baseline: PLATE_Y + 8 });
  ctx.fillStyle = "#d8c1a340";
  ctx.fillRect(-100, PLATE_Y + 44, 680, 40);
  ctx.strokeStyle = "#c4a98b50";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-100, PLATE_Y + 44);
  ctx.lineTo(580, PLATE_Y + 44);
  ctx.stroke();
  drawPlate(ctx);
  for (const b of v.bodies) drawGyoza(ctx, b.type, b.x, b.y, b.angle);
  if (v.phase === "aim") {
    const pos = preview || v.preview,
      py = previewY(v, map);
    ctx.strokeStyle = active ? "#9d7ca371" : "#8f938f40";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 7]);
    ctx.beginPath();
    ctx.moveTo(pos.x, py + 34);
    ctx.lineTo(pos.x, PLATE_Y - 5);
    ctx.stroke();
    ctx.setLineDash([]);
    drawGyoza(ctx, v.current, pos.x, py, pos.angle);
    if (active) {
      ctx.strokeStyle = "#9b7ca6";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      for (const direction of [-1, 1]) {
        const x = pos.x + direction * 67;
        ctx.beginPath();
        ctx.moveTo(x - direction * 10, py);
        ctx.lineTo(x, py);
        ctx.moveTo(x - direction * 4, py - 4);
        ctx.lineTo(x, py);
        ctx.lineTo(x - direction * 4, py + 4);
        ctx.stroke();
      }
    }
    ctx.fillStyle = active ? "#856889" : "#8c918a";
    ctx.beginPath();
    ctx.moveTo(pos.x - 5, py - 45);
    ctx.lineTo(pos.x + 5, py - 45);
    ctx.lineTo(pos.x, py - 39);
    ctx.closePath();
    ctx.fill();
  }
  if (v.phase === "finished") {
    const b = v.bodies.find((b) => b.id === v.fallen);
    if (b) {
      ctx.strokeStyle = "#c57862";
      ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(b.x + Math.cos(a) * 48, b.y + Math.sin(a) * 43);
        ctx.lineTo(b.x + Math.cos(a) * 57, b.y + Math.sin(a) * 51);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
  return { scale, ox, oy };
}
