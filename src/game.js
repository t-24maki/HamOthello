import {
  BLACK,
  BOARD_SIZE,
  EMPTY,
  WHITE,
  countStones,
  createInitialBoard,
  getValidMoves,
  opponent,
} from "./game-logic.js?v=cards-20260908-r2";
import {
  CARDS,
  RULE_LABELS,
  ONLINE_VERSION,
  createHands,
  copyHands,
  getActionTargets,
  isMatchOver,
  applyAction,
  chooseCpuAction,
  parseOnlineState,
} from "./card-rules.js?v=cards-20260908-r2";
import {
  createOnlineSession,
  generateRoomCode,
  isOnlineConfigured,
  normalizeRoomCode,
} from "./online-game.js?v=cards-20260908-r2";
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
const ruleButtons = document.querySelectorAll("[data-rule]");
const ruleSetup = document.querySelector("#rule-setup");
const setupCardGuide = document.querySelector("#setup-card-guide");
const joinRuleNote = document.querySelector("#join-rule-note");
const cardPanel = document.querySelector("#card-panel");
const cardPanelTitle = document.querySelector("#card-panel-title");
const cardButtons = document.querySelectorAll("[data-card]");
const cancelCardButton = document.querySelector("#cancel-card");
const cardInstruction = document.querySelector("#card-instruction");
const lastCardElement = document.querySelector("#last-card-action");
const cardRulesDetails = document.querySelector("#card-rules-details");

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
let ruleMode = "classic";
let hands = createHands(ruleMode);
let turnCount = 0;
let selectedCard = null;
let lastCardAction = null;
let lastRenderedCardKey = null;
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
let onlineSynced = false;
let onlinePending = false;
let onlinePendingTimer = null;

function matchState() {
  return { board, currentPlayer, ruleMode, hands, turnCount };
}
function gameOver() {
  return isMatchOver(matchState());
}

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
  if (!gameStarted || cpuIsThinking || gameOver()) return false;
  if (gameMode === "local") return true;
  if (gameMode === "online") {
    return onlinePeerConnected && onlineSynced && !onlinePending && currentPlayer === humanPlayer;
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
    ruleMode,
    hands: copyHands(hands),
    turnCount,
    lastCardAction: lastCardAction ? { ...lastCardAction } : null,
  };
}

function restore(state) {
  board = [...state.board];
  currentPlayer = state.currentPlayer;
  lastMove = state.lastMove;
  passNotice = state.passNotice;
  ruleMode = state.ruleMode;
  hands = copyHands(state.hands);
  turnCount = state.turnCount;
  lastCardAction = state.lastCardAction;
  selectedCard = null;
}

function resetBoard() {
  cancelCpuTurn();
  board = createInitialBoard();
  currentPlayer = BLACK;
  history = [];
  lastMove = null;
  passNotice = "";
  onlineRevision = 0;
  hands = createHands(ruleMode);
  turnCount = 0;
  selectedCard = null;
  lastCardAction = null;
  lastRenderedCardKey = null;
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

function startOnlineGame(localPlayer, sessionRules) {
  ruleMode = sessionRules;
  resetBoard();
  humanPlayer = localPlayer;
  onlineConnecting = false;
  onlinePeerConnected = true;
  onlineSynced = onlineRole === "host";
  gameStarted = true;
  setupOverlay.hidden = true;
  document.body.classList.remove("is-setting-up");
  render();

  const attempt = onlineAttemptId;
  window.setTimeout(() => {
    if (attempt === onlineAttemptId && gameStarted) requestOnlineState();
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
  onlineSynced = false;
  clearOnlinePending();
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
  const kind = selectedCard ?? "place";
  if (!getActionTargets(matchState(), kind).has(index)) return;
  if (gameMode === "online" && onlineRole === "guest") {
    sendOnlineAction({ kind, index });
    return;
  }
  commitMove(index, { kind });
}

function commitMove(index, { broadcast = true, kind = "place" } = {}) {
  const movingPlayer = currentPlayer;
  const next = applyAction(matchState(), { kind, index });
  if (!next) return false;

  history.push(snapshot());
  board = next.board;
  hands = next.hands;
  currentPlayer = next.currentPlayer;
  turnCount = next.turnCount;
  selectedCard = null;
  if (kind !== "place") lastCardAction = { kind, index, player: movingPlayer };
  lastMove = index;
  passNotice = "";

  if (!gameOver() && currentPlayer === movingPlayer)
    passNotice = `${hamsterName(opponent(movingPlayer))}は${ruleMode === "cards" ? "カードでも動けないから" : "置ける場所がないから"}、おやすみだよ`;

  if (gameMode === "online") onlineRevision += 1;

  if (!gameOver() && gameMode === "cpu" && currentPlayer === getCpuPlayer()) {
    scheduleCpuTurn();
  } else render();

  if (gameMode === "online" && broadcast) sendOnlineState();
  return true;
}

function scheduleCpuTurn() {
  if (!gameStarted || gameMode !== "cpu") return;

  cpuIsThinking = true;
  render();

  cpuTimer = window.setTimeout(() => {
    cpuTimer = null;
    cpuIsThinking = false;
    const action = chooseCpuAction(matchState(), cpuDifficulty);
    if (action !== null) commitMove(action.index, { kind: action.kind });
  }, THINK_DELAYS[cpuDifficulty]);
}

function undo() {
  if (!canUndo()) return;

  cancelCpuTurn();
  let previous = history.pop();

  while (gameMode === "cpu" && previous.currentPlayer !== humanPlayer && history.length > 0) {
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

  if (gameOver()) {
    if (counts.black === counts.white) {
      return { title: "なかよく引き分け！", hint: "ぴったり同じ数になったよ。もういっかい？" };
    }

    const winner = counts.black > counts.white ? BLACK : WHITE;
    return {
      title: `${hamsterName(winner)}のかち！`,
      hint: `${Math.max(counts.black, counts.white)} 対 ${Math.min(counts.black, counts.white)} でおしまい`,
    };
  }

  if (gameMode === "online" && (!onlinePeerConnected || !onlineSynced || onlinePending)) {
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

  const hint =
    selectedCard === "anywhere"
      ? "あいている光るマスに、ぽん！ これで1手だよ。"
      : selectedCard === "flip"
        ? "光っている相手のハムを、1こえらんでね。"
        : getValidMoves(board, currentPlayer).size
          ? "丸のあるマスに、ぽちっと置いてね"
          : "いつもの手では置けないよ。カードをえらんでね。";
  return { title, hint: passNotice ? `${passNotice}。${hint}` : hint };
}

function renderBoard() {
  const kind = selectedCard ?? "place";
  const validMoves = getActionTargets(matchState(), kind);
  const showMoves = canHumanPlay();
  boardElement.dataset.action = kind;
  const fragment = document.createDocumentFragment();
  const cardKey = lastCardAction
    ? `${lastCardAction.player}-${lastCardAction.kind}-${lastCardAction.index}`
    : null;
  const revealCard = cardKey !== lastRenderedCardKey;

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
      button.setAttribute(
        "aria-label",
        `${row + 1}行${column + 1}列、${stoneName(cell)}${isValid && kind === "flip" ? "、くるんカードで返せます" : ""}`,
      );
    }

    if (lastCardAction?.index === index) {
      const card = CARDS[lastCardAction.kind];
      button.classList.add("is-card-action");
      const marker = document.createElement("span");
      marker.className = `card-marker card-marker--${lastCardAction.kind}`;
      if (revealCard) marker.classList.add("is-revealing");
      marker.setAttribute("aria-hidden", "true");
      const icon = document.createElement("span");
      icon.className = "card-marker-icon";
      icon.textContent = card.icon;
      marker.append(icon);
      button.append(marker);
      button.setAttribute(
        "aria-label",
        `${button.getAttribute("aria-label")}、最後に${card.name}を使ったマス`,
      );
    }

    button.addEventListener("click", () => moveTo(index));
    fragment.append(button);
  });

  boardElement.replaceChildren(fragment);
  lastRenderedCardKey = cardKey;
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
  const ended = gameStarted && gameOver();

  renderBoard();
  blackScoreElement.textContent = String(counts.black);
  whiteScoreElement.textContent = String(counts.white);
  moveCounterElement.textContent = `${turnCount}手 · ${counts.black + counts.white} / 64 こま`;
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
  gameSettingsLabelElement.textContent += ` · ${RULE_LABELS[ruleMode]}`;
  renderCards();

  const blackSuffix = playerSuffix(BLACK);
  const whiteSuffix = playerSuffix(WHITE);
  blackNameElement.textContent = `たくハム${blackSuffix ? `（${blackSuffix}）` : ""}`;
  whiteNameElement.textContent = `めぐハム${whiteSuffix ? `（${whiteSuffix}）` : ""}`;
  undoButton.disabled = !canUndo();

  blackScoreCard.classList.toggle("is-current", !ended && currentPlayer === BLACK);
  whiteScoreCard.classList.toggle("is-current", !ended && currentPlayer === WHITE);
}

function renderCards() {
  cardPanel.hidden = !gameStarted || ruleMode !== "cards";
  cardRulesDetails.hidden = ruleMode !== "cards";
  cardPanelTitle.textContent = `${hamsterName(currentPlayer)}の とっておき`;
  for (const player of [BLACK, WHITE]) {
    const stock = document.querySelector(
      player === BLACK ? "#black-card-stock" : "#white-card-stock",
    );
    stock.textContent = `${hamsterName(player)}：どこでも ${hands[player].anywhere}枚 ／ くるん ${hands[player].flip}枚`;
    stock.classList.toggle("is-current", currentPlayer === player);
  }
  for (const button of cardButtons) {
    const kind = button.dataset.card,
      count = hands[currentPlayer][kind];
    button.disabled = !canHumanPlay() || !getActionTargets(matchState(), kind).size;
    button.classList.toggle("is-used", count === 0);
    button.classList.toggle("is-selected", selectedCard === kind);
    button.setAttribute("aria-pressed", String(selectedCard === kind));
    button.setAttribute(
      "aria-label",
      `${CARDS[kind].name}。${CARDS[kind].description} ${count ? "のこり1枚" : "つかったよ"}`,
    );
    button.querySelector(".card-remaining").textContent = count
      ? selectedCard === kind
        ? "えらんでいるよ"
        : "のこり1枚"
      : "つかったよ";
  }
  cancelCardButton.hidden = !selectedCard;
  cardInstruction.textContent = gameOver()
    ? "おしまい！ のこったカードは、また次の対局で。"
    : !canHumanPlay()
      ? "相手の番は、ちょっと待ってね。"
      : selectedCard
        ? `${CARDS[selectedCard].description} マスを決めるまでは取り消せるよ。`
        : getValidMoves(board, currentPlayer).size
          ? "使いたいときにカードをえらんで、光るマスをぽちっ。"
          : "いつもの手はおやすみ。使えるカードをえらんでね。";
  lastCardElement.hidden = !lastCardAction;
  lastCardElement.textContent = lastCardAction
    ? `${hamsterName(lastCardAction.player)}が${CARDS[lastCardAction.kind].name}をつかったよ`
    : "";
}

function syncControls() {
  const joining = gameMode === "online" && onlineAction === "join";
  ruleSetup.hidden = joining;
  joinRuleNote.hidden = !joining;
  setupCardGuide.hidden = ruleMode !== "cards";
  ruleButtons.forEach((button) => {
    const active = button.dataset.rule === ruleMode;
    button.classList.toggle("is-selected", active);
    button.setAttribute("aria-pressed", String(active));
    button.disabled = onlineConnecting;
  });
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
    gameMode === "cpu" ||
    (gameMode === "online" && onlineAction === "create")
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

function clearOnlinePending() {
  if (onlinePendingTimer !== null) window.clearTimeout(onlinePendingTimer);
  onlinePendingTimer = null;
  onlinePending = false;
}

function sendOnlineState() {
  if (!onlineSession || onlineRole !== "host") return;
  void onlineSession
    .send({ type: "state", version: ONLINE_VERSION, ...snapshot(), revision: onlineRevision })
    .catch(() => {});
}

function requestOnlineState() {
  if (onlineRole === "guest") {
    void onlineSession?.send({ type: "state-request", version: ONLINE_VERSION }).catch(() => {});
  } else sendOnlineState();
}

async function sendOnlineAction(action) {
  if (!canHumanPlay() || onlineRole !== "guest" || !onlineSession) return;
  const attempt = onlineAttemptId;
  onlinePending = true;
  selectedCard = null;
  render();
  onlinePendingTimer = window.setTimeout(() => {
    if (attempt !== onlineAttemptId) return;
    clearOnlinePending();
    onlineSynced = false;
    requestOnlineState();
    render();
  }, 4000);
  try {
    const delivered = await onlineSession.send({
      type: "action",
      version: ONLINE_VERSION,
      ruleMode,
      action,
      player: currentPlayer,
      revision: onlineRevision + 1,
    });
    if (!delivered && attempt === onlineAttemptId && onlinePending) {
      clearOnlinePending();
      onlineSynced = false;
      requestOnlineState();
      render();
    }
  } catch {
    if (attempt === onlineAttemptId) {
      clearOnlinePending();
      onlineSynced = false;
      requestOnlineState();
      render();
    }
  }
}

function handleOnlineMessage(message) {
  if (!gameStarted || message?.version !== ONLINE_VERSION) return;
  if (message.type === "state-request") {
    sendOnlineState();
    return;
  }
  if (message.type === "state") {
    if (
      onlineRole !== "guest" ||
      message.senderRole !== "host" ||
      message.revision < onlineRevision
    )
      return;
    const state = parseOnlineState(message);
    if (!state) return;
    const card = message.lastCardAction;
    const validCard =
      card &&
      Object.hasOwn(CARDS, card.kind) &&
      [BLACK, WHITE].includes(card.player) &&
      Number.isInteger(card.index) &&
      card.index >= 0 &&
      card.index < 64;
    restore({
      ...state,
      lastMove:
        Number.isInteger(message.lastMove) && message.lastMove >= 0 && message.lastMove < 64
          ? message.lastMove
          : null,
      lastCardAction: validCard
        ? { kind: card.kind, index: card.index, player: card.player }
        : null,
      passNotice: typeof message.passNotice === "string" ? message.passNotice.slice(0, 200) : "",
    });
    onlineRevision = message.revision;
    history = [];
    onlineSynced = true;
    clearOnlinePending();
    render();
    return;
  }
  if (message.type !== "action" || onlineRole !== "host" || message.senderRole !== "guest") return;
  const expected =
    message.ruleMode === ruleMode &&
    message.player === currentPlayer &&
    message.player === opponent(humanPlayer) &&
    message.revision === onlineRevision + 1 &&
    applyAction(matchState(), message.action);
  if (expected) commitMove(message.action.index, { kind: message.action.kind, broadcast: false });
  // Both accepted and stale requests receive the authoritative result. A
  // duplicate request cannot spend another card or count as another turn.
  sendOnlineState();
}

function handleOnlineError(error, attemptId) {
  if (attemptId !== onlineAttemptId) return;
  clearOnlinePending();
  onlineSynced = false;
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
    onlineRole === "host" ? generateRoomCode() : normalizeRoomCode(roomCodeInput.value);

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
    onlineRole === "host" ? "へやをつくっています…" : "キーワードのへやを探しています…",
  );
  syncControls();

  try {
    const session = await createOnlineSession({
      role: onlineRole,
      roomCode: onlineRoomCode,
      hostPlayer: humanPlayer,
      ruleMode,
      onReady: ({ localPlayer, ruleMode: sessionRules }) => {
        window.setTimeout(() => {
          if (attemptId !== onlineAttemptId) return;
          setOnlineStatus("ふたりがそろったよ。対局スタート！", "success");
          startOnlineGame(localPlayer, sessionRules);
        }, 0);
      },
      onMessage: (message) => {
        if (attemptId === onlineAttemptId) handleOnlineMessage(message);
      },
      onPeerChange: (connected) => {
        window.setTimeout(() => {
          if (attemptId !== onlineAttemptId) return;
          onlinePeerConnected = connected;
          if (!connected && onlineRole === "guest") {
            onlineSynced = false;
            clearOnlinePending();
            selectedCard = null;
          }
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
        ? `${RULE_LABELS[ruleMode]}のへやだよ。キーワードを相手に送って、ここで待ってね。`
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
  let nextIndex = currentIndex + offset;
  const crossesRow =
    (event.key === "ArrowLeft" && currentIndex % BOARD_SIZE === 0) ||
    (event.key === "ArrowRight" && currentIndex % BOARD_SIZE === BOARD_SIZE - 1);

  if (nextIndex < 0 || nextIndex >= BOARD_SIZE * BOARD_SIZE || crossesRow) return;
  event.preventDefault();
  while (nextIndex >= 0 && nextIndex < 64) {
    if (Math.abs(offset) === 1 && Math.floor(nextIndex / 8) !== Math.floor(currentIndex / 8)) break;
    const cell = boardElement.querySelector(`[data-index="${nextIndex}"]`);
    if (cell && !cell.disabled) {
      cell.focus();
      break;
    }
    nextIndex += offset;
  }
}

function cancelCard() {
  const kind = selectedCard;
  selectedCard = null;
  render();
  if (kind) document.querySelector(`[data-card="${kind}"]`)?.focus({ preventScroll: true });
}

ruleButtons.forEach((button) =>
  button.addEventListener("click", () => {
    if (onlineConnecting || gameStarted) return;
    ruleMode = button.dataset.rule;
    resetBoard();
    syncControls();
    render();
  }),
);
cardButtons.forEach((button) =>
  button.addEventListener("click", (event) => {
    const kind = button.dataset.card;
    if (!canHumanPlay() || !getActionTargets(matchState(), kind).size) return;
    selectedCard = selectedCard === kind ? null : kind;
    render();
    if (event.detail === 0 && selectedCard)
      boardElement.querySelector(".cell.is-valid")?.focus({ preventScroll: true });
  }),
);
cancelCardButton.addEventListener("click", cancelCard);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && selectedCard) {
    event.preventDefault();
    cancelCard();
  }
});

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
