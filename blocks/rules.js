export const SIZE = 8;
export const PIECES = ["I", "O", "T", "S", "Z", "J", "L"];
const shapes = {
  I: [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
  ],
  O: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  T: [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
  S: [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
  ],
  Z: [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
  ],
  J: [
    [0, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
  L: [
    [2, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
};
function normalize(cells) {
  const left = Math.min(...cells.map(([x]) => x));
  const top = Math.min(...cells.map(([, y]) => y));
  return cells.map(([x, y]) => [x - left, y - top]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
// Clockwise rotations only. S/Z and J/L remain distinct pieces.
export const ROTATIONS = Object.fromEntries(
  PIECES.map((piece) => {
    const variants = [];
    let cells = normalize(shapes[piece]);
    for (let i = 0; i < 4; i++) {
      if (!variants.some((v) => JSON.stringify(v) === JSON.stringify(cells))) variants.push(cells);
      cells = normalize(cells.map(([x, y]) => [-y, x]));
    }
    return [piece, variants];
  }),
);

export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let n = Math.imul(value ^ (value >>> 15), 1 | value);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
export function randomBlocked(seed) {
  const random = seededRandom(seed);
  const cells = Array.from({ length: SIZE * SIZE }, (_, i) => i);
  for (let i = 0; i < 4; i++) {
    const j = i + Math.floor(random() * (cells.length - i));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells.slice(0, 4).sort((a, b) => a - b);
}
export function createGame({
  seed = Math.floor(Math.random() * 4294967296),
  starter = 0,
  blocked = randomBlocked(seed),
} = {}) {
  if (
    ![0, 1].includes(starter) ||
    !Array.isArray(blocked) ||
    blocked.length !== 4 ||
    new Set(blocked).size !== 4 ||
    blocked.some((i) => !Number.isInteger(i) || i < 0 || i >= 64)
  )
    throw new Error("Invalid opening");
  return {
    seed: seed >>> 0,
    starter,
    turn: starter,
    board: Array.from({ length: 64 }, (_, i) => (blocked.includes(i) ? -1 : 0)),
    hands: [[...PIECES], [...PIECES]],
    moves: [],
    status: "playing",
    winner: null,
    reason: null,
  };
}
export function cleanAction(action) {
  if (
    !action ||
    !PIECES.includes(action.piece) ||
    !Number.isInteger(action.rotation) ||
    action.rotation < 0 ||
    action.rotation >= ROTATIONS[action.piece].length ||
    !Number.isInteger(action.x) ||
    !Number.isInteger(action.y) ||
    action.x < 0 ||
    action.y < 0 ||
    action.x >= SIZE ||
    action.y >= SIZE ||
    action.flip ||
    action.mirror
  )
    return null;
  return { piece: action.piece, rotation: action.rotation, x: action.x, y: action.y };
}
export function cellsFor(action) {
  return ROTATIONS[action.piece][action.rotation].map(([x, y]) => [x + action.x, y + action.y]);
}
export function canPlace(state, action, player = state.turn) {
  const move = cleanAction(action);
  return (
    !!move &&
    state.status === "playing" &&
    [0, 1].includes(player) &&
    state.hands[player].includes(move.piece) &&
    cellsFor(move).every(([x, y]) => x < SIZE && y < SIZE && state.board[y * SIZE + x] === 0)
  );
}
export function* legalMoves(state, player = state.turn) {
  if (state.status !== "playing" || ![0, 1].includes(player)) return;
  for (const piece of state.hands[player])
    for (let rotation = 0; rotation < ROTATIONS[piece].length; rotation++)
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          const action = { piece, rotation, x, y };
          if (canPlace(state, action, player)) yield action;
        }
}
export const hasLegalMove = (state, player = state.turn) => !legalMoves(state, player).next().done;
export function play(state, action, player = state.turn) {
  if (player !== state.turn || !canPlace(state, action, player)) return { ok: false, state };
  const move = cleanAction(action);
  const board = [...state.board];
  for (const [x, y] of cellsFor(move)) board[y * SIZE + x] = player + 1;
  const hands = state.hands.map((hand, p) =>
    p === player ? hand.filter((piece) => piece !== move.piece) : [...hand],
  );
  const next = {
    ...state,
    board,
    hands,
    turn: 1 - player,
    moves: [...state.moves, { ...move, player }],
  };
  if (hands.every((hand) => hand.length === 0)) {
    next.status = "won";
    next.winner = 1 - state.starter;
    next.reason = "all-placed";
  } else if (!hasLegalMove(next)) {
    next.status = "won";
    next.winner = player;
    next.reason = "blocked";
  }
  return { ok: true, state: next };
}
