import { createGame, startGame, launch, advance, placeCue } from "./physics.js?v=20260926-5";

export const PROTOCOL = "takumegu-billiards-v1";
// A shared seed and accepted actions reproduce the same table on both devices.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function opening(matchId, roundId, seed) {
  const game = createGame(seeded(seed), (roundId - 1) % 2);
  startGame(game);
  return {
    protocol: PROTOCOL,
    matchId,
    roundId,
    seed,
    revision: 0,
    actions: [],
    rematch: [false, false],
    game,
  };
}
export function createRound(matchId, roundId = 1, random = Math.random) {
  return opening(matchId, roundId, Math.floor(random() * 4294967296) >>> 0);
}
const reject = (message) => ({ ok: false, message });
function cleanAction(type, action) {
  if (!action || typeof action !== "object") return null;
  if (type === "shot") {
    const { dx, dy } = action;
    if (
      !Number.isFinite(dx) ||
      !Number.isFinite(dy) ||
      Math.abs(dx) > 10000 ||
      Math.abs(dy) > 10000
    )
      return null;
    return { type, dx, dy };
  }
  if (type === "place" && Number.isFinite(action.x) && Number.isFinite(action.y))
    return { type, x: action.x, y: action.y };
  return null;
}
export function applyAction(state, player, request, random = Math.random) {
  if (
    ![0, 1].includes(player) ||
    !request ||
    request.matchId !== state.matchId ||
    request.roundId !== state.roundId
  )
    return reject("今のへやの情報を待ってね。");
  if (request.type === "rematch") {
    if (state.game.phase !== "finished" || state.rematch[player])
      return reject("相手の準備を待ってね。");
    const next = structuredClone(state);
    next.rematch[player] = true;
    next.revision++;
    return {
      ok: true,
      state: next.rematch.every(Boolean)
        ? createRound(state.matchId, state.roundId + 1, random)
        : next,
    };
  }
  if (request.revision !== state.revision)
    return reject("台の情報をそろえているよ。もう一度ためしてね。");
  if (state.game.turn !== player) return reject("相手の番だよ。少し待ってね。");
  if (!["aiming", "placing"].includes(state.game.phase))
    return reject("球が全部止まるまで待ってね。");
  const action = cleanAction(request.type, request.action);
  if (!action) return reject("ショットや置く場所を、もう一度えらんでね。");
  const next = structuredClone(state);
  const ok =
    action.type === "shot"
      ? launch(next.game, 0, action.dx, action.dy)
      : placeCue(next.game, action.x, action.y);
  if (!ok)
    return reject(
      action.type === "shot" ? "白球をもう少し引っぱってね。" : "球や穴から離れた場所に置こう。",
    );
  next.actions.push(action);
  next.revision++;
  return { ok: true, state: next };
}
// Only the host calls this after BOTH clients have finished the rolling animation.
export function settleRound(state) {
  if (state.game.phase !== "moving") return state;
  const next = structuredClone(state);
  for (let i = 0; i < 60 && next.game.phase === "moving"; i++) advance(next.game, 1);
  if (next.game.phase === "moving")
    throw new Error("球の動きを確認できなかったよ。へやをつくり直してね。");
  next.revision++;
  return next;
}
export function roundView(state) {
  const { protocol, matchId, roundId, seed, revision, actions, rematch } = state;
  return structuredClone({
    protocol,
    matchId,
    roundId,
    seed,
    revision,
    actions,
    rematch,
    rolling: state.game.phase === "moving",
  });
}
export function validateRound(view) {
  if (
    !view ||
    view.protocol !== PROTOCOL ||
    typeof view.matchId !== "string" ||
    !view.matchId.length ||
    view.matchId.length > 160 ||
    !Number.isSafeInteger(view.roundId) ||
    view.roundId < 1 ||
    view.roundId > 100000 ||
    !Number.isInteger(view.seed) ||
    view.seed < 0 ||
    view.seed > 4294967295 ||
    !Number.isInteger(view.revision) ||
    view.revision < 0 ||
    view.revision > 40 ||
    !Array.isArray(view.actions) ||
    view.actions.length > 20 ||
    typeof view.rolling !== "boolean" ||
    !Array.isArray(view.rematch) ||
    view.rematch.length !== 2 ||
    view.rematch.some((v) => typeof v !== "boolean") ||
    view.rematch.every(Boolean)
  )
    return null;
  try {
    let state = opening(view.matchId, view.roundId, view.seed);
    for (let i = 0; i < view.actions.length; i++) {
      const action = view.actions[i];
      if (!["shot", "place"].includes(action?.type)) return null;
      const result = applyAction(state, state.game.turn, { ...state, type: action?.type, action });
      if (!result.ok) return null;
      state = result.state;
      if (state.game.phase === "moving" && (i < view.actions.length - 1 || !view.rolling))
        state = settleRound(state);
    }
    if ((state.game.phase === "moving") !== view.rolling) return null;
    if (view.rematch.some(Boolean) && state.game.phase !== "finished") return null;
    state.rematch = [...view.rematch];
    state.revision += view.rematch.filter(Boolean).length;
    return state.revision === view.revision ? state : null;
  } catch {
    return null;
  }
}
