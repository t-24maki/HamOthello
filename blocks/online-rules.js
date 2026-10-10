import { createGame, cleanAction, play } from "./rules.js?v=20261010-blocks3";
export const PROTOCOL = "takumegu-blocks-1";
export const ownerForPlayer = (_round, player) => player;
export function createRound(matchId, roundId = 1, random = Math.random) {
  const seed = Math.floor(random() * 4294967296) >>> 0;
  return {
    protocol: PROTOCOL,
    matchId,
    roundId,
    revision: 0,
    seed,
    actions: [],
    game: createGame({ seed, starter: (roundId - 1) % 2 }),
    rematch: [false, false],
  };
}
export function applyAction(round, player, request, random = Math.random) {
  const reject = (message) => ({ ok: false, message });
  if (
    ![0, 1].includes(player) ||
    !request ||
    request.matchId !== round.matchId ||
    request.roundId !== round.roundId
  )
    return reject("前の対戦の操作みたい。画面を確認してね。");
  if (request.type === "rematch") {
    if (
      round.game.status !== "won" ||
      round.rematch[player] ||
      round.roundId >= Number.MAX_SAFE_INTEGER
    )
      return reject("相手の返事を待ってね。");
    const rematch = [...round.rematch];
    rematch[player] = true;
    return {
      ok: true,
      state: rematch.every(Boolean)
        ? createRound(round.matchId, round.roundId + 1, random)
        : { ...round, rematch, revision: round.revision + 1 },
    };
  }
  if (request.type !== "play" || request.revision !== round.revision || player !== round.game.turn)
    return reject("手番が変わったよ。自分の番に置いてね。");
  const action = cleanAction(request.action);
  const result = action && play(round.game, action, player);
  if (!result?.ok) return reject("そこには置けないよ。空いているマスを選んでね。");
  return {
    ok: true,
    state: {
      ...round,
      game: result.state,
      actions: [...round.actions, action],
      revision: round.revision + 1,
    },
  };
}
export function roundView(round) {
  const { protocol, matchId, roundId, revision, seed, actions, rematch } = round;
  return { protocol, matchId, roundId, revision, seed, actions, rematch };
}
export function validateRound(view) {
  if (
    !view ||
    view.protocol !== PROTOCOL ||
    typeof view.matchId !== "string" ||
    !view.matchId ||
    view.matchId.length > 120 ||
    !Number.isSafeInteger(view.roundId) ||
    view.roundId < 1 ||
    !Number.isInteger(view.seed) ||
    view.seed < 0 ||
    view.seed > 4294967295 ||
    !Array.isArray(view.actions) ||
    view.actions.length > 14 ||
    !Array.isArray(view.rematch) ||
    view.rematch.length !== 2 ||
    view.rematch.some((v) => typeof v !== "boolean") ||
    view.rematch.every(Boolean) ||
    view.revision !== view.actions.length + view.rematch.filter(Boolean).length
  )
    return null;
  let game = createGame({ seed: view.seed, starter: (view.roundId - 1) % 2 });
  const actions = [];
  for (const entry of view.actions) {
    const action = cleanAction(entry);
    const result = action && play(game, action);
    if (!result?.ok) return null;
    game = result.state;
    actions.push(action);
  }
  if (game.status !== "won" && view.rematch.some(Boolean)) return null;
  return { ...roundView(view), actions, rematch: [...view.rematch], game };
}
