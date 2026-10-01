import { createGame, createPosition, play, TYPES } from "./rules.js?v=20261001-shogi7";

export const PROTOCOL = "takumegu-shogi-3";
export const ownerForPlayer = (round, player) => player ^ ((round.roundId - 1) % 2);
export function createRound(matchId, roundId = 1, random = Math.random, hamlessPlayer = null) {
  if (![0, 1].includes(hamlessPlayer)) hamlessPlayer = null;
  const hamlessOwner = hamlessPlayer === null ? null : ownerForPlayer({ roundId }, hamlessPlayer);
  const game = createGame(random, hamlessOwner);
  return {
    protocol: PROTOCOL,
    matchId,
    roundId,
    hamlessPlayer,
    revision: 0,
    opening: game.board.map((p) => p && { ...p }),
    actions: [],
    game,
    rematch: [false, false],
    event: null,
  };
}
export function cleanAction(action) {
  if (!action || !Number.isInteger(action.to) || action.to < 0 || action.to > 15) return null;
  if (
    action.kind === "move" &&
    Number.isInteger(action.from) &&
    action.from >= 0 &&
    action.from < 16
  )
    return { kind: "move", from: action.from, to: action.to };
  if (action.kind === "drop" && TYPES.includes(action.type) && action.type !== "king")
    return { kind: "drop", type: action.type, to: action.to };
  return null;
}
function eventFor(result) {
  return result.reason === "repetition"
    ? {
        type: "repetition",
        offender: result.offender,
        continuous: result.continuous,
        rewound: result.rewound,
      }
    : null;
}
export function applyAction(round, player, request, random = Math.random) {
  const reject = (message) => ({ ok: false, message });
  if (
    ![0, 1].includes(player) ||
    !request ||
    request.matchId !== round.matchId ||
    request.roundId !== round.roundId
  )
    return reject("前の対局の操作みたい。画面を確認してね。");
  if (request.type === "rematch") {
    if (round.game.status !== "won" || round.rematch[player])
      return reject("相手の返事を待ってね。");
    const rematch = [...round.rematch];
    rematch[player] = true;
    return {
      ok: true,
      state: rematch.every(Boolean)
        ? createRound(round.matchId, round.roundId + 1, random, round.hamlessPlayer)
        : { ...round, rematch, event: null, revision: round.revision + 1 },
    };
  }
  if (
    request.type !== "play" ||
    request.revision !== round.revision ||
    ownerForPlayer(round, player) !== round.game.turn
  )
    return reject("手番が変わったよ。自分の番に指してね。");
  const action = cleanAction(request.action);
  if (!action) return reject("その手は指せないよ。");
  const result = play(round.game, action);
  if (!result.ok && result.reason !== "repetition") return reject("その手は指せないよ。");
  return {
    ok: true,
    state: {
      ...round,
      game: result.state,
      actions: [...round.actions, action],
      revision: round.revision + 1,
      event: eventFor(result),
    },
  };
}
export function roundView(round) {
  const { protocol, matchId, roundId, hamlessPlayer, revision, opening, actions, rematch } = round;
  return { protocol, matchId, roundId, hamlessPlayer, revision, opening, actions, rematch };
}
function validOpening(opening, hamlessOwner) {
  if (!Array.isArray(opening) || opening.length !== 16) return false;
  const board = [...opening];
  // Reconstruct the one missing ham, then require the original mirrored opening.
  if (hamlessOwner !== null) {
    const otherHam = board.findIndex((p) => p?.type === "ham" && p.owner === 1 - hamlessOwner);
    if (otherHam < 0 || board[15 - otherHam] !== null) return false;
    board[15 - otherHam] = { type: "ham", owner: hamlessOwner, promoted: false };
  }
  if (!Array.isArray(board) || board.length !== 16) return false;
  for (let i = 0; i < 16; i++) {
    const p = board[i],
      other = board[15 - i];
    if (p === null) {
      if (other !== null) return false;
      continue;
    }
    if (
      !p ||
      !TYPES.includes(p.type) ||
      p.promoted !== false ||
      p.owner !== (i < 8 ? 1 : 0) ||
      !other ||
      other.type !== p.type ||
      other.owner === p.owner
    )
      return false;
  }
  return (
    board
      .slice(12)
      .map((p) => p?.type)
      .sort()
      .join() === ["king", "taku", "megu", "ham"].sort().join() &&
    board.slice(8, 12).filter(Boolean).length === 1 &&
    board.slice(8, 12).find(Boolean)?.type === "tapi"
  );
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
    !Number.isSafeInteger(view.revision) ||
    view.revision < 0 ||
    ![null, 0, 1].includes(view.hamlessPlayer) ||
    !validOpening(
      view.opening,
      view.hamlessPlayer === null ? null : ownerForPlayer(view, view.hamlessPlayer),
    ) ||
    !Array.isArray(view.actions) ||
    view.actions.length > 4096 ||
    !Array.isArray(view.rematch) ||
    view.rematch.length !== 2 ||
    view.rematch.some((v) => typeof v !== "boolean") ||
    view.rematch.every(Boolean) ||
    view.revision !== view.actions.length + view.rematch.filter(Boolean).length
  )
    return null;
  // Replay attempts too: a rejected repetition can rewind a move and create a ban.
  const opening = view.opening.map((p) => p && { type: p.type, owner: p.owner, promoted: false });
  const firstOwner = view.hamlessPlayer === null ? 0 : ownerForPlayer(view, view.hamlessPlayer);
  let game = createPosition(opening, firstOwner),
    event = null;
  const actions = [];
  for (const entry of view.actions) {
    const action = cleanAction(entry);
    if (!action) return null;
    const result = play(game, action);
    if (!result.ok && result.reason !== "repetition") return null;
    actions.push(action);
    game = result.state;
    event = eventFor(result);
  }
  if (game.status !== "won" && view.rematch.some(Boolean)) return null;
  if (view.rematch.some(Boolean)) event = null;
  return {
    protocol: PROTOCOL,
    matchId: view.matchId,
    roundId: view.roundId,
    hamlessPlayer: view.hamlessPlayer,
    revision: view.revision,
    opening,
    actions,
    game,
    event,
    rematch: [...view.rematch],
  };
}
