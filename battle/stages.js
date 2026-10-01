// Rendering, landings, spawning and CPU navigation all use these same platforms.
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
];
export const STAGES = Object.freeze(
  definitions.map((stage) =>
    Object.freeze({
      ...stage,
      spawns: Object.freeze(stage.spawns),
      theme: Object.freeze(stage.theme),
      platforms: Object.freeze(
        stage.platforms.map((p, id) =>
          Object.freeze({
            ...p,
            id,
            ...(p.motion ? { motion: Object.freeze(p.motion) } : {}),
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

// All movement is a function of simulation time, so pause and replay stay exact.
export function platformsAt(stage, time = 0) {
  return stage.platforms.map((p) => {
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
export function supports(platform, x) {
  return x + 18 > platform.x && x - 18 < platform.x + platform.w;
}
