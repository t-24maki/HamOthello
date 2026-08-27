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
const gameSettingsLabelElement = document.querySelector("#game-settings-label");
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
const brandHome = document.querySelector("#brand-home");
const landingScreen = document.querySelector("#landing-screen");
const landingPlayButton = document.querySelector("#landing-play");
const gameScreen = document.querySelector("#game-screen");
const backHomeButton = document.querySelector("#back-home");
const setupOverlay = document.querySelector("#setup-overlay");
const setupCloseButton = document.querySelector("#setup-close");
const setupStartButton = document.querySelector("#setup-start");
const setupStartLabel = document.querySelector("#setup-start-label");
const setupDescription = document.querySelector("#setup-description");
const setupModeButtons = document.querySelectorAll(".setup-mode-option");
const hamsterOptions = document.querySelectorAll(".hamster-option");
const difficultyOptions = document.querySelectorAll(".difficulty-option");
const cpuOnlySections = document.querySelectorAll(".cpu-only");
const localSetup = document.querySelector("#local-setup");

const DIFFICULTY_LABELS = {
  weak: "よわい",
  normal: "ふつう",
  strong: "つよい",
};

const THINK_DELAYS = {
  weak: 350,
  normal: 520,
  strong: 720,
};

let board = createInitialBoard();
let currentPlayer = BLACK;
let gameMode = "cpu";
let humanPlayer = BLACK;
let cpuDifficulty = "normal";
let history = [];
let lastMove = null;
let passNotice = "";
let cpuTimer = null;
let cpuIsThinking = false;
let gameStarted = false;

function hamsterName(player) {
  return player === BLACK ? "たくハム" : "めぐハム";
}

function stoneName(player) {
  return `${hamsterName(player)}（${player === BLACK ? "黒" : "白"}番）`;
}

function getCpuPlayer() {
  return opponent(humanPlayer);
}

function canHumanPlay() {
  return (
    gameStarted &&
    !cpuIsThinking &&
    (gameMode === "local" || currentPlayer === humanPlayer)
  );
}

function canUndo() {
  if (!gameStarted) return false;
  if (gameMode === "local") return history.length > 0;
  return history.some((state) => state.currentPlayer === humanPlayer);
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

function resetBoard() {
  cancelCpuTurn();
  board = createInitialBoard();
  currentPlayer = BLACK;
  history = [];
  lastMove = null;
  passNotice = "";
}

function startGame() {
  resetBoard();
  gameStarted = true;
  setupOverlay.hidden = true;
  document.body.classList.remove("is-setting-up");
  render();

  if (gameMode === "cpu" && currentPlayer === getCpuPlayer()) {
    scheduleCpuTurn();
  }
}

function showLanding() {
  resetBoard();
  gameStarted = false;
  setupOverlay.hidden = true;
  gameScreen.hidden = true;
  landingScreen.hidden = false;
  document.body.classList.remove("is-setting-up");
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showGameSetup() {
  landingScreen.hidden = true;
  gameScreen.hidden = false;
  openSetup();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openSetup() {
  cancelCpuTurn();
  gameStarted = false;
  setupOverlay.hidden = false;
  document.body.classList.add("is-setting-up");
  syncControls();
  render();

  window.setTimeout(() => {
    setupOverlay.querySelector("button.is-selected")?.focus();
  }, 0);
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
    passNotice = `${hamsterName(nextPlayer)}は置ける場所がないから、おやすみだよ`;
  }

  render();

  if (
    !isGameOver(board) &&
    gameMode === "cpu" &&
    currentPlayer === getCpuPlayer()
  ) {
    scheduleCpuTurn();
  }
}

function scheduleCpuTurn() {
  if (!gameStarted || gameMode !== "cpu") return;

  cpuIsThinking = true;
  render();

  cpuTimer = window.setTimeout(() => {
    cpuTimer = null;
    cpuIsThinking = false;
    const cpuPlayer = getCpuPlayer();
    const move = chooseCpuMove(board, cpuPlayer, cpuDifficulty);
    if (move !== null) commitMove(move);
  }, THINK_DELAYS[cpuDifficulty]);
}

function undo() {
  if (!canUndo()) return;

  cancelCpuTurn();
  let previous = history.pop();

  while (
    gameMode === "cpu" &&
    previous.currentPlayer !== humanPlayer &&
    history.length > 0
  ) {
    previous = history.pop();
  }

  restore(previous);
  render();
}

function getStatusCopy() {
  if (!gameStarted) {
    return { title: "ゲームをえらんでね", hint: "ハムとCPUのつよさを決めよう" };
  }

  const counts = countStones(board);

  if (isGameOver(board)) {
    if (counts.black === counts.white) {
      return { title: "なかよく引き分け！", hint: "ぴったり同じ数になったよ。もういっかい？" };
    }

    const winner = counts.black > counts.white ? BLACK : WHITE;
    return {
      title: `${hamsterName(winner)}のかち！`,
      hint: `${Math.max(counts.black, counts.white)} 対 ${Math.min(counts.black, counts.white)} でおしまい`,
    };
  }

  if (cpuIsThinking) {
    return {
      title: `${hamsterName(getCpuPlayer())}（CPU）が うーん…`,
      hint: `CPUのつよさ：${DIFFICULTY_LABELS[cpuDifficulty]}`,
    };
  }

  const turnName = hamsterName(currentPlayer);
  return {
    title:
      gameMode === "cpu"
        ? `${turnName}（${currentPlayer === humanPlayer ? "あなた" : "CPU"}）の番だよ`
        : `${turnName}の番だよ`,
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
      button.setAttribute("aria-label", `${row + 1}行${column + 1}列、${stoneName(cell)}`);
    }

    button.addEventListener("click", () => moveTo(index));
    fragment.append(button);
  });

  boardElement.replaceChildren(fragment);
}

function render() {
  const counts = countStones(board);
  const status = getStatusCopy();
  const ended = gameStarted && isGameOver(board);

  renderBoard();
  blackScoreElement.textContent = String(counts.black);
  whiteScoreElement.textContent = String(counts.white);
  moveCounterElement.textContent = `${counts.black + counts.white} / 64 こま`;
  turnStatusElement.textContent = status.title;
  gameHintElement.textContent = status.hint;
  modeLabelElement.textContent =
    gameMode === "cpu"
      ? `${hamsterName(humanPlayer)}で CPU対戦`
      : "たくハム VS めぐハム";
  gameSettingsLabelElement.textContent =
    gameMode === "cpu"
      ? `CPU：${DIFFICULTY_LABELS[cpuDifficulty]}`
      : "ふたりで対戦";
  blackNameElement.textContent =
    gameMode === "cpu"
      ? `たくハム（${humanPlayer === BLACK ? "あなた" : "CPU"}）`
      : "たくハム";
  whiteNameElement.textContent =
    gameMode === "cpu"
      ? `めぐハム（${humanPlayer === WHITE ? "あなた" : "CPU"}）`
      : "めぐハム";
  undoButton.disabled = !canUndo();

  blackScoreCard.classList.toggle("is-current", !ended && currentPlayer === BLACK);
  whiteScoreCard.classList.toggle("is-current", !ended && currentPlayer === WHITE);
}

function syncControls() {
  modeButtons.forEach((button) => {
    const isActive = button.dataset.mode === gameMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  setupModeButtons.forEach((button) => {
    const isSelected = button.dataset.setupMode === gameMode;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });

  hamsterOptions.forEach((button) => {
    const isSelected = Number(button.dataset.player) === humanPlayer;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });

  difficultyOptions.forEach((button) => {
    const isSelected = button.dataset.difficulty === cpuDifficulty;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });

  cpuOnlySections.forEach((section) => {
    section.hidden = gameMode !== "cpu";
  });
  localSetup.hidden = gameMode === "cpu";
  setupDescription.textContent =
    gameMode === "cpu"
      ? "ハムとCPUのつよさを選んだら、対局スタート！"
      : "たくハムとめぐハムを、ふたりで交代しながら動かそう。";
  setupStartLabel.textContent =
    gameMode === "cpu" ? "この設定ではじめる" : "ふたりではじめる";
}

function chooseMode(nextMode) {
  if (nextMode !== "cpu" && nextMode !== "local") return;
  gameMode = nextMode;
  syncControls();
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

newGameButton.addEventListener("click", openSetup);
undoButton.addEventListener("click", undo);
setupStartButton.addEventListener("click", startGame);
landingPlayButton.addEventListener("click", showGameSetup);
backHomeButton.addEventListener("click", showLanding);
setupCloseButton.addEventListener("click", showLanding);
boardElement.addEventListener("keydown", handleBoardKeys);

brandHome.addEventListener("click", (event) => {
  event.preventDefault();
  showLanding();
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    chooseMode(button.dataset.mode);
    openSetup();
  });
});

setupModeButtons.forEach((button) => {
  button.addEventListener("click", () => chooseMode(button.dataset.setupMode));
});

hamsterOptions.forEach((button) => {
  button.addEventListener("click", () => {
    humanPlayer = Number(button.dataset.player);
    syncControls();
    render();
  });
});

difficultyOptions.forEach((button) => {
  button.addEventListener("click", () => {
    cpuDifficulty = button.dataset.difficulty;
    syncControls();
    render();
  });
});

syncControls();
render();
showLanding();
