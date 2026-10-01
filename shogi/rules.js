export const SIZE = 4;
export const TYPES = ["king", "taku", "megu", "ham", "tapi"];
export const HAND_TYPES = TYPES.filter((type) => type !== "king");
export const PIECES = {
  king: { name: "ハム王", short: "王", hint: "まわり8方向に1マス", promotedHint: "" },
  taku: {
    name: "たくハム",
    short: "たく",
    hint: "上下左右に1マス",
    promotedHint: "上下左右にどこまでも",
  },
  megu: {
    name: "めぐハム",
    short: "めぐ",
    hint: "斜め4方向に1マス",
    promotedHint: "斜め4方向にどこまでも",
  },
  ham: {
    name: "ハム（加工肉）",
    short: "ハム",
    hint: "左前・右前・真後ろに1マス",
    promotedHint: "左右以外の6方向に1マス",
  },
  tapi: { name: "たぴ", short: "たぴ", hint: "前に1マス", promotedHint: "8方向にどこまでも" },
};
const ORTHOGONAL = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const DIAGONAL = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
const ALL = [...ORTHOGONAL, ...DIAGONAL];
const emptyHand = () => Object.fromEntries(HAND_TYPES.map((type) => [type, 0]));
const copyBoard = (board) => board.map((piece) => (piece ? { ...piece } : null));

export function pieceName(piece) {
  return `${piece.promoted ? "成・" : ""}${PIECES[piece.type].name}`;
}
export function movement(piece) {
  let directions,
    sliding = false;
  switch (piece.type) {
    case "king":
      directions = ALL;
      break;
    case "taku":
      directions = ORTHOGONAL;
      sliding = piece.promoted;
      break;
    case "megu":
      directions = DIAGONAL;
      sliding = piece.promoted;
      break;
    case "ham":
      directions = piece.promoted
        ? [[-1, 0], [1, 0], ...DIAGONAL]
        : [
            [-1, -1],
            [-1, 1],
            [1, 0],
          ];
      break;
    case "tapi":
      directions = piece.promoted ? ALL : [[-1, 0]];
      sliding = piece.promoted;
      break;
    default:
      return { directions: [], sliding: false };
  }
  const facing = piece.owner === 0 ? 1 : -1;
  return {
    directions: directions.map(([r, c]) => [r * facing, c * facing]),
    sliding: Boolean(sliding),
  };
}

// Include hands, promotion and side to move; identical pieces have no artificial IDs.
export function positionKey(position) {
  return JSON.stringify([
    position.turn,
    position.board.map((p) => (p ? [p.owner, p.type, Boolean(p.promoted)] : null)),
    position.hands.map((hand) => HAND_TYPES.map((type) => hand[type])),
  ]);
}
function snapshot(position) {
  return {
    board: copyBoard(position.board),
    hands: position.hands.map((hand) => ({ ...hand })),
    turn: position.turn,
    status: position.status,
    winner: position.winner,
    lastMove: position.lastMove ? { ...position.lastMove } : null,
  };
}

export function createGame(random = Math.random, hamlessOwner = null) {
  const row = ["king", "taku", "megu", "ham"];
  for (let i = row.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [row[i], row[j]] = [row[j], row[i]];
  }
  const board = Array(16).fill(null);
  for (let c = 0; c < 4; c++) {
    board[12 + c] = { type: row[c], owner: 0, promoted: false };
    board[3 - c] = { type: row[c], owner: 1, promoted: false };
  }
  const tapi = 8 + Math.floor(random() * 4);
  board[tapi] = { type: "tapi", owner: 0, promoted: false };
  board[15 - tapi] = { type: "tapi", owner: 1, promoted: false };
  // Remove only the processed-meat ham, before recording the initial history.
  if (hamlessOwner === 0 || hamlessOwner === 1) {
    const index = board.findIndex((p) => p?.owner === hamlessOwner && p.type === "ham");
    board[index] = null;
  }
  return createPosition(board, hamlessOwner === 1 ? 1 : 0);
}

// A reusable starting position is also useful for rule tests and future saved games.
export function createPosition(board, turn = 0, hands = [emptyHand(), emptyHand()]) {
  const state = {
    board: copyBoard(board),
    turn,
    hands: hands.map((hand) => ({ ...emptyHand(), ...hand })),
    status: "playing",
    winner: null,
    lastMove: null,
    moves: [],
    history: [],
    restriction: null,
  };
  state.history = [{ ...snapshot(state), key: positionKey(state) }];
  return state;
}

export function moveTargets(position, from) {
  const piece = position.board[from];
  if (!piece) return [];
  const { directions, sliding } = movement(piece),
    targets = [];
  const row = Math.floor(from / 4),
    column = from % 4;
  for (const [dr, dc] of directions) {
    let r = row + dr,
      c = column + dc;
    while (r >= 0 && r < 4 && c >= 0 && c < 4) {
      const target = r * 4 + c,
        occupant = position.board[target];
      if (occupant?.owner === piece.owner) break;
      targets.push(target);
      if (occupant || !sliding) break;
      r += dr;
      c += dc;
    }
  }
  return targets;
}

export function inCheck(position, owner) {
  const king = position.board.findIndex((p) => p?.owner === owner && p.type === "king");
  if (king < 0) return false;
  return position.board.some(
    (p, from) => p && p.owner !== owner && moveTargets(position, from).includes(king),
  );
}

export function dropTargets(state, type) {
  if (state.status !== "playing" || !HAND_TYPES.includes(type) || state.hands[state.turn][type] < 1)
    return [];
  // No nifu, dead-rank, or pawn-drop-mate restrictions in this variant.
  return state.board.flatMap((piece, index) => (piece ? [] : [index]));
}

export function actionKey(action) {
  return action.kind === "drop"
    ? `drop:${action.type}:${action.to}`
    : `move:${action.from}:${action.to}`;
}
export function isRestricted(state, action) {
  return (
    state.restriction?.key === positionKey(state) &&
    state.restriction.actions.includes(actionKey(action))
  );
}

function validate(state, action) {
  if (
    state.status !== "playing" ||
    !action ||
    !Number.isInteger(action.to) ||
    action.to < 0 ||
    action.to >= 16
  )
    return false;
  if (action.kind === "drop") return dropTargets(state, action.type).includes(action.to);
  if (action.kind !== "move" || !Number.isInteger(action.from)) return false;
  return (
    state.board[action.from]?.owner === state.turn &&
    moveTargets(state, action.from).includes(action.to)
  );
}

function repetition(next) {
  const key = positionKey(next);
  const occurrences = next.history.flatMap((frame, i) => (frame.key === key ? [i] : []));
  if (occurrences.length < 4) return null;
  const first = occurrences.at(-4),
    end = next.history.length - 1;
  const interval = next.moves.slice(first, end);
  const checkers = [0, 1].filter((owner) => {
    const ownMoves = interval.filter((move) => move.owner === owner);
    return ownMoves.length > 0 && ownMoves.every((move) => move.check);
  });
  // If both keep giving check, the player completing the cycle must change the move.
  const offender =
    checkers.length === 1
      ? checkers[0]
      : checkers.length === 2
        ? next.moves.at(-1).owner
        : next.history[0].turn;
  return { offender, continuous: checkers.length > 0 };
}

export function play(state, action) {
  if (!validate(state, action)) return { ok: false, reason: "invalid", state };
  if (isRestricted(state, action))
    return { ok: false, reason: "repetition", state, ...state.restriction, rewound: 0 };
  const next = {
    ...snapshot(state),
    moves: [...state.moves],
    history: [...state.history],
    restriction: null,
  };
  const captured = next.board[action.to];
  let piece;
  if (action.kind === "drop") {
    piece = { owner: state.turn, type: action.type, promoted: false };
    next.hands[state.turn][action.type]--;
  } else {
    piece = { ...next.board[action.from] };
    next.board[action.from] = null;
    if (piece.type !== "king" && Math.floor(action.to / 4) === (piece.owner === 0 ? 0 : 3))
      piece.promoted = true;
  }
  next.board[action.to] = piece;
  if (captured?.type === "king") {
    next.status = "won";
    next.winner = state.turn;
  } else {
    if (captured) next.hands[state.turn][captured.type]++;
    next.turn = 1 - state.turn;
  }
  const move = {
    ...action,
    owner: state.turn,
    type: piece.type,
    promoted: piece.promoted,
    newlyPromoted: piece.promoted && !state.board[action.from]?.promoted,
    captured: captured?.type ?? null,
    check: next.status !== "won" && inCheck(next, next.turn),
  };
  next.lastMove = move;
  next.moves.push(move);
  next.history.push({ ...snapshot(next), key: positionKey(next) });
  if (next.status === "won") return { ok: true, state: next, move };
  const repeat = repetition(next);
  if (!repeat) return { ok: true, state: next, move };

  // The closing move may belong to the other player. Rewind to the responsible
  // player's last decision, rather than wrongly blocking the innocent reply.
  const offendingIndex = next.moves.findLastIndex((m) => m.owner === repeat.offender);
  const offendingMove = next.moves[offendingIndex];
  const frame = next.history[offendingIndex];
  const oldBans = state.restriction?.key === frame.key ? state.restriction.actions : [];
  const restriction = {
    ...repeat,
    key: frame.key,
    actions: [...new Set([...oldBans, actionKey(offendingMove)])],
  };
  const restored = {
    ...snapshot(frame),
    moves: next.moves.slice(0, offendingIndex),
    history: next.history.slice(0, offendingIndex + 1),
    restriction,
  };
  return {
    ok: false,
    reason: "repetition",
    state: restored,
    ...repeat,
    rewound: state.moves.length - offendingIndex,
  };
}
