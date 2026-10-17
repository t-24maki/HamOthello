// Rendering, landings, spawning and CPU navigation all use these same platforms.
const circleProfile = (diameter) =>
  Array.from({ length: 65 }, (_, i) => {
    const x = (diameter * i) / 64,
      r = diameter / 2;
    return [x, -Math.sqrt(Math.max(0, r * r - (x - r) ** 2))];
  });
const definitions = [
  {
    id: "hill",
    name: "ぽよんの丘",
    number: "01",
    caption: "ふわふわの丘で、腕だめし。",
    description: "3つの足場で、ぴょんぴょん。",
    label: "PICNIC GARDEN",
    spawns: [250, 550],
    platforms: [
      { x: 130, y: 370, w: 540, main: true },
      { x: 210, y: 260, w: 135 },
      { x: 455, y: 260, w: 135 },
      { x: 345, y: 165, w: 110 },
    ],
    theme: {
      tint: "rgba(245,250,238,.22)",
      sky: "#e6f0e8",
      mist: "#e7efe1",
      bottom: "#d7e5d6",
      turf: "#9ebd8a",
      upper: "#b6cb9b",
      edge: "#91ac7b",
      soil: "#dbb890",
      ledge: "#ddcbaa",
      line: "#ad9577",
      ink: "#81917f",
    },
  },
  {
    id: "meadow",
    name: "ひだまりひろば",
    number: "02",
    caption: "のぼって、おりて。坂道でひと勝負！",
    description: "まんなかの丘へ、坂道をかけよう。",
    label: "SUNNY MEADOW",
    spawns: [180, 620],
    platforms: [
      {
        x: 85,
        y: 400,
        w: 630,
        main: true,
        profile: [
          [0, 0],
          [135, 0],
          [260, -100],
          [370, -100],
          [495, 0],
          [630, 0],
        ],
      },
    ],
    theme: {
      tint: "rgba(255,229,165,.32)",
      sky: "#f8eed4",
      mist: "#f4ecd5",
      bottom: "#e7ddb9",
      turf: "#c4c482",
      upper: "#d2d099",
      edge: "#aaa66c",
      soil: "#e5c499",
      ledge: "#f0d9b4",
      line: "#b99c72",
      ink: "#9b8961",
    },
  },
  {
    id: "cloud",
    name: "わたぐもテラス",
    number: "03",
    caption: "うごく雲に乗って、ふわりとジャンプ！",
    description: "左右にすいすい、まんなかは上下。",
    label: "CLOUD TERRACE",
    spawns: [270, 530],
    platforms: [
      { x: 190, y: 390, w: 420, main: true },
      { x: 145, y: 275, w: 155, motion: { axis: "x", range: 65, period: 6, phase: 0 } },
      { x: 500, y: 275, w: 155, motion: { axis: "x", range: 65, period: 6, phase: Math.PI } },
      { x: 345, y: 190, w: 110, motion: { axis: "y", range: 45, period: 5, phase: 0 } },
    ],
    theme: {
      tint: "rgba(222,220,251,.44)",
      sky: "#e9e6f3",
      mist: "#eeebf5",
      bottom: "#dcd6ec",
      turf: "#c7c4df",
      upper: "#e4e0f2",
      edge: "#aca4c6",
      soil: "#d8c8d9",
      ledge: "#e7ddeb",
      line: "#b5a3bc",
      ink: "#9687a6",
    },
  },
  {
    id: "islands",
    name: "ふたごのうきしま",
    number: "04",
    caption: "まんなかのすきまを、ぴょーん！",
    description: "まんなかは穴。向こうの島へジャンプ！",
    label: "TWIN ISLANDS",
    spawns: [220, 580],
    respawns: [230, 570],
    platforms: [
      { x: 105, y: 370, w: 230, main: true },
      { x: 465, y: 370, w: 230, main: true },
    ],
    theme: {
      tint: "rgba(208,242,244,.25)",
      sky: "#dceff0",
      mist: "#d9ebee",
      bottom: "#bcd9df",
      turf: "#88bfb2",
      upper: "#b9d9c4",
      edge: "#73a89b",
      soil: "#dfbd97",
      ledge: "#ecd3b0",
      line: "#ad967b",
      ink: "#75989b",
    },
  },
  {
    id: "seesaw",
    name: "ゆらゆらシーソー",
    number: "05",
    caption: "こっちが上なら、あっちは下！",
    description: "大きな床が、ゆっくり左右にかたむくよ。",
    label: "SWAYING SEESAW",
    spawns: [250, 550],
    respawns: [300, 500],
    platforms: [
      {
        x: 150,
        y: 345,
        w: 500,
        main: true,
        profile: [
          [0, 0],
          [500, 0],
        ],
        tilt: { range: 64, period: 7 },
      },
      { x: 75, y: 270, w: 95 },
      { x: 630, y: 270, w: 95 },
    ],
    theme: {
      tint: "rgba(255,222,212,.35)",
      sky: "#fae9df",
      mist: "#f3e3d5",
      bottom: "#e8d5c5",
      turf: "#e5ad91",
      upper: "#ecd0a9",
      edge: "#bc8a72",
      soil: "#d5ab82",
      ledge: "#e8cda7",
      line: "#aa8568",
      ink: "#ac8b7c",
    },
  },
  {
    id: "planet",
    name: "まんまるプラネット",
    number: "06",
    caption: "まあるい星で、ころんとひと勝負。",
    description: "丸い星の上を、のぼって、おりて。",
    label: "ROUND LITTLE PLANET",
    spawns: [260, 540],
    respawns: [300, 500],
    platforms: [
      { x: 170, y: 430, w: 460, main: true, round: true, profile: circleProfile(460) },
      { x: 70, y: 330, w: 100 },
      { x: 630, y: 330, w: 100 },
    ],
    theme: {
      tint: "rgba(215,220,250,.4)",
      sky: "#e5e4f4",
      mist: "#e1dcf0",
      bottom: "#c9c3e2",
      turf: "#adb7d3",
      upper: "#ded8ee",
      edge: "#8d98ba",
      soil: "#d8ccdf",
      ledge: "#e6d8e8",
      line: "#a799ba",
      ink: "#8f85a8",
    },
  },
];
export const STAGES = Object.freeze(
  definitions.map((stage) =>
    Object.freeze({
      ...stage,
      spawns: Object.freeze(stage.spawns),
      ...(stage.respawns ? { respawns: Object.freeze(stage.respawns) } : {}),
      theme: Object.freeze(stage.theme),
      platforms: Object.freeze(
        stage.platforms.map((p, id) =>
          Object.freeze({
            ...p,
            id,
            ...(p.motion ? { motion: Object.freeze(p.motion) } : {}),
            ...(p.tilt ? { tilt: Object.freeze(p.tilt) } : {}),
            ...(p.profile
              ? { profile: Object.freeze(p.profile.map((point) => Object.freeze(point))) }
              : {}),
          }),
        ),
      ),
    }),
  ),
);
export function getStage(id) {
  return STAGES.find((stage) => stage.id === id) || STAGES[0];
}
export function mainPlatform(stage) {
  return stage.platforms.find((p) => p.main);
}
export function stageBounds(stage) {
  const floors = stage.platforms.filter((p) => p.main);
  const x = Math.min(...floors.map((p) => p.x));
  return { ...floors[0], x, w: Math.max(...floors.map((p) => p.x + p.w)) - x };
}
export function spawnPoint(stage, index, time = 0, respawn = false) {
  const x = (respawn ? (stage.respawns ?? [325, 475]) : stage.spawns)[index];
  const p = platformsAt(stage, time).find((p) => p.main && supports(p, x, 0));
  return { x, y: respawn && !stage.respawns ? p.y : surfaceAt(p, x), platformId: p.id };
}

// All movement is a function of simulation time, so pause and replay stay exact.
export function platformsAt(stage, time = 0) {
  return stage.platforms.map((p) => {
    if (p.tilt) {
      const rise = Math.sin((time * Math.PI * 2) / p.tilt.period) * p.tilt.range;
      return {
        ...p,
        profile: [
          [0, -rise],
          [p.w, rise],
        ],
      };
    }
    if (!p.motion) return p;
    const m = p.motion,
      offset = Math.sin((time * Math.PI * 2) / m.period + m.phase) * m.range;
    return { ...p, [m.axis]: p[m.axis] + offset };
  });
}
export function surfaceAt(platform, x) {
  if (!platform.profile) return platform.y;
  const local = Math.max(0, Math.min(platform.w, x - platform.x));
  const points = platform.profile;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    if (local <= b[0]) return platform.y + a[1] + ((b[1] - a[1]) * (local - a[0])) / (b[0] - a[0]);
  }
  return platform.y + points.at(-1)[1];
}
export function supports(platform, x, radius = 18) {
  return x + radius > platform.x && x - radius < platform.x + platform.w;
}
