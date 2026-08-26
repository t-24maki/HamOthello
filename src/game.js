import {
  BLACK,
  BOARD_SIZE,
  EMPTY,
  WHITE,
  applyMove,
  chooseCpuMove,
  countStones,
  createInitialBoard,
  getValidMoves,
  isGameOver,
  opponent,
} from "./game-logic.js";

const boardElement = document.querySelector("#board");
const turnStatusElement = document.querySelector("#turn-status");
const modeLabelElement = document.querySelector("#mode-label");
const gameHintElement = document.querySelector("#game-hint");
const moveCounterElement = document.querySelector("#move-counter");
const blackScoreElement = document.querySelector("#black-score");
const whiteScoreElement = document.querySelector("#white-score");
const blackScoreCard = document.querySelector("#black-score-card");
const whiteScoreCard = document.querySelector("#white-score-card");
const blackNameElement = document.querySelector("#black-name");
const whiteNameElement = document.querySelector("#white-name");
const undoButton = document.querySelector("#undo");
const newGameButton = document.querySelector("#new-game");
const modeButtons = document.querySelectorAll(".mode-button");

let board = createInitialBoard();
let currentPlayer = BLACK;
let gameMode = "cpu";
let history = [];
let lastMove = null;
let passNotice = "";
let cpuTimer = null;
let cpuIsThinking = false;

function playerName(player) {
  if (gameMode === "cpu") return player === BLACK ? "あなた" : "CPU";
  return player === BLACK ? "ピンク" : "クリーム";
}

function stoneName(player) {
  return player === BLACK ? "ピンクの子" : "クリームの子";
}

function canHumanPlay() {
  return !cpuIsThinking && (gameMode === "local" || currentPlayer === BLACK);
}

function snapshot() {
  return {
    board: [...board],
    currentPlayer,
    lastMove,
    passNotice,
  };
}

function restore(state) {
  board = [...state.board];
  currentPlayer = state.currentPlayer;
  lastMove = state.lastMove;
  passNotice = state.passNotice;
}

function resetGame() {
  cancelCpuTurn();
  board = createInitialBoard();
  currentPlayer = BLACK;
  history = [];
  lastMove = null;
  passNotice = "";
  render();
}

function cancelCpuTurn() {
  if (cpuTimer !== null) window.clearTimeout(cpuTimer);
  cpuTimer = null;
  cpuIsThinking = false;
}

function moveTo(index) {
  if (!canHumanPlay()) return;

  const validMoves = getValidMoves(board, currentPlayer);
  if (!validMoves.has(index)) return;
  commitMove(index);
}

function commitMove(index) {
  const nextBoard = applyMove(board, index, currentPlayer);
  if (!nextBoard) return;

  history.push(snapshot());
  board = nextBoard;
  lastMove = index;
  passNotice = "";

  const nextPlayer = opponent(currentPlayer);
  const nextMoves = getValidMoves(board, nextPlayer);

  if (nextMoves.size > 0) {
    currentPlayer = nextPlayer;
  } else if (getValidMoves(board, currentPlayer).size > 0) {
    passNotice = `${playerName(nextPlayer)}は置ける場所がないためパスしました`;
  }

  render();

  if (!isGameOver(board) && gameMode === "cpu" && currentPlayer === WHITE) {
    scheduleCpuTurn();
  }
}

function scheduleCpuTurn() {
  cpuIsThinking = true;
  render();

  cpuTimer = window.setTimeout(() => {
    cpuTimer = null;
    cpuIsThinking = false;
    const move = chooseCpuMove(board, WHITE);
    if (move !== null) commitMove(move);
  }, 520);
}

function undo() {
  if (history.length === 0) return;

  cancelCpuTurn();
  let previous = history.pop();

  while (
    gameMode === "cpu" &&
    previous.currentPlayer !== BLACK &&
    history.length > 0
  ) {
    previous = history.pop();
  }

  restore(previous);
  render();
}

function getStatusCopy() {
  const counts = countStones(board);

  if (isGameOver(board)) {
    if (counts.black === counts.white) {
      return { title: "なかよく引き分け！", hint: "ぴったり同じ数になったよ。もういっかい？" };
    }

    const winner = counts.black > counts.white ? BLACK : WHITE;
    const winnerName = playerName(winner);
    return {
      title: `${winnerName}のかち！`,
      hint: `${Math.max(counts.black, counts.white)} 対 ${Math.min(counts.black, counts.white)} でおしまい`,
    };
  }

  if (cpuIsThinking) {
    return { title: "CPUが うーん…", hint: "どこに置こうか考え中だよ" };
  }

  return {
    title:
      gameMode === "cpu" && currentPlayer === BLACK
        ? "あなたの番だよ"
        : `${playerName(currentPlayer)}の番だよ`,
    hint: passNotice || "丸のあるマスに、ぽちっと置いてね",
  };
}

function renderBoard() {
  const validMoves = getValidMoves(board, currentPlayer);
  const showMoves = canHumanPlay() && !isGameOver(board);
  const fragment = document.createDocumentFragment();

  board.forEach((cell, index) => {
    const row = Math.floor(index / BOARD_SIZE);
    const column = index % BOARD_SIZE;
    const button = document.createElement("button");
    const isValid = showMoves && validMoves.has(index);
    button.type = "button";
    button.className = "cell";
    button.dataset.index = String(index);
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-rowindex", String(row + 1));
    button.setAttribute("aria-colindex", String(column + 1));
    button.setAttribute("aria-label", `${row + 1}行${column + 1}列${isValid ? "、置けます" : ""}`);
    button.disabled = !isValid;

    if (isValid) button.classList.add("is-valid");
    if (index === lastMove) button.classList.add("is-last");

    if (cell !== EMPTY) {
      const disc = document.createElement("span");
      disc.className = `disc disc--${cell === BLACK ? "black" : "white"}`;
      disc.setAttribute("aria-hidden", "true");
      button.append(disc);
      button.setAttribute("aria-label", `${row + 1}行${column + 1}列、${stoneName(cell)}の石`);
    }

    button.addEventListener("click", () => moveTo(index));
    fragment.append(button);
  });

  boardElement.replaceChildren(fragment);
}

function render() {
  const counts = countStones(board);
  const status = getStatusCopy();
  const ended = isGameOver(board);

  renderBoard();
  blackScoreElement.textContent = String(counts.black);
  whiteScoreElement.textContent = String(counts.white);
  moveCounterElement.textContent = `${counts.black + counts.white} / 64 こま`;
  turnStatusElement.textContent = status.title;
  gameHintElement.textContent = status.hint;
  modeLabelElement.textContent = gameMode === "cpu" ? "あなた VS CPU" : "ピンク VS クリーム";
  blackNameElement.textContent = gameMode === "cpu" ? "あなた" : "ピンク";
  whiteNameElement.textContent = gameMode === "cpu" ? "CPU" : "クリーム";
  undoButton.disabled = history.length === 0;

  blackScoreCard.classList.toggle("is-current", !ended && currentPlayer === BLACK);
  whiteScoreCard.classList.toggle("is-current", !ended && currentPlayer === WHITE);
}

function handleBoardKeys(event) {
  const activeCell = event.target.closest(".cell");
  if (!activeCell) return;

  const directions = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -BOARD_SIZE,
    ArrowDown: BOARD_SIZE,
  };
  const offset = directions[event.key];
  if (!offset) return;

  const currentIndex = Number(activeCell.dataset.index);
  const nextIndex = currentIndex + offset;
  const crossesRow =
    (event.key === "ArrowLeft" && currentIndex % BOARD_SIZE === 0) ||
    (event.key === "ArrowRight" && currentIndex % BOARD_SIZE === BOARD_SIZE - 1);

  if (nextIndex < 0 || nextIndex >= BOARD_SIZE * BOARD_SIZE || crossesRow) return;
  event.preventDefault();
  boardElement.querySelector(`[data-index="${nextIndex}"]`)?.focus();
}

newGameButton.addEventListener("click", resetGame);
undoButton.addEventListener("click", undo);
boardElement.addEventListener("keydown", handleBoardKeys);

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextMode = button.dataset.mode;
    if (nextMode === gameMode) return;

    gameMode = nextMode;
    modeButtons.forEach((item) => {
      const isActive = item.dataset.mode === gameMode;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-pressed", String(isActive));
    });
    resetGame();
  });
});

modeButtons.forEach((button) => {
  button.setAttribute("aria-pressed", String(button.dataset.mode === gameMode));
});

render();
