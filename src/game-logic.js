export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const BOARD_SIZE = 8;

const DIRECTIONS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

const POSITION_WEIGHTS = [
  120, -28, 18, 8, 8, 18, -28, 120,
  -28, -45, -6, -5, -5, -6, -45, -28,
  18, -6, 14, 4, 4, 14, -6, 18,
  8, -5, 4, 2, 2, 4, -5, 8,
  8, -5, 4, 2, 2, 4, -5, 8,
  18, -6, 14, 4, 4, 14, -6, 18,
  -28, -45, -6, -5, -5, -6, -45, -28,
  120, -28, 18, 8, 8, 18, -28, 120,
];

export function createInitialBoard() {
  const board = Array(BOARD_SIZE * BOARD_SIZE).fill(EMPTY);
  board[indexOf(3, 3)] = WHITE;
  board[indexOf(3, 4)] = BLACK;
  board[indexOf(4, 3)] = BLACK;
  board[indexOf(4, 4)] = WHITE;
  return board;
}

export function opponent(player) {
  return player === BLACK ? WHITE : BLACK;
}

export function indexOf(row, column) {
  return row * BOARD_SIZE + column;
}

export function getFlips(board, index, player) {
  if (board[index] !== EMPTY) return [];

  const row = Math.floor(index / BOARD_SIZE);
  const column = index % BOARD_SIZE;
  const rival = opponent(player);
  const allFlips = [];

  for (const [rowStep, columnStep] of DIRECTIONS) {
    const line = [];
    let nextRow = row + rowStep;
    let nextColumn = column + columnStep;

    while (
      nextRow >= 0 &&
      nextRow < BOARD_SIZE &&
      nextColumn >= 0 &&
      nextColumn < BOARD_SIZE &&
      board[indexOf(nextRow, nextColumn)] === rival
    ) {
      line.push(indexOf(nextRow, nextColumn));
      nextRow += rowStep;
      nextColumn += columnStep;
    }

    const reachedOwnStone =
      nextRow >= 0 &&
      nextRow < BOARD_SIZE &&
      nextColumn >= 0 &&
      nextColumn < BOARD_SIZE &&
      board[indexOf(nextRow, nextColumn)] === player;

    if (line.length > 0 && reachedOwnStone) {
      allFlips.push(...line);
    }
  }

  return allFlips;
}

export function getValidMoves(board, player) {
  const moves = new Map();

  for (let index = 0; index < board.length; index += 1) {
    const flips = getFlips(board, index, player);
    if (flips.length > 0) moves.set(index, flips);
  }

  return moves;
}

export function applyMove(board, index, player) {
  const flips = getFlips(board, index, player);
  if (flips.length === 0) return null;

  const nextBoard = [...board];
  nextBoard[index] = player;
  for (const flippedIndex of flips) nextBoard[flippedIndex] = player;
  return nextBoard;
}

export function countStones(board) {
  return board.reduce(
    (counts, cell) => {
      if (cell === BLACK) counts.black += 1;
      if (cell === WHITE) counts.white += 1;
      return counts;
    },
    { black: 0, white: 0 },
  );
}

export function isGameOver(board) {
  return (
    getValidMoves(board, BLACK).size === 0 &&
    getValidMoves(board, WHITE).size === 0
  );
}

function evaluateBoard(board, perspective) {
  const rival = opponent(perspective);
  const counts = countStones(board);
  const perspectiveCount = perspective === BLACK ? counts.black : counts.white;
  const rivalCount = perspective === BLACK ? counts.white : counts.black;
  const emptyCount = board.filter((cell) => cell === EMPTY).length;
  const stoneWeight = emptyCount <= 16 ? 4 : 0.45;
  let positionScore = 0;

  board.forEach((cell, index) => {
    if (cell === perspective) positionScore += POSITION_WEIGHTS[index];
    if (cell === rival) positionScore -= POSITION_WEIGHTS[index];
  });

  const mobility =
    getValidMoves(board, perspective).size - getValidMoves(board, rival).size;

  return (
    positionScore +
    mobility * 4.2 +
    (perspectiveCount - rivalCount) * stoneWeight
  );
}

function searchBestScore(board, player, perspective, depth, alpha, beta) {
  if (depth <= 0 || isGameOver(board)) {
    return evaluateBoard(board, perspective);
  }

  const moves = getValidMoves(board, player);
  const rival = opponent(player);

  if (moves.size === 0) {
    return searchBestScore(board, rival, perspective, depth - 1, alpha, beta);
  }

  if (player === perspective) {
    let best = Number.NEGATIVE_INFINITY;
    for (const index of moves.keys()) {
      const nextBoard = applyMove(board, index, player);
      best = Math.max(
        best,
        searchBestScore(nextBoard, rival, perspective, depth - 1, alpha, beta),
      );
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }

  let best = Number.POSITIVE_INFINITY;
  for (const index of moves.keys()) {
    const nextBoard = applyMove(board, index, player);
    best = Math.min(
      best,
      searchBestScore(nextBoard, rival, perspective, depth - 1, alpha, beta),
    );
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function chooseNormalMove(board, player, moves) {
  const rival = opponent(player);
  let bestIndex = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const [index, flips] of moves) {
    const nextBoard = applyMove(board, index, player);
    const rivalMobility = getValidMoves(nextBoard, rival).size;
    const ownMobility = getValidMoves(nextBoard, player).size;
    const score =
      POSITION_WEIGHTS[index] +
      flips.length * 2.5 +
      ownMobility * 0.8 -
      rivalMobility * 2.2;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function chooseStrongMove(board, player, moves) {
  const rival = opponent(player);
  const emptyCount = board.filter((cell) => cell === EMPTY).length;
  const depth = emptyCount <= 8 ? emptyCount : emptyCount <= 18 ? 5 : 4;
  let bestIndex = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const index of moves.keys()) {
    const nextBoard = applyMove(board, index, player);
    const score = searchBestScore(
      nextBoard,
      rival,
      player,
      depth - 1,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

export function chooseCpuMove(board, player, difficulty = "normal") {
  const moves = getValidMoves(board, player);
  if (moves.size === 0) return null;

  if (difficulty === "weak") {
    const options = [...moves.keys()];
    return options[Math.floor(Math.random() * options.length)];
  }

  if (difficulty === "strong") {
    return chooseStrongMove(board, player, moves);
  }

  return chooseNormalMove(board, player, moves);
}
