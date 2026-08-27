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
import {
  createOnlineSession,
  generateRoomCode,
  isOnlineConfigured,
  normalizeRoomCode,
} from "./online-game.js";
import { getResultCharacterImages } from "./result-images.js";

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
const statusTakuImage = document.querySelector("#status-taku-image");
const statusMeguImage = document.querySelector("#status-megu-image");
const blackScoreImage = document.querySelector("#black-score-image");
const whiteScoreImage = document.querySelector("#white-score-image");
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
const hamsterSetup = document.querySelector("#hamster-setup");
const hamsterOptions = document.querySelectorAll(".hamster-option");
const difficultyOptions = document.querySelectorAll(".difficulty-option");
const cpuOnlySections = document.querySelectorAll(".cpu-only");
const localSetup = document.querySelector("#local-setup");
const onlineSetup = document.querySelector("#online-setup");
const onlineActionButtons = document.querySelectorAll(".online-action-option");
const onlineJoinFields = document.querySelector("#online-join-fields");
const roomCodeInput = document.querySelector("#room-code-input");
const onlineRoomCard = document.querySelector("#online-room-card");
const roomCodeDisplay = document.querySelector("#room-code-display");
const copyRoomCodeButton = document.querySelector("#copy-room-code");
const onlineStatusElement = document.querySelector("#online-status");

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
let onlineAction = "create";
let onlineRole = null;
let onlineRoomCode = "";
let onlineSession = null;
let onlineConnecting = false;
let onlinePeerConnected = false;
let onlineRevision = 0;
let onlineAttemptId = 0;

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
  if (!gameStarted || cpuIsThinking) return false;
  if (gameMode === "local") return true;
  if (gameMode === "online") {
    return onlinePeerConnected && currentPlayer === humanPlayer;
  }
  return currentPlayer === humanPlayer;
}

function canUndo() {
  if (!gameStarted || gameMode === "online") return false;
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
  onlineRevision = 0;
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

function startOnlineGame(localPlayer) {
  resetBoard();
  humanPlayer = localPlayer;
  onlineConnecting = false;
  onlinePeerConnected = true;
  gameStarted = true;
  setupOverlay.hidden = true;
  document.body.classList.remove("is-setting-up");
  render();

  window.setTimeout(() => {
    if (onlineRole === "host") sendOnlineState();
    else void onlineSession?.send({ type: "state-request" });
  }, 0);
}

function setOnlineStatus(message = "", tone = "") {
  onlineStatusElement.textContent = message;
  onlineStatusElement.classList.toggle("is-error", tone === "error");
  onlineStatusElement.classList.toggle("is-success", tone === "success");
}

function closeOnlineSession({ clearRoom = true } = {}) {
  onlineAttemptId += 1;
  const session = onlineSession;
  onlineSession = null;
  onlineConnecting = false;
  onlinePeerConnected = false;
  onlineRole = null;
  if (clearRoom) {
    onlineRoomCode = "";
    onlineRoomCard.hidden = true;
  }
  if (session) void session.close();
}

function showLanding() {
  closeOnlineSession();
  resetBoard();
  gameStarted = false;
  setupOverlay.hidden = true;
  gameScreen.hidden = true;
  landingScreen.hidden = false;
  document.body.classList.remove("is-setting-up");
  setOnlineStatus();
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
  closeOnlineSession();
  cancelCpuTurn();
  gameStarted = false;
  setupOverlay.hidden = false;
  document.body.classList.add("is-setting-up");
  setOnlineStatus();
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
  if (!getValidMoves(board, currentPlayer).has(index)) return;
  commitMove(index);
}

function commitMove(index, { broadcast = true } = {}) {
  const movingPlayer = currentPlayer;
  const nextBoard = applyMove(board, index, movingPlayer);
  if (!nextBoard) return false;

  history.push(snapshot());
  board = nextBoard;
  lastMove = index;
  passNotice = "";

  const nextPlayer = opponent(movingPlayer);
  const nextMoves = getValidMoves(board, nextPlayer);

  if (nextMoves.size > 0) {
    currentPlayer = nextPlayer;
  } else if (getValidMoves(board, movingPlayer).size > 0) {
    currentPlayer = movingPlayer;
    passNotice = `${hamsterName(nextPlayer)}は置ける場所がないから、おやすみだよ`;
  }

  if (gameMode === "online") onlineRevision += 1;
  render();

  if (gameMode === "online" && broadcast) {
    void onlineSession?.send({
      type: "move",
      index,
      player: movingPlayer,
      revision: onlineRevision,
    });
  }

  if (
    !isGameOver(board) &&
    gameMode === "cpu" &&
    currentPlayer === getCpuPlayer()
  ) {
    scheduleCpuTurn();
  }
  return true;
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
    return { title: "ゲームをえらんでね", hint: "あそびかたを決めよう" };
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

  if (gameMode === "online" && !onlinePeerConnected) {
    return {
      title: "相手との通信を待っているよ",
      hint: "つながるまで、そのまま少し待ってね",
    };
  }

  if (cpuIsThinking) {
    return {
      title: `${hamsterName(getCpuPlayer())}（CPU）が うーん…`,
      hint: `CPUのつよさ：${DIFFICULTY_LABELS[cpuDifficulty]}`,
    };
  }

  const turnName = hamsterName(currentPlayer);
  let title = `${turnName}の番だよ`;
  if (gameMode === "cpu") {
    title = `${turnName}（${currentPlayer === humanPlayer ? "あなた" : "CPU"}）の番だよ`;
  } else if (gameMode === "online") {
    title = `${turnName}（${currentPlayer === humanPlayer ? "あなた" : "相手"}）の番だよ`;
  }

  return {
    title,
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

function playerSuffix(player) {
  if (gameMode === "cpu") return player === humanPlayer ? "あなた" : "CPU";
  if (gameMode === "online") return player === humanPlayer ? "あなた" : "相手";
  return "";
}

function setImageSource(image, source) {
  if (image.getAttribute("src") !== source) image.src = source;
}

function renderCharacterImages(counts, ended) {
  const images = getResultCharacterImages(counts, ended);

  setImageSource(statusTakuImage, images.black);
  setImageSource(blackScoreImage, images.black);
  setImageSource(statusMeguImage, images.white);
  setImageSource(whiteScoreImage, images.white);
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
  renderCharacterImages(counts, ended);

  if (gameMode === "cpu") {
    modeLabelElement.textContent = `${hamsterName(humanPlayer)}で CPU対戦`;
    gameSettingsLabelElement.textContent = `CPU：${DIFFICULTY_LABELS[cpuDifficulty]}`;
  } else if (gameMode === "online") {
    modeLabelElement.textContent = `${hamsterName(humanPlayer)}で 通信対戦`;
    gameSettingsLabelElement.textContent = `へや：${onlineRoomCode || "接続前"}`;
  } else {
    modeLabelElement.textContent = "たくハム VS めぐハム";
    gameSettingsLabelElement.textContent = "ふたりで対戦";
  }

  const blackSuffix = playerSuffix(BLACK);
  const whiteSuffix = playerSuffix(WHITE);
  blackNameElement.textContent = `たくハム${blackSuffix ? `（${blackSuffix}）` : ""}`;
  whiteNameElement.textContent = `めぐハム${whiteSuffix ? `（${whiteSuffix}）` : ""}`;
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
    button.disabled = onlineConnecting;
  });

  hamsterOptions.forEach((button) => {
    const isSelected = Number(button.dataset.player) === humanPlayer;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
    button.disabled = onlineConnecting;
  });

  difficultyOptions.forEach((button) => {
    const isSelected = button.dataset.difficulty === cpuDifficulty;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });

  onlineActionButtons.forEach((button) => {
    const isSelected = button.dataset.onlineAction === onlineAction;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
    button.disabled = onlineConnecting;
  });

  cpuOnlySections.forEach((section) => {
    section.hidden = gameMode !== "cpu";
  });
  hamsterSetup.hidden = !(
    gameMode === "cpu" || (gameMode === "online" && onlineAction === "create")
  );
  localSetup.hidden = gameMode !== "local";
  onlineSetup.hidden = gameMode !== "online";
  onlineJoinFields.hidden = !(gameMode === "online" && onlineAction === "join");

  if (gameMode === "cpu") {
    setupDescription.textContent = "ハムとCPUのつよさを選んだら、対局スタート！";
    setupStartLabel.textContent = "この設定ではじめる";
  } else if (gameMode === "local") {
    setupDescription.textContent = "たくハムとめぐハムを、ふたりで交代しながら動かそう。";
    setupStartLabel.textContent = "ふたりではじめる";
  } else {
    setupDescription.textContent = "キーワードを合言葉にして、はなれた相手と遊べるよ。";
    setupStartLabel.textContent = onlineConnecting
      ? onlineRole === "host"
        ? "相手を待っています…"
        : "へやを探しています…"
      : onlineAction === "create"
        ? "へやをつくる"
        : "へやにはいる";
  }
  setupStartButton.disabled = gameMode === "online" && onlineConnecting;
}

function chooseMode(nextMode) {
  if (!["cpu", "local", "online"].includes(nextMode)) return;
  closeOnlineSession();
  gameMode = nextMode;
  setOnlineStatus();
  syncControls();
}

function chooseOnlineAction(nextAction) {
  if (!["create", "join"].includes(nextAction)) return;
  closeOnlineSession();
  onlineAction = nextAction;
  setOnlineStatus();
  syncControls();
  if (nextAction === "join") roomCodeInput.focus();
}

function validSyncedBoard(candidate) {
  return (
    Array.isArray(candidate) &&
    candidate.length === BOARD_SIZE * BOARD_SIZE &&
    candidate.every((cell) => cell === EMPTY || cell === BLACK || cell === WHITE)
  );
}

function sendOnlineState() {
  if (!onlineSession || onlineRole !== "host") return;
  void onlineSession.send({
    type: "state",
    board: [...board],
    currentPlayer,
    lastMove,
    passNotice,
    revision: onlineRevision,
  });
}

function requestOnlineState() {
  if (onlineRole === "guest") {
    void onlineSession?.send({ type: "state-request" });
  } else {
    sendOnlineState();
  }
}

function handleOnlineMessage(message) {
  if (!gameStarted) return;

  if (message.type === "state-request") {
    sendOnlineState();
    return;
  }

  if (message.type === "state") {
    if (
      onlineRole !== "guest" ||
      !validSyncedBoard(message.board) ||
      ![BLACK, WHITE].includes(message.currentPlayer) ||
      !Number.isInteger(message.revision) ||
      message.revision < onlineRevision
    ) {
      return;
    }
    board = [...message.board];
    currentPlayer = message.currentPlayer;
    lastMove = Number.isInteger(message.lastMove) ? message.lastMove : null;
    passNotice = typeof message.passNotice === "string" ? message.passNotice : "";
    onlineRevision = message.revision;
    history = [];
    render();
    return;
  }

  if (message.type !== "move") return;
  const isExpectedMove =
    Number.isInteger(message.index) &&
    message.index >= 0 &&
    message.index < BOARD_SIZE * BOARD_SIZE &&
    message.player === currentPlayer &&
    message.player === opponent(humanPlayer) &&
    message.revision === onlineRevision + 1 &&
    getValidMoves(board, currentPlayer).has(message.index);

  if (!isExpectedMove) {
    requestOnlineState();
    return;
  }

  if (commitMove(message.index, { broadcast: false }) && onlineRole === "host") {
    sendOnlineState();
  }
}

function handleOnlineError(error, attemptId) {
  if (attemptId !== onlineAttemptId) return;
  onlineConnecting = false;
  onlinePeerConnected = false;
  gameStarted = false;
  setupOverlay.hidden = false;
  document.body.classList.add("is-setting-up");
  setOnlineStatus(error?.message || "通信でエラーが起きました。もう一度試してね。", "error");
  syncControls();
  render();
}

async function startOnlineFlow() {
  if (!isOnlineConfigured()) {
    setOnlineStatus("通信対戦の準備がまだです。supabase-config.jsを設定してね。", "error");
    return;
  }

  closeOnlineSession();
  const attemptId = onlineAttemptId;
  onlineRole = onlineAction === "create" ? "host" : "guest";
  onlineRoomCode =
    onlineRole === "host"
      ? generateRoomCode()
      : normalizeRoomCode(roomCodeInput.value);

  if (!/^HAMU-[A-Z2-9]{6}$/.test(onlineRoomCode)) {
    setOnlineStatus("キーワードを確認してね。例：HAMU-ABC234", "error");
    onlineRole = null;
    onlineRoomCode = "";
    return;
  }

  onlineConnecting = true;
  onlinePeerConnected = false;
  roomCodeDisplay.textContent = onlineRoomCode;
  onlineRoomCard.hidden = onlineRole !== "host";
  setOnlineStatus(
    onlineRole === "host"
      ? "へやをつくっています…"
      : "キーワードのへやを探しています…",
  );
  syncControls();

  try {
    const session = await createOnlineSession({
      role: onlineRole,
      roomCode: onlineRoomCode,
      hostPlayer: humanPlayer,
      onReady: ({ localPlayer }) => {
        window.setTimeout(() => {
          if (attemptId !== onlineAttemptId) return;
          setOnlineStatus("ふたりがそろったよ。対局スタート！", "success");
          startOnlineGame(localPlayer);
        }, 0);
      },
      onMessage: (message) => handleOnlineMessage(message),
      onPeerChange: (connected) => {
        window.setTimeout(() => {
          if (attemptId !== onlineAttemptId) return;
          onlinePeerConnected = connected;
          if (connected && gameStarted) requestOnlineState();
          if (gameStarted) render();
        }, 0);
      },
      onError: (error) => {
        window.setTimeout(() => handleOnlineError(error, attemptId), 0);
      },
    });

    if (attemptId !== onlineAttemptId) {
      void session.close();
      return;
    }
    onlineSession = session;
    setOnlineStatus(
      onlineRole === "host"
        ? "キーワードを相手に送って、ここで待ってね。"
        : "へやが見つかるまで、少し待ってね。",
    );
  } catch (error) {
    handleOnlineError(error, attemptId);
  }
}

function handleSetupStart() {
  if (gameMode === "online") {
    void startOnlineFlow();
  } else {
    startGame();
  }
}

async function copyRoomCode() {
  if (!onlineRoomCode) return;
  try {
    await navigator.clipboard.writeText(onlineRoomCode);
  } catch {
    const helper = document.createElement("textarea");
    helper.value = onlineRoomCode;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.append(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }
  copyRoomCodeButton.textContent = "コピーしたよ";
  window.setTimeout(() => {
    copyRoomCodeButton.textContent = "コピー";
  }, 1600);
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
setupStartButton.addEventListener("click", handleSetupStart);
landingPlayButton.addEventListener("click", showGameSetup);
backHomeButton.addEventListener("click", showLanding);
setupCloseButton.addEventListener("click", showLanding);
copyRoomCodeButton.addEventListener("click", () => void copyRoomCode());
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

onlineActionButtons.forEach((button) => {
  button.addEventListener("click", () => chooseOnlineAction(button.dataset.onlineAction));
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

roomCodeInput.addEventListener("input", () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  setOnlineStatus();
});

roomCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") handleSetupStart();
});

window.addEventListener("pagehide", () => {
  if (onlineSession) void onlineSession.close();
});

syncControls();
render();
showLanding();
