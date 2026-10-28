// Pose selection uses only shared match state, so both online seats see the same acting.
export function friendPose(state, player) {
  if (state.phase === "finished") return state.winner === player ? "win" : "lose";
  if (state.total >= 6) return "nervous";
  if (state.phase === "falling") return "watch";
  return state.turn === player ? "play" : "watch";
}

export function friendMotion(pose, time, player, still = false) {
  if (still) return { x: 0, y: 0, angle: 0 };
  const phase = player * Math.PI;
  if (pose === "nervous")
    return {
      x: Math.sin(time / 65 + phase) * 0.9,
      y: 0,
      angle: Math.sin(time / 85 + phase) * 0.007,
    };
  if (pose === "win")
    return {
      x: 0,
      y: -4 * Math.abs(Math.sin(time / 230)),
      angle: Math.sin(time / 270 + phase) * 0.02,
    };
  if (pose === "play" || pose === "watch")
    return { x: 0, y: -Math.sin(time / 650 + phase), angle: 0 };
  return { x: 0, y: 0, angle: 0 };
}

// Measured transparent atlas regions, including paws/ears and expression marks.
// Keep one scale and align the feet rather than resizing each pose to a new width.
const frames = {
  play: [
    [161, 19, 338, 280],
    [548, 26, 320, 273],
  ],
  watch: [
    [161, 328, 295, 266],
    [585, 321, 281, 272],
  ],
  nervous: [
    [155, 620, 322, 272],
    [565, 619, 312, 273],
  ],
  win: [
    [131, 907, 371, 296],
    [557, 915, 342, 288],
  ],
  lose: [
    [162, 1228, 287, 280],
    [582, 1235, 282, 273],
  ],
};
const artwork = typeof Image === "function" ? new Image() : null;
if (artwork) artwork.src = new URL("./art/hamsters-play-v1.png", import.meta.url).href;

export function drawFriends(ctx, state, { time = 0, reduced = false, baseline = 458 } = {}) {
  if (!artwork?.complete || !artwork.naturalWidth) return;
  for (const player of [0, 1]) {
    const pose = friendPose(state, player),
      [sx, sy, sw, sh] = frames[pose][player],
      motion = friendMotion(pose, time, player, reduced || state.paused),
      scale = 0.46;
    ctx.save();
    ctx.translate((player === 0 ? 90 : 390) + motion.x, baseline + motion.y);
    ctx.rotate(motion.angle);
    ctx.drawImage(artwork, sx, sy, sw, sh, (-sw * scale) / 2, -sh * scale, sw * scale, sh * scale);
    ctx.restore();
  }
}
