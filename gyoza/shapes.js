// A soft half-moon outline, sampled once for both drawing and collision geometry.
export const GYOZA_SCALE = 0.85;
function shape(id, name, width, height, lean = 0) {
  const rx = width / 2,
    upper = height * 0.84,
    lower = height * 0.16;
  const point = (x, y) => [x + lean * y, y];
  const raw = [];
  for (let i = 0; i <= 16; i++) {
    const t = (i * Math.PI) / 16;
    raw.push(point(-rx * Math.cos(t), -upper * Math.sin(t)));
  }
  for (let i = 1; i < 12; i++) {
    const t = (i * Math.PI) / 12;
    raw.push(point(rx * Math.cos(t), lower * Math.min(1, Math.sin(t) / 0.6)));
  }
  let area = 0,
    cx = 0,
    cy = 0;
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i],
      b = raw[(i + 1) % raw.length];
    const cross = a[0] * b[1] - b[0] * a[1];
    area += cross;
    cx += (a[0] + b[0]) * cross;
    cy += (a[1] + b[1]) * cross;
  }
  cx /= 3 * area;
  cy /= 3 * area;
  const centered = ([x, y]) => ({ x: x - cx, y: y - cy });
  const folds = Array.from({ length: width > 100 ? 7 : 5 }, (_, i) => {
    const count = width > 100 ? 7 : 5,
      t = ((i + 1) * Math.PI) / (count + 1);
    const x = -rx * 0.87 * Math.cos(t),
      y = -upper * 0.86 * Math.sin(t);
    return [
      point(x, y),
      point(x * 0.93, y + height * 0.16),
      point(x * 0.78 + 2, y + height * 0.24),
    ].map(centered);
  });
  const points = raw.map(centered);
  return Object.freeze({
    id,
    name,
    points,
    folds,
    width: Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
    height,
    bottom: lower - cy,
    centerX: -cx,
  });
}
export const ART_SHAPES = Object.freeze([
  shape(0, "いつものぎょうざ", 88, 46),
  shape(1, "よこながぎょうざ", 116, 42, 0.12),
  shape(2, "まるっこいぎょうざ", 68, 60),
  shape(3, "ほそながぎょうざ", 108, 32, -0.12),
  shape(4, "ななめぎょうざ", 82, 58, 0.15),
  shape(5, "ぷっくりぎょうざ", 76, 62, -0.18),
]);
export const SHAPES = Object.freeze(
  ART_SHAPES.map((s) =>
    Object.freeze({
      ...s,
      points: s.points.map(({ x, y }) => ({ x: x * GYOZA_SCALE, y: y * GYOZA_SCALE })),
      width: s.width * GYOZA_SCALE,
      height: s.height * GYOZA_SCALE,
    }),
  ),
);
export const TURN_ANGLE = Math.PI / 12;
export function normalizeAngle(angle) {
  return ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}
export function rotatedBounds(type, angle = 0) {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const points = SHAPES[type].points.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}
