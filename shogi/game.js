import {
  createGame,
  PIECES,
  TYPES,
  HAND_TYPES,
  pieceName,
  moveTargets,
  dropTargets,
  inCheck,
  isRestricted,
  play,
} from "./rules.js";
import { pieceArtwork, pieceElement } from "./pieces.js?v=20260926-art3";

import { chooseMove } from "./cpu.js";
import {
  createShogiMatch,
  generateRoomCode,
  normalizeRoomCode,
  isOnlineConfigured,
} from "./online.js";

let mode = "cpu",
  localOwner = 0,
  difficulty = "normal",
  roomAction = "create";
let cpuTimer = null,
  cpuWorker = null,
  cpuJob = 0,
  cpuThinking = false;
let match = null,
  onlineRound = null,
  roomCode = "",
  connecting = false,
  pending = false;
let connectionNote = "",
  networkError = "",
  epoch = 0,
  renderedPerspective = null;
const canInteract = () =>
  phase === "playing" &&
  !networkError &&
  !pending &&
  (mode === "local" || game.turn === localOwner);
const perspective = () => (mode === "local" ? 0 : localOwner);
const who = (owner) =>
  mode === "local"
    ? `${players[owner]}さん`
    : owner === localOwner
      ? "あなた"
      : mode === "cpu"
        ? "CPU"
        : "相手";
const $ = (id) => document.getElementById(id);
const players = ["先手", "後手"];
let game = createGame(),
  phase = "ready",
  selected = null;
let guideType = "king",
  guidePromoted = false,
  dialogAction = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
const cells = Array.from({ length: 16 }, (_, index) => {
  const button = el("button", "cell");
  button.type = "button";
  button.dataset.index = index;
  button.addEventListener("click", () => clickCell(index));
  button.addEventListener("keydown", (event) => {
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 };
    if (!(event.key in offsets)) return;
    event.preventDefault();
    const to = index + offsets[event.key] * (perspective() ? -1 : 1);
    if (
      to < 0 ||
      to > 15 ||
      (Math.abs(offsets[event.key]) === 1 && Math.floor(to / 4) !== Math.floor(index / 4))
    )
      return;
    cells[to].focus();
  });
  $("board").append(button);
  return button;
});

const handButtons = [0, 1].map((owner) =>
  Object.fromEntries(
    HAND_TYPES.map((type) => {
      const button = el("button", "hand-piece");
      button.type = "button";
      button.dataset.type = type;
      const art = el("img", "hand-art");
      art.src = pieceArtwork({ type, promoted: false });
      art.alt = "";
      art.draggable = false;
      button.append(art, el("span", "hand-count", "0"));
      button.addEventListener("click", () => {
        if (!canInteract() || game.turn !== owner || !game.hands[owner][type]) return;
        selected =
          selected?.kind === "drop" && selected.type === type ? null : { kind: "drop", type };
        showGuide(type, false);
        render();
      });
      $(`hand-${owner}`).append(button);
      return [type, button];
    }),
  ),
);

const guideTabs = Object.fromEntries(
  TYPES.map((type) => {
    const button = el("button", "", PIECES[type].short);
    button.type = "button";
    button.setAttribute("aria-label", `${PIECES[type].name}の動き`);
    button.addEventListener("click", () => showGuide(type, false));
    $("piece-tabs").append(button);
    return [type, button];
  }),
);

function showGuide(type, promoted) {
  guideType = type;
  guidePromoted = promoted;
  const piece = { type, promoted, owner: 0 };
  for (const item of TYPES) guideTabs[item].setAttribute("aria-pressed", String(item === type));
  $("piece-name").textContent = pieceName(piece);
  $("piece-state").textContent = promoted ? "成ったすがた" : "ふつう";
  $("piece-hint").textContent = promoted ? PIECES[type].promotedHint : PIECES[type].hint;
  $("show-promoted").disabled = type === "king";
  $("show-promoted").setAttribute("aria-pressed", String(promoted));
  $("show-promoted").textContent =
    type === "king"
      ? "ハム王は成らないよ"
      : promoted
        ? "成る前のうごきに戻す"
        : "成ったらどうなる？";
  $("move-diagram").replaceChildren(pieceElement(piece));
}

function targets() {
  if (!canInteract() || !selected) return [];
  return selected.kind === "move"
    ? moveTargets(game, selected.from)
    : dropTargets(game, selected.type);
}

function render(message) {
  const ready = phase === "ready" || phase === "waiting",
    ended = phase === "won";
  const playing = phase === "playing",
    interactive = canInteract(),
    viewOwner = perspective();
  renderSetup();
  if (renderedPerspective !== viewOwner) {
    $("board").replaceChildren(...(viewOwner ? [...cells].reverse() : cells));
    $("board-surround").before($(`player-${1 - viewOwner}`));
    $("board-surround").after($(`player-${viewOwner}`));
    [...$("board-columns").children].forEach(
      (label, i) => (label.textContent = viewOwner ? 4 - i : i + 1),
    );
    renderedPerspective = viewOwner;
  }
  const checked = [0, 1].map((owner) => playing && inCheck(game, owner));
  $("turn-banner").dataset.owner = String(ended ? game.winner : game.turn);
  $("turn-title").textContent = networkError
    ? "通信が切れたみたい。"
    : ready
      ? mode === "online"
        ? "へやで、待ち合わせ。"
        : "ならべて、はじめよう。"
      : ended
        ? `${who(game.winner)}のかち！`
        : `${who(game.turn)}の番だよ。`;
  $("turn-hint").textContent = networkError
    ? "つなぎ直して、もう一局あそぼう。"
    : ready
      ? mode === "online"
        ? "キーワードで相手とつながるよ。"
        : "はじめの並びは、ふたりでおそろい。"
      : ended
        ? "ハム王をつかまえたね。"
        : pending
          ? "相手に手を届けているよ…"
          : mode === "cpu" && game.turn !== localOwner
            ? "CPUが、じっくり考え中…"
            : checked[game.turn]
              ? "王手！ ハム王がねらわれているよ。"
              : mode === "online" && game.turn !== localOwner
                ? "相手の手を待っているよ。"
                : `${players[game.turn]}の駒か、持ち駒をえらんでね。`;
  $("move-count").textContent = ready
    ? "準備中"
    : ended
      ? `${game.moves.length}手`
      : `${game.moves.length + 1}手目`;
  const legal = targets();
  for (const [index, button] of cells.entries()) {
    const piece = game.board[index],
      possible = legal.includes(index);
    const restricted = possible && isRestricted(game, { ...selected, to: index });
    button.className = [
      "cell",
      piece ? "has-piece" : "",
      selected?.kind === "move" && selected.from === index ? "selected" : "",
      possible ? "legal" : "",
      restricted ? "restricted" : "",
      game.lastMove?.to === index ? "last-to" : "",
      game.lastMove?.kind === "move" && game.lastMove.from === index ? "last-from" : "",
      piece?.type === "king" && checked[piece.owner] ? "threatened" : "",
    ]
      .filter(Boolean)
      .join(" ");
    button.disabled = !interactive;
    button.setAttribute(
      "aria-pressed",
      String(selected?.kind === "move" && selected.from === index),
    );
    button.setAttribute(
      "aria-label",
      `${Math.floor(index / 4) + 1}段${(index % 4) + 1}列、${piece ? `${players[piece.owner]}の${pieceName(piece)}` : "空きマス"}${restricted ? "、繰り返しのため選べません" : possible ? "、ここへ打てます・動かせます" : ""}`,
    );
    button.replaceChildren(
      ...(piece ? [pieceElement({ ...piece, owner: piece.owner ^ viewOwner })] : []),
    );
  }
  for (const owner of [0, 1]) {
    $(`player-${owner}`).classList.toggle("active", playing && game.turn === owner);
    $(`player-name-${owner}`).textContent = players[owner];
    $(`player-team-${owner}`).textContent =
      mode === "local" ? (owner === 0 ? "たくハムチーム" : "めぐハムチーム") : who(owner);
    $(`player-facing-${owner}`).textContent = owner === viewOwner ? "↑" : "↓";
    for (const type of HAND_TYPES) {
      const button = handButtons[owner][type],
        count = game.hands[owner][type];
      button.querySelector(".hand-count").textContent = count;
      button.disabled = !interactive || owner !== game.turn || !count;
      const active = owner === game.turn && selected?.kind === "drop" && selected.type === type;
      button.classList.toggle("empty", !count);
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute(
        "aria-label",
        `${players[owner]}の持ち駒 ${PIECES[type].name} ${count}枚`,
      );
    }
  }
  $("start").hidden = !ready || mode === "online";
  $("shuffle").hidden = !ready || mode === "online";
  $("new-game").hidden = ready || (mode === "online" && !ended);
  $("new-game").disabled =
    mode === "online" &&
    (pending || !!networkError || onlineRound?.rematch[roomAction === "create" ? 0 : 1]);
  $("new-game").textContent =
    mode === "online" && onlineRound?.rematch[roomAction === "create" ? 0 : 1]
      ? "相手の返事を待っているよ"
      : "もう一局あそぶ ↻";
  $("clear-selection").hidden = ready;
  $("clear-selection").disabled = !selected || !interactive;
  if (message) $("notice").textContent = message;
  else if (networkError) $("notice").textContent = networkError;
  else if (pending) $("notice").textContent = "手を届けているよ…";
  else if (selected)
    $("notice").textContent =
      selected.kind === "drop"
        ? `${PIECES[selected.type].name}を、空いているマスへ打とう。`
        : `${pieceName(game.board[selected.from])}：${legal.length ? "光るマスへ動かせるよ。" : "今は動けるマスがないよ。"}`;
  else if (ready) $("notice").textContent = "";
  else if (ended)
    $("notice").textContent =
      mode === "online" && onlineRound?.rematch.some(Boolean)
        ? onlineRound.rematch[roomAction === "create" ? 0 : 1]
          ? "もう一局のお返事を待っているよ。"
          : "相手が、もう一局あそびたいみたい。"
        : `${who(game.winner)}、おめでとう！`;
  else if (game.restriction)
    $("notice").textContent = `${who(game.turn)}、繰り返しにならない別の手をえらんでね。`;
  else if (game.lastMove) {
    const move = game.lastMove;
    $("notice").textContent = move.newlyPromoted
      ? `${players[move.owner]}の${PIECES[move.type].name}が成ったよ！`
      : move.captured
        ? `${players[move.owner]}が${PIECES[move.captured].name}を取ったよ。`
        : `${players[move.owner]}が${PIECES[move.type].name}を${move.kind === "drop" ? "打った" : "動かした"}よ。`;
  } else $("notice").textContent = "ハム王をつかまえたら勝ち。先手さんから、どうぞ。";
}

function popup({
  title,
  message,
  main = "別の手をえらぶ",
  cancel = "",
  action = null,
  result = false,
}) {
  $("dialog-title").textContent = title;
  $("dialog-message").textContent = message;
  $("dialog-main").textContent = main;
  $("dialog-cancel").textContent = cancel;
  $("dialog-cancel").hidden = !cancel;
  $("result-pair").hidden = !result;
  $("dialog-mark").hidden = result;
  dialogAction = action;
  if (!$("message-dialog").open) $("message-dialog").showModal();
  $("dialog-main").focus();
}

function clickCell(index) {
  if (!canInteract()) return;
  const piece = game.board[index];
  if (piece?.owner === game.turn) {
    selected =
      selected?.kind === "move" && selected.from === index ? null : { kind: "move", from: index };
    showGuide(piece.type, piece.promoted);
    render();
    return;
  }
  if (!selected || !targets().includes(index)) {
    if (piece) showGuide(piece.type, piece.promoted);
    render(
      selected
        ? "光るマスをえらんでね。自分の駒を押すと、えらびなおせるよ。"
        : "まずは、自分の駒か持ち駒をえらんでね。",
    );
    return;
  }
  const action = { ...selected, to: index };
  selected = null;
  if (mode === "online") {
    match?.submit("play", action);
    render();
  } else acceptOutcome(play(game, action));
}

function showRepetition(event) {
  popup({
    title: "繰り返しは指せないよ！",
    message: `${event.continuous ? "王手が続く繰り返しだよ。" : "同じ局面が4回になってしまうよ。"}\n${who(event.offender)}${event.rewound ? "の手番に戻したので、" : "、"}別の手をえらんでね。`,
  });
}
function showResult() {
  $("result-taku").src = game.winner === 0 ? "../assets/tak-win.png" : "../assets/tak-lose.png";
  $("result-megu").src = game.winner === 1 ? "../assets/meg-win.png" : "../assets/meg-lose.png";
  popup({
    title: `${who(game.winner)}のかち！`,
    message: `ハム王をつかまえたよ。\n${game.moves.length}手で、しょうぶがついたね。`,
    main: mode === "online" ? "もう一局をお願いする" : "もう一局あそぶ ↻",
    cancel: "盤面をみる",
    action: mode === "online" ? requestRematch : newRound,
    result: true,
  });
}
function acceptOutcome(outcome) {
  game = outcome.state;
  selected = null;
  cpuThinking = false;
  phase = game.status === "won" ? "won" : "playing";
  if (outcome.move?.newlyPromoted) showGuide(outcome.move.type, true);
  render();
  if (outcome.reason === "repetition") showRepetition(outcome);
  else if (phase === "won") showResult();
  scheduleCPU();
}
function cancelCPU() {
  cpuJob++;
  cpuThinking = false;
  if (cpuTimer !== null) clearTimeout(cpuTimer);
  cpuTimer = null;
  cpuWorker?.terminate();
  cpuWorker = null;
}
function scheduleCPU() {
  if (
    mode !== "cpu" ||
    phase !== "playing" ||
    game.turn === localOwner ||
    cpuThinking ||
    $("message-dialog").open
  )
    return;
  cpuThinking = true;
  const id = ++cpuJob,
    position = game;
  render();
  const complete = (action) => {
    if (id !== cpuJob || game !== position || mode !== "cpu" || phase !== "playing") return;
    cpuWorker?.terminate();
    cpuWorker = null;
    cpuThinking = false;
    if (!action) {
      render("今は動かせる駒がないみたい。もう一局あそんでね。");
      return;
    }
    acceptOutcome(play(game, action));
  };
  const fallback = () => {
    cpuWorker?.terminate();
    cpuWorker = null;
    if (id === cpuJob) complete(chooseMove(position, difficulty, { maxMs: 140, maxNodes: 1800 }));
  };
  cpuTimer = setTimeout(() => {
    cpuTimer = null;
    if (id !== cpuJob) return;
    try {
      cpuWorker = new Worker(new URL("./cpu-worker.js", import.meta.url), { type: "module" });
      cpuWorker.onmessage = ({ data }) => {
        if (data.id === id) complete(data.action);
      };
      cpuWorker.onerror = fallback;
      cpuWorker.postMessage({ id, state: position, difficulty });
    } catch {
      fallback();
    }
  }, 420);
}
function closeOnline() {
  epoch++;
  match?.close();
  match = null;
  onlineRound = null;
  connecting = false;
  pending = false;
  roomCode = "";
  networkError = "";
  connectionNote = "";
}
function newRound() {
  cancelCPU();
  game = createGame();
  phase = "ready";
  selected = null;
  showGuide("king", false);
  render();
}
function returnToSetup(nextMode = mode) {
  cancelCPU();
  closeOnline();
  mode = nextMode;
  localOwner = mode === "cpu" ? Number($("cpu-side").value) : 0;
  $("message-dialog").close();
  dialogAction = null;
  newRound();
}
function renderSetup() {
  const setup = phase === "ready" || phase === "waiting" || !!networkError;
  $("match-setup").hidden = !setup;
  $("cpu-options").hidden = mode !== "cpu";
  $("online-setup").hidden = mode !== "online";
  $("mode-label").textContent = {
    cpu: "CPUとあそぶ",
    local: "1台でふたり",
    online: "通信でふたり",
  }[mode];
  for (const button of document.querySelectorAll("[data-mode]")) {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    button.disabled = connecting;
  }
  for (const button of document.querySelectorAll("[data-room]")) {
    button.setAttribute("aria-pressed", String(button.dataset.room === roomAction));
    button.disabled = connecting;
  }
  $("join-fields").hidden = roomAction !== "join";
  $("room-input").disabled = connecting;
  $("room-waiting").hidden = !roomCode;
  $("room-code").textContent = roomCode;
  $("online-status").textContent = connectionNote || networkError;
  $("connect").hidden = connecting || (!!onlineRound && !networkError);
  $("connect").textContent = roomAction === "create" ? "へやをつくる →" : "へやに入る →";
  $("cancel-connect").hidden = !connecting && !networkError;
  $("match-toolbar").hidden = setup && !networkError;
  $("match-info").textContent =
    mode === "online"
      ? `${roomCode} · あなたは${players[localOwner]}`
      : mode === "cpu"
        ? `CPU · ${{ easy: "のんびり", normal: "ふつう", hard: "じっくり" }[difficulty]} · あなたは${players[localOwner]}`
        : "1台でふたり";
  $("settings").textContent = mode === "online" ? "へやを出る" : "モードをえらびなおす";
}
function acceptOnline(next, owner) {
  const newGame = !onlineRound || next.roundId !== onlineRound.roundId;
  const wasWon = phase === "won";
  onlineRound = next;
  localOwner = owner;
  game = next.game;
  selected = null;
  connecting = false;
  networkError = "";
  connectionNote = "";
  phase = game.status === "won" ? "won" : "playing";
  if (newGame) {
    $("message-dialog").close();
    dialogAction = null;
    showGuide("king", false);
  } else if (game.lastMove?.newlyPromoted) showGuide(game.lastMove.type, true);
  render();
  if (next.event) showRepetition(next.event);
  else if (phase === "won" && (!wasWon || newGame)) showResult();
}
async function connect() {
  if (connecting) return;
  if (!isOnlineConfigured()) {
    connectionNote = "通信の準備がまだできていないみたい。";
    render();
    return;
  }
  const code =
    roomAction === "create" ? generateRoomCode() : normalizeRoomCode($("room-input").value);
  if (!/^HAMU-[A-Z2-9]{6}$/.test(code)) {
    connectionNote = "HAMU- からはじまる6文字のキーワードを入れてね。";
    render();
    return;
  }
  closeOnline();
  cancelCPU();
  const attempt = epoch;
  roomCode = code;
  connecting = true;
  phase = "waiting";
  selected = null;
  connectionNote = roomAction === "create" ? "へやをつくっているよ…" : "へやを探しているよ…";
  render();
  try {
    const opened = await createShogiMatch({
      role: roomAction === "create" ? "host" : "guest",
      roomCode,
      onState(next, owner) {
        if (attempt === epoch) acceptOnline(next, owner);
      },
      onStatus(status) {
        if (attempt === epoch) {
          pending = status === "sending";
          render();
        }
      },
      onReject(message) {
        if (attempt === epoch) render(message);
      },
      onError(error) {
        if (attempt !== epoch) return;
        connecting = false;
        pending = false;
        networkError = error.message;
        connectionNote = error.message;
        $("message-dialog").close();
        dialogAction = null;
        render();
      },
    });
    if (attempt !== epoch) {
      opened.close();
      return;
    }
    match = opened;
    if (!onlineRound)
      connectionNote =
        roomAction === "create"
          ? "このキーワードを相手に教えてね。待っているよ。"
          : "相手とつないでいるよ…";
    render();
  } catch (error) {
    if (attempt !== epoch) return;
    connecting = false;
    connectionNote = error.message;
    phase = "ready";
    render();
  }
}
function requestRematch() {
  if (mode === "online") match?.submit("rematch");
  render();
}
$("start").addEventListener("click", () => {
  phase = "playing";
  render();
  scheduleCPU();
});
$("shuffle").addEventListener("click", newRound);
$("clear-selection").addEventListener("click", () => {
  selected = null;
  render();
});
$("show-promoted").addEventListener("click", () => {
  if (guideType !== "king") showGuide(guideType, !guidePromoted);
});
$("new-game").addEventListener("click", () => {
  if (mode === "online") {
    requestRematch();
    return;
  }
  if (phase === "won" || !game.moves.length) newRound();
  else
    popup({
      title: "もう一局、はじめる？",
      message: "今の対局を終えて、駒を新しく並べるよ。",
      main: "新しくはじめる",
      cancel: "対局をつづける",
      action: newRound,
    });
});
$("settings").addEventListener("click", () => {
  if (networkError || phase !== "playing") returnToSetup();
  else
    popup({
      title: mode === "online" ? "へやを出る？" : "モードをえらびなおす？",
      message:
        mode === "online"
          ? "ふたりの通信を終えるよ。また遊ぶときは、へやをつくってね。"
          : "今の対局を終えて、遊び方をえらびなおすよ。",
      main: mode === "online" ? "へやを出る" : "モードをえらびなおす",
      cancel: "対局をつづける",
      action: () => returnToSetup(),
    });
});
for (const button of document.querySelectorAll("[data-mode]"))
  button.addEventListener("click", () => {
    if (!connecting) returnToSetup(button.dataset.mode);
  });
for (const button of document.querySelectorAll("[data-room]"))
  button.addEventListener("click", () => {
    if (!connecting) {
      roomAction = button.dataset.room;
      connectionNote = "";
      render();
    }
  });
$("cpu-level").addEventListener("change", () => {
  difficulty = $("cpu-level").value;
  render();
});
$("cpu-side").addEventListener("change", () => {
  localOwner = Number($("cpu-side").value);
  render();
});
$("connect").addEventListener("click", () => void connect());
$("cancel-connect").addEventListener("click", () => returnToSetup());
$("room-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void connect();
  }
});
$("copy-room").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    connectionNote = "コピーしたよ。相手に教えてね。";
  } catch {
    connectionNote = "キーワードを長押ししてコピーしてね。";
  }
  render();
});
$("dialog-main").addEventListener("click", () => {
  const action = dialogAction;
  dialogAction = null;
  $("message-dialog").close();
  action?.();
  scheduleCPU();
});
$("dialog-cancel").addEventListener("click", () => {
  dialogAction = null;
  $("message-dialog").close();
  scheduleCPU();
});
$("message-dialog").addEventListener("close", scheduleCPU);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("message-dialog").open) {
    selected = null;
    render();
  }
});
window.addEventListener("pagehide", () => {
  cancelCPU();
  closeOnline();
});
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  if (mode === "online") returnToSetup();
  else {
    render();
    scheduleCPU();
  }
});
showGuide("king", false);
render();
