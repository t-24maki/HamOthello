import { drop, step, view, restoreForTrial, dispose, PLATE_Y } from "./engine.js?v=20261027-gyoza3";
export function chooseMove(snapshot, random = Math.random) {
  let best = { x: 240, angle: 0, score: -Infinity };
  const offsets = [0, -42, 42, -78, 78, -108, 108];
  const angles = [0, Math.PI, Math.PI / 6, -Math.PI / 6, Math.PI / 2];
  for (let i = 0; i < 18; i++) {
    const x = 240 + offsets[i % offsets.length] + (random() - 0.5) * 12;
    const angle = angles[i % angles.length];
    const game = restoreForTrial(snapshot);
    drop(game, game.turn, x, angle);
    let count = 0;
    while (game.phase === "falling" && count++ < 1000) step(game);
    const v = view(game),
      height = PLATE_Y - v.top;
    const safe = game.phase === "aim";
    const spread = v.bodies.reduce((n, b) => n + Math.max(0, Math.abs(b.x - 240) - 96), 0);
    const score =
      (safe ? 10000 : -10000) -
      height * 0.7 -
      spread * 2 -
      Math.abs(x - 240) * 0.035 +
      random() * 10;
    if (score > best.score) best = { x, angle, score };
    dispose(game);
  }
  return { x: best.x, angle: best.angle };
}
