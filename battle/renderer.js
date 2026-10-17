import {
  CHARACTERS,
  WIDTH,
  HEIGHT,
  fighterSize,
  attackScale,
} from "./engine.js?v=20261017-battle19";
import { fighterAppearance, tintFur } from "./appearance.js?v=20261017-battle19";
import { getStage, platformsAt, surfaceAt } from "./stages.js?v=20261017-battle19";
import { GIANT_WARNING } from "./items.js?v=20261017-battle19";
const FRAMES = {
  ham: [
    [82, 58, 389, 439],
    [587, 52, 401, 444],
    [1105, 40, 374, 439],
    [61, 539, 484, 438],
    [591, 521, 426, 445],
    [1067, 526, 442, 449],
  ],
  tapi: [
    [76, 83, 380, 359],
    [587, 86, 381, 359],
    [1083, 57, 374, 369],
    [60, 573, 430, 338],
    [583, 560, 392, 356],
    [1077, 558, 378, 358],
  ],
  cream: [
    [92, 62, 378, 408],
    [580, 62, 384, 414],
    [1075, 62, 373, 413],
    [93, 544, 414, 386],
    [573, 547, 366, 411],
    [1074, 559, 400, 395],
  ],
  lavender: [
    [82, 55, 392, 424],
    [579, 57, 392, 423],
    [1074, 55, 384, 426],
    [69, 520, 429, 416],
    [575, 525, 386, 447],
    [1064, 529, 422, 441],
  ],
};
// Same edge-connected paper removal as the walk game's sprite-background.ts.
// The pale character interiors enclosed by their outlines remain opaque.
function transparentPaper(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height),
    pixels = data.data;
  const w = canvas.width,
    h = canvas.height,
    seen = new Uint8Array(w * h),
    queue = new Uint32Array(w * h);
  let head = 0,
    tail = 0;
  const visit = (p) => {
    if (seen[p]) return;
    seen[p] = 1;
    const i = p * 4,
      min = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]),
      max = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (pixels[i + 3] && (min < 225 || max - min > 18)) return;
    pixels[i + 3] = 0;
    queue[tail++] = p;
  };
  for (let x = 0; x < w; x++) {
    visit(x);
    visit((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    visit(y * w);
    visit(y * w + w - 1);
  }
  while (head < tail) {
    const p = queue[head++],
      x = p % w;
    if (x) visit(p - 1);
    if (x < w - 1) visit(p + 1);
    if (p >= w) visit(p - w);
    if (p < w * (h - 1)) visit(p + w);
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}
function alternateArt(source, character) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  tintFur(data.data, character);
  ctx.putImageData(data, 0, 0);
  return canvas;
}
function spritePortrait(source, sheet, pose) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const [sx, sy, sw, sh] = FRAMES[sheet][pose];
  const ratio = 240 / Math.max(sw, sh);
  canvas
    .getContext("2d")
    .drawImage(
      source,
      sx,
      sy,
      sw,
      sh,
      (256 - sw * ratio) / 2,
      (256 - sh * ratio) / 2,
      sw * ratio,
      sh * ratio,
    );
  return canvas.toDataURL();
}
export async function loadArt() {
  const entries = await Promise.all(
    ["cream", "lavender", "meadow"].map(async (key) => {
      const image = new Image();
      image.src = `../sanpo/art/${key}.png`;
      await image.decode();
      return [key, key === "meadow" ? image : transparentPaper(image)];
    }),
  );
  const art = Object.fromEntries(entries);
  art.lavenderAlt = alternateArt(art.lavender, "tak");
  art.creamAlt = alternateArt(art.cream, "meg");
  art.portraits = {};
  await Promise.all(
    ["ham", "tapi"].map(async (character) => {
      const image = new Image();
      image.src = `./art/${character === "ham" ? "normal-ham" : "tapi"}.png?v=20261017-battle19`;
      await image.decode();
      art[character] = image;
      art[character + "Alt"] = alternateArt(image, character);
      for (const alternate of [false, true]) {
        const key = character + (alternate ? "Alt" : "");
        for (const [kind, pose] of [
          ["icon", 0],
          ["win", 5],
        ]) {
          art.portraits[`${key}-${kind}`] = spritePortrait(art[key], character, pose);
        }
      }
    }),
  );
  await Promise.all(
    ["tak", "meg"].map(async (character) => {
      for (const kind of ["icon", "win"]) {
        const src =
          kind === "icon"
            ? `../assets/${character === "tak" ? "pink" : "cream"}-piece.png`
            : `../assets/${character}-win.png`;
        const image = new Image();
        image.src = src;
        await image.decode();
        art.portraits[`${character}-${kind}`] = src;
        art.portraits[`${character}Alt-${kind}`] = alternateArt(image, character).toDataURL();
      }
    }),
  );
  // Full-body selection art is separate from the HUD icons and result portraits.
  art.selection = Object.fromEntries(
    Object.entries(CHARACTERS).map(([key, character]) => [
      key,
      spritePortrait(art[character.sheet], character.sheet, 5),
    ]),
  );
  return art;
}
function box(c, x, y, w, h, r, fill, stroke) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 2;
    c.stroke();
  }
}
function star(c, x, y, r, color, rotation = 0) {
  c.save();
  c.translate(x, y);
  c.rotate(rotation);
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2,
      d = i % 2 ? r * 0.45 : r;
    c.lineTo(Math.cos(a) * d, Math.sin(a) * d);
  }
  c.closePath();
  c.fillStyle = color;
  c.fill();
  c.restore();
}
export function giantWarningOpacity(f, reduced = false) {
  if (!f.giant || f.giantTime > GIANT_WARNING) return 1;
  // Two gentle fades per second; use simulation time so pause also freezes the cue.
  return reduced ? 0.72 : 0.72 + 0.28 * Math.cos((GIANT_WARNING - f.giantTime) * Math.PI * 4);
}
function sprite(c, art, f, pose, time, reduced, alternate) {
  const sheet = CHARACTERS[f.character].sheet,
    [sx, sy, sw, sh] = FRAMES[sheet][pose];
  const h = 84 * fighterSize(f),
    w = (h * sw) / sh;
  c.save();
  c.translate(f.x, f.y + 2);
  if (f.invincible > 0 && !reduced) c.globalAlpha = 0.65 + 0.35 * Math.cos(time * 22) ** 2;
  c.globalAlpha *= giantWarningOpacity(f, reduced);
  if (f.attack?.kind === "special") {
    c.translate(0, -h / 2);
    if (!reduced) c.rotate(f.facing * f.attack.age * 17);
    c.translate(0, h / 2);
  } else if (f.attack) {
    c.rotate(f.facing * 0.14);
    c.scale(1.1, 0.94);
  } else if (f.stun > 0 && !reduced) c.rotate(f.facing * -0.2);
  c.scale(f.facing, 1);
  c.drawImage(art[sheet + (alternate ? "Alt" : "")], sx, sy, sw, sh, -w / 2, -h, w, h);
  c.restore();
}
function drawPotion(c, p, time, reduced) {
  c.save();
  c.translate(p.x, p.y);
  const glow = c.createRadialGradient(0, 0, 5, 0, 0, 34);
  glow.addColorStop(0, "#fff8cce6");
  glow.addColorStop(1, "#fff8cc00");
  c.fillStyle = glow;
  c.beginPath();
  c.arc(0, 0, 34, 0, Math.PI * 2);
  c.fill();
  // A corked purple bottle with an up-arrow remains legible at phone size.
  box(c, -7, -22, 14, 11, 3, "#e8bd82", "#8c6c62");
  box(c, -6, -12, 12, 8, 2, "#fff9ef", "#9375a8");
  box(c, -15, -7, 30, 25, 10, "#b28bdb", "#775b96");
  c.strokeStyle = "#ffffff";
  c.lineWidth = 3;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.beginPath();
  c.moveTo(0, 12);
  c.lineTo(0, -1);
  c.moveTo(-5, 4);
  c.lineTo(0, -1);
  c.lineTo(5, 4);
  c.stroke();
  star(c, 23, -13, 5, "#f9d47b", reduced ? 0 : time * 1.5);
  c.restore();
}
export function render(c, art, g, time, reduced = false, preview = false) {
  const stage = getStage(g.stageId),
    theme = stage.theme;
  const { width, height } = c.canvas;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, width, height);
  const scale = Math.min(width / WIDTH, height / HEIGHT);
  c.fillStyle = theme.sky;
  c.fillRect(0, 0, width, height);
  c.translate((width - WIDTH * scale) / 2, (height - HEIGHT * scale) / 2);
  c.scale(scale, scale);
  c.save();
  c.beginPath();
  c.rect(0, 0, WIDTH, HEIGHT);
  c.clip();
  if (["cloud", "islands", "planet"].includes(stage.id)) {
    const sky = c.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(
      0,
      stage.id === "planet" ? "#c9c5e6" : stage.id === "cloud" ? "#dce5f8" : stage.theme.sky,
    );
    sky.addColorStop(1, stage.id === "islands" ? "#edf9ed" : "#f5ecf5");
    c.fillStyle = sky;
    c.fillRect(0, 0, WIDTH, HEIGHT);
    for (const [x, y, size] of [
      [70, 100, 65],
      [690, 90, 75],
      [390, 55, 38],
      [50, 360, 55],
      [745, 340, 60],
    ]) {
      c.fillStyle = "#ffffffb8";
      c.beginPath();
      c.ellipse(x, y, size, 20, 0, 0, Math.PI * 2);
      c.ellipse(x - size * 0.2, y - 15, size * 0.42, 24, 0, 0, Math.PI * 2);
      c.ellipse(x + size * 0.35, y - 8, size * 0.4, 21, 0, 0, Math.PI * 2);
      c.fill();
    }
    for (const [x, y] of [
      [190, 55],
      [575, 145],
      [85, 230],
      [735, 220],
    ])
      star(c, x, y, 5, "#fff4c8");
    if (stage.id === "planet") {
      for (const [x, y, r] of [
        [85, 160, 9],
        [665, 65, 8],
        [540, 125, 5],
        [280, 90, 6],
      ])
        star(c, x, y, r, "#fff3c6", 0.15);
      c.strokeStyle = "#ffffff65";
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(400, 425, 315, 85, -0.2, 0, Math.PI * 2);
      c.stroke();
    }
  } else {
    c.drawImage(art.meadow, 0, 0, WIDTH, HEIGHT);
    c.fillStyle = theme.tint;
    c.fillRect(0, 0, WIDTH, HEIGHT);
    if (stage.id === "meadow") {
      c.fillStyle = "#ffedb3cc";
      c.beginPath();
      c.arc(660, 95, 37, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "#ebd399aa";
      c.lineWidth = 3;
      for (let n = 0; n < 10; n++) {
        const a = (n * Math.PI) / 5;
        c.beginPath();
        c.moveTo(660 + Math.cos(a) * 47, 95 + Math.sin(a) * 47);
        c.lineTo(660 + Math.cos(a) * 55, 95 + Math.sin(a) * 55);
        c.stroke();
      }
    }
  }
  // A cloud bank makes the open space under the floating stage unambiguous.
  const mist = c.createLinearGradient(0, 380, 0, 500);
  mist.addColorStop(0, "rgba(238,246,236,0)");
  mist.addColorStop(0.55, theme.mist);
  mist.addColorStop(1, theme.bottom);
  c.fillStyle = mist;
  c.fillRect(0, 380, WIDTH, 120);
  for (let i = 0; i < 8; i++) {
    c.fillStyle = i % 2 ? "#f4f6eaaa" : "#ffffff66";
    c.beginPath();
    c.ellipse(i * 130 - 35, 493 + (i % 2) * 12, 100, 38, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.textAlign = "center";
  c.fillStyle = theme.ink;
  c.font = "bold 12px sans-serif";
  c.fillText(`TAK&MEG  /  ${stage.label}`, WIDTH / 2, 477);
  for (const p of platformsAt(stage, g.elapsed)) {
    c.fillStyle = "#93ad8d25";
    c.beginPath();
    c.ellipse(p.x + p.w / 2, p.y + (p.main ? 49 : 27), p.w * 0.49, 12, 0, 0, Math.PI * 2);
    c.fill();
    if (p.motion) {
      const origin = stage.platforms.find((q) => q.id === p.id),
        m = p.motion;
      c.save();
      c.strokeStyle = "#afa2c3";
      c.lineWidth = 2;
      c.setLineDash([4, 7]);
      c.beginPath();
      if (m.axis === "x") {
        c.moveTo(origin.x + p.w / 2 - m.range, origin.y + 28);
        c.lineTo(origin.x + p.w / 2 + m.range, origin.y + 28);
      } else {
        c.moveTo(origin.x + p.w / 2, origin.y - m.range);
        c.lineTo(origin.x + p.w / 2, origin.y + m.range + 20);
      }
      c.stroke();
      c.restore();
    }
    if (p.profile) {
      if (p.tilt) {
        // The fulcrum is decoration; only the sloping board is a landing surface.
        c.beginPath();
        c.moveTo(p.x + p.w / 2, p.y + 9);
        c.lineTo(p.x + p.w / 2 + 35, p.y + 65);
        c.lineTo(p.x + p.w / 2 - 35, p.y + 65);
        c.closePath();
        c.fillStyle = "#c7b3b3";
        c.fill();
        c.strokeStyle = theme.line;
        c.stroke();
      }
      c.beginPath();
      p.profile.forEach(([x, y], i) =>
        i ? c.lineTo(p.x + x, p.y + y) : c.moveTo(p.x + x, p.y + y),
      );
      if (p.round) c.arc(p.x + p.w / 2, p.y, p.w / 2, 0, Math.PI);
      else if (p.tilt) {
        c.lineTo(p.x + p.w, surfaceAt(p, p.x + p.w) + 22);
        c.lineTo(p.x, surfaceAt(p, p.x) + 22);
      } else {
        c.lineTo(p.x + p.w, p.y + 38);
        c.lineTo(p.x, p.y + 38);
      }
      c.closePath();
      c.fillStyle = theme.soil;
      if (p.round) {
        const planet = c.createLinearGradient(0, p.y - p.w / 2, 0, p.y + 80);
        planet.addColorStop(0, "#e8dced");
        planet.addColorStop(1, "#b8acce");
        c.fillStyle = planet;
      }
      c.fill();
      c.strokeStyle = theme.line;
      c.lineWidth = 2;
      c.stroke();
      c.beginPath();
      p.profile.forEach(([x, y], i) =>
        i ? c.lineTo(p.x + x, p.y + y) : c.moveTo(p.x + x, p.y + y),
      );
      c.strokeStyle = theme.turf;
      c.lineWidth = 12;
      c.lineJoin = "round";
      c.stroke();
      c.lineJoin = "miter";
      if (p.round) {
        for (const [x, y, r] of [
          [330, 330, 24],
          [480, 385, 38],
          [380, 460, 17],
        ]) {
          c.fillStyle = "#aa9bc333";
          c.beginPath();
          c.ellipse(x, y, r, r * 0.65, -0.25, 0, Math.PI * 2);
          c.fill();
        }
      }
    } else {
      box(
        c,
        p.x,
        p.y + 3,
        p.w,
        p.main ? 35 : 19,
        p.main ? 17 : 9,
        p.main ? theme.soil : theme.ledge,
        theme.line,
      );
      box(c, p.x - 2, p.y - 3, p.w + 4, 12, 6, p.main ? theme.turf : theme.upper, theme.edge);
    }
    if (p.motion) {
      c.fillStyle = theme.ink;
      c.font = "bold 13px sans-serif";
      c.fillText(p.motion.axis === "x" ? "↔" : "↕", p.x + p.w / 2, p.y + 17);
    }
    c.strokeStyle = "#ba9e7a";
    c.lineWidth = 2;
    c.setLineDash([3, 10]);
    c.beginPath();
    c.moveTo(p.x + 15, surfaceAt(p, p.x + 15) + 22);
    c.lineTo(p.x + p.w - 15, surfaceAt(p, p.x + p.w - 15) + 22);
    c.stroke();
    c.setLineDash([]);
    if (p.main) {
      c.font = "bold 13px sans-serif";
      c.fillStyle = "#947558";
      if (!p.tilt)
        c.fillText(stage.name, p.x + p.w / 2, (p.round ? surfaceAt(p, p.x + p.w / 2) : p.y) + 27);
      for (const x of [p.x + 23, p.x + 55, p.x + p.w - 55, p.x + p.w - 23]) {
        c.strokeStyle = theme.edge;
        c.beginPath();
        const ground = surfaceAt(p, x);
        c.moveTo(x, ground - 5);
        c.lineTo(x, ground - 18);
        c.stroke();
        if (!p.tilt) star(c, x, ground - 20, 6, x % 2 ? "#fff0c6" : "#f4d8dc");
      }
    }
  }
  if (g.items.potion) drawPotion(c, g.items.potion, g.elapsed, reduced);
  for (const [i, f] of g.fighters.entries()) {
    const look = fighterAppearance(g, i);
    const size = fighterSize(f);
    if (!f.stocks || f.respawn > 0) continue;
    const visible =
      f.x > -42 * size && f.x < WIDTH + 42 * size && f.y > -70 && f.y < HEIGHT + 84 * size;
    if (!visible) {
      const x = Math.max(25, Math.min(WIDTH - 25, f.x)),
        y = Math.max(32, Math.min(HEIGHT - 27, f.y - 40));
      box(c, x - 23, y - 17, 46, 32, 16, "#fffaf1", look.color);
      c.fillStyle = "#705c55";
      c.font = "bold 15px sans-serif";
      c.fillText(i === (g.localPlayer ?? 0) ? "YOU" : g.online ? "相手" : "CPU", x, y + 5);
      continue;
    }
    if (f.grounded) {
      c.fillStyle = "#6656401a";
      c.beginPath();
      c.ellipse(f.x, f.y + 3, 32 * size, 6 * size, 0, 0, Math.PI * 2);
      c.fill();
    }
    if (f.invincible > 0) {
      c.strokeStyle = "#fffdf1";
      c.lineWidth = 3;
      c.setLineDash([5, 6]);
      c.beginPath();
      c.ellipse(f.x, f.y - 38 * size, 46 * size, 51 * size, 0, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }
    const newSheet = f.character === "ham" || f.character === "tapi";
    const pose = preview
      ? 0
      : f.stun > 0
        ? 4
        : f.attack?.kind === "special"
          ? 3
          : f.attack
            ? newSheet
              ? 3
              : 1
            : !f.grounded
              ? newSheet
                ? 2
                : 3
              : Math.abs(f.vx) > 30
                ? (newSheet ? 0 : 1) + (Math.floor(g.elapsed * 9) % 2)
                : 0;
    sprite(c, art, f, pose, time, reduced, look.alternate);
    if (f.attack) {
      const a = f.attack;
      c.save();
      c.translate(f.x, f.y - 38 * size);
      const reach = attackScale(f);
      c.scale(f.facing * reach, reach);
      c.lineWidth = a.kind === "special" ? 7 : 9;
      c.lineCap = "round";
      c.strokeStyle = a.kind === "special" ? "#f7d577dd" : "#fff8e4dd";
      c.beginPath();
      c.arc(
        0,
        0,
        a.kind === "special" ? 53 : 57,
        a.kind === "special" ? -Math.PI : -0.9,
        a.kind === "special" ? Math.PI : 0.8,
      );
      c.stroke();
      for (let n = 0; n < 3; n++)
        star(c, 47 + n * 9, -26 + n * 18, 5 + (n % 2) * 3, "#efbc6c", time);
      c.restore();
    }
    if (f.guarding) {
      c.fillStyle = "#cde7e652";
      c.strokeStyle = "#80b2b3";
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(f.x, f.y - 36 * size, (43 + f.shield * 0.055) * size, 48 * size, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    const labelY = f.y - 84 * size - 24;
    box(c, f.x - 24, labelY, 48, 20, 10, look.fill);
    c.fillStyle = look.ink;
    c.font = "bold 11px sans-serif";
    c.fillText(i === (g.localPlayer ?? 0) ? "YOU" : g.online ? "相手" : "CPU", f.x, labelY + 14);
    c.fillStyle = look.color;
    c.beginPath();
    c.moveTo(f.x - 4, labelY + 24);
    c.lineTo(f.x + 4, labelY + 24);
    c.lineTo(f.x, labelY + 29);
    c.fill();
  }
  for (const e of g.effects) {
    c.save();
    c.globalAlpha = Math.min(1, e.life * 4);
    if (e.type === "jump") {
      c.strokeStyle = e.color;
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(e.x, e.y + 2, 12 + e.age * 50, 4 + e.age * 10, 0, 0, Math.PI * 2);
      c.stroke();
    } else {
      const count = e.type === "out" ? 14 : 7;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2,
          d = 12 + e.age * (e.type === "out" ? 210 : 140);
        star(
          c,
          e.x + Math.cos(a) * d,
          e.y + Math.sin(a) * d,
          Math.max(2, 9 - e.age * 10),
          i % 2 ? e.color : "#fff9db",
          a + e.age * 3,
        );
      }
      if (e.type === "hit" || e.type === "grow") {
        c.font = "bold 21px sans-serif";
        c.fillStyle = "#927159";
        c.fillText(e.type === "grow" ? "ぐーん！" : "ぽよん！", e.x, e.y - 35 - e.age * 25);
      }
    }
    c.restore();
  }
  if (preview) {
    c.fillStyle = "#6b7965";
    c.font = "bold 14px sans-serif";
    c.fillText(stage.caption, 400, 65);
  } else if (g.phase === "countdown") {
    const n = Math.ceil(g.countdown);
    c.fillStyle = "#fffaf0dd";
    c.beginPath();
    c.arc(400, 235, 52, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#8b719d";
    c.font = "bold 62px sans-serif";
    c.fillText(String(n), 400, 256);
  }
  c.restore();
}

export function renderStageMap(canvas, stage) {
  const c = canvas.getContext("2d"),
    w = canvas.width,
    h = canvas.height;
  c.clearRect(0, 0, w, h);
  c.fillStyle = stage.theme.sky;
  c.fillRect(0, 0, w, h);
  // Show the seesaw at its maximum tilt so its miniature differs from a flat floor.
  for (const p of platformsAt(stage, stage.id === "seesaw" ? 1.75 : 0)) {
    const mapX = (x) => (x / WIDTH) * w,
      mapY = (y) => ((y - 100) / 350) * h;
    if (p.profile) {
      c.beginPath();
      p.profile.forEach(([x, y], i) =>
        i ? c.lineTo(mapX(p.x + x), mapY(p.y + y)) : c.moveTo(mapX(p.x + x), mapY(p.y + y)),
      );
      c.lineTo(mapX(p.x + p.w), mapY(surfaceAt(p, p.x + p.w)) + 8);
      c.lineTo(mapX(p.x), mapY(surfaceAt(p, p.x)) + 8);
      c.closePath();
      c.fillStyle = stage.theme.turf;
      c.fill();
      if (p.tilt) {
        c.beginPath();
        c.moveTo(mapX(400), mapY(p.y) + 4);
        c.lineTo(mapX(365), mapY(p.y) + 18);
        c.lineTo(mapX(435), mapY(p.y) + 18);
        c.closePath();
        c.fillStyle = stage.theme.line;
        c.fill();
      }
    } else
      box(
        c,
        mapX(p.x),
        mapY(p.y),
        mapX(p.w),
        p.main ? 9 : 5,
        3,
        p.main ? stage.theme.turf : stage.theme.edge,
      );
    if (p.motion) {
      c.font = "bold 15px sans-serif";
      c.fillStyle = stage.theme.ink;
      c.textAlign = "center";
      c.fillText(p.motion.axis === "x" ? "↔" : "↕", mapX(p.x + p.w / 2), mapY(p.y) - 5);
    }
  }
}
