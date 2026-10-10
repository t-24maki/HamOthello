import {
  SIZE,
  PIECES,
  ROTATIONS,
  createGame,
  cellsFor,
  canPlace,
  play,
} from "./rules.js?v=20261010-blocks3";
import {
  createBlocksMatch,
  generateRoomCode,
  normalizeRoomCode,
  isOnlineConfigured,
} from "./online.js?v=20261010-blocks3";
import { createCpuTurn } from "./cpu-turn.js?v=20261010-blocks3";
import {
  nearestGrip,
  rotateGrip,
  snapPointer,
  pointerPosition,
  bindPlacementDrag,
} from "./placement.js?v=20261010-blocks3";

const $ = (id) => document.getElementById(id);
const names = ["たくハム", "めぐハム"];
const levels = { easy: "のんびり", normal: "ふつう", hard: "じっくり" };
const cpuTurn = createCpuTurn();
let difficulty = "normal",
  cpuSide = 0;
let game = createGame(),
  mode = "cpu",
  phase = "ready",
  selected = null,
  rotation = 0,
  anchor = null;
let roomAction = "create",
  roomCode = "",
  connectionNote = "",
  networkError = "",
  connecting = false;
let match = null,
  onlineRound = null,
  localOwner = 0,
  pending = false,
  epoch = 0,
  notice = "";
let focusCell = 0;
let grip = [0, 0],
  dragView = null,
  dragScroll = 0;
let pointerDrag;
const cellButtons = [],
  pieceButtons = [];
function icon(piece, turn = 0, handle = null) {
  const cells = ROTATIONS[piece][turn];
  const width = Math.max(...cells.map(([x]) => x)) + 1;
  const height = Math.max(...cells.map(([, y]) => y)) + 1;
  return `<svg viewBox="0 0 48 44" aria-hidden="true"><g fill="var(--piece)" stroke="var(--edge)" stroke-width="1.1">${cells.map(([x, y]) => `<rect x="${(48 - width * 10) / 2 + x * 10}" y="${(44 - height * 10) / 2 + y * 10}" width="9" height="9" rx="2"/>`).join("")}</g>${handle ? `<circle class="grip-dot" cx="${(48 - width * 10) / 2 + handle[0] * 10 + 4.5}" cy="${(44 - height * 10) / 2 + handle[1] * 10 + 4.5}" r="2.7"/>` : ""}</svg>`;
}
function editable() {
  return (
    phase === "playing" &&
    !networkError &&
    !pending &&
    (mode === "local" || (game.turn === localOwner && (mode === "cpu" || !!match)))
  );
}
function candidate() {
  return selected && anchor ? { piece: selected, rotation, x: anchor.x, y: anchor.y } : null;
}
function selectPiece(piece) {
  if (!editable() || !game.hands[game.turn].includes(piece)) return;
  pointerDrag?.cancel(false);
  if (selected !== piece) anchor = null;
  selected = piece;
  rotation = 0;
  grip = ROTATIONS[piece][0][0];
  notice = "";
  render();
}
function chooseCell(i) {
  if (!editable()) return;
  notice = "";
  focusCell = i;
  anchor = { x: (i % SIZE) - grip[0], y: Math.floor(i / SIZE) - grip[1] };
  render();
}
function rotate(direction) {
  if (!editable() || !selected) return;
  const turned = rotateGrip(selected, rotation, grip, direction);
  if (anchor)
    anchor = { x: anchor.x + grip[0] - turned.grip[0], y: anchor.y + grip[1] - turned.grip[1] };
  rotation = turned.rotation;
  grip = turned.grip;
  notice = "";
  render();
  if (dragView) updateDrag(dragView.event, dragView.moving);
}
function clearSelection() {
  pointerDrag?.cancel(false);
  selected = null;
  rotation = 0;
  anchor = null;
  grip = [0, 0];
  notice = "";
}
for (let i = 0; i < SIZE * SIZE; i++) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cell";
  button.dataset.cell = String(i);
  button.addEventListener("click", () => chooseCell(i));
  button.addEventListener("focus", () => {
    focusCell = i;
    for (let j = 0; j < cellButtons.length; j++) cellButtons[j].tabIndex = i === j ? 0 : -1;
  });
  button.addEventListener("keydown", (event) => {
    if (!editable() || event.ctrlKey || event.metaKey || event.altKey) return;
    const directions = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (directions[event.key]) {
      event.preventDefault();
      const [dx, dy] = directions[event.key];
      const x = Math.max(0, Math.min(7, (i % 8) + dx));
      const y = Math.max(0, Math.min(7, Math.floor(i / 8) + dy));
      chooseCell(y * 8 + x);
      cellButtons[y * 8 + x].focus({ preventScroll: true });
    } else if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      rotate(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      clearSelection();
      render();
    }
  });
  cellButtons.push(button);
  $("board").append(button);
}
for (const piece of PIECES) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "piece-button";
  button.dataset.piece = piece;
  button.addEventListener("click", () => selectPiece(piece));
  pieceButtons.push(button);
  $("hand").append(button);
}
for (const id of ["board", "hand"]) {
  $(id).addEventListener("contextmenu", (event) => event.preventDefault());
}
function boardMetrics() {
  const first = cellButtons[0].getBoundingClientRect();
  return {
    x: first.left + first.width / 2,
    y: first.top + first.height / 2,
    stepX: cellButtons[1].getBoundingClientRect().left - first.left,
    stepY: cellButtons[8].getBoundingClientRect().top - first.top,
    width: first.width,
    height: first.height,
  };
}
function hideDrag() {
  cancelAnimationFrame(dragScroll);
  dragScroll = 0;
  dragView = null;
  $("drag-piece").hidden = true;
  document.body.classList.remove("dragging-piece");
}
function updateDrag(event, moving) {
  if (!dragView) return;
  dragView.event = event;
  dragView.moving = moving;
  const metrics = boardMetrics(),
    point = pointerPosition(event, metrics, moving);
  if (moving || dragView.fromBoard) anchor = snapPointer(point, metrics, grip);
  if (anchor) focusCell = (anchor.y + grip[1]) * SIZE + anchor.x + grip[0];
  render();
  const ghost = $("drag-piece"),
    cells = ROTATIONS[selected][rotation];
  ghost.hidden = false;
  ghost.dataset.owner = String(game.turn);
  ghost.classList.toggle("over-board", !!anchor && (moving || dragView.fromBoard));
  ghost.style.left = `${point.x - grip[0] * metrics.stepX - metrics.width / 2}px`;
  ghost.style.top = `${point.y - grip[1] * metrics.stepY - metrics.height / 2}px`;
  ghost.innerHTML = cells
    .map(
      ([x, y]) =>
        `<span class="floating-cell${x === grip[0] && y === grip[1] ? " handle" : ""}" style="left:${x * metrics.stepX}px;top:${y * metrics.stepY}px;width:${metrics.width}px;height:${metrics.height}px"></span>`,
    )
    .join("");
}
function scrollWhileDragging() {
  dragScroll = 0;
  if (!dragView?.moving) return;
  const y = dragView.event.clientY;
  const table = $("board").getBoundingClientRect(),
    hand = $("hand-panel").getBoundingClientRect();
  const dy =
    y < 60 && table.top < 24 ? -8 : y > innerHeight - 60 && hand.bottom > innerHeight - 24 ? 8 : 0;
  if (dy) {
    window.scrollBy(0, dy);
    updateDrag(dragView.event, true);
  }
  dragScroll = requestAnimationFrame(scrollWhileDragging);
}
pointerDrag = bindPlacementDrag({
  surfaces: [$("hand"), $("board")],
  events: window,
  begin(event, surface) {
    if (!editable()) return false;
    const before = { selected, rotation, grip, anchor };
    const fromBoard = surface === $("board");
    if (fromBoard) {
      if (!selected) return false;
      const cell = event.target.closest("[data-cell]");
      if (!cell) return false;
      const i = Number(cell.dataset.cell),
        x = i % SIZE,
        y = Math.floor(i / SIZE);
      if (
        anchor &&
        ROTATIONS[selected][rotation].some(([dx, dy]) => anchor.x + dx === x && anchor.y + dy === y)
      )
        grip = [x - anchor.x, y - anchor.y];
    } else {
      const button = event.target.closest("[data-piece]");
      if (!button || button.disabled) return false;
      const piece = button.dataset.piece;
      if (selected !== piece) {
        selected = piece;
        rotation = 0;
        anchor = null;
      }
      const cells = ROTATIONS[selected][rotation];
      const svg = button.querySelector("svg").getBoundingClientRect();
      const scale = Math.min(svg.width / 48, svg.height / 44);
      const x = (event.clientX - svg.left - (svg.width - 48 * scale) / 2) / scale;
      const y = (event.clientY - svg.top - (svg.height - 44 * scale) / 2) / scale;
      const width = Math.max(...cells.map(([cx]) => cx)) + 1,
        height = Math.max(...cells.map(([, cy]) => cy)) + 1;
      grip = nearestGrip(
        cells,
        (x - (48 - width * 10) / 2 - 4.5) / 10,
        (y - (44 - height * 10) / 2 - 4.5) / 10,
      );
    }
    notice = "";
    dragView = { before, fromBoard, event, moving: false };
    document.body.classList.add("dragging-piece");
    updateDrag(event, false);
    return true;
  },
  move(event) {
    updateDrag(event, true);
    if (!dragScroll) dragScroll = requestAnimationFrame(scrollWhileDragging);
  },
  end(event, moving) {
    const before = dragView?.before;
    if (moving) updateDrag(event, true);
    if (moving && !anchor && before) ({ selected, rotation, grip, anchor } = before);
    hideDrag();
    render();
  },
  cancel(restore) {
    if (restore && dragView) ({ selected, rotation, grip, anchor } = dragView.before);
    hideDrag();
    if (restore) render();
  },
});
window.addEventListener("resize", () => pointerDrag.cancel());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pointerDrag.cancel();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && dragView) {
    pointerDrag.cancel();
    event.preventDefault();
  }
});
function renderBoard() {
  const move = candidate(),
    valid = move && canPlace(game, move);
  const preview = new Set(
    move && editable()
      ? cellsFor(move)
          .filter(([x, y]) => x >= 0 && y >= 0 && x < 8 && y < 8)
          .map(([x, y]) => y * 8 + x)
      : [],
  );
  const last = game.moves.at(-1);
  const lastCells = new Set(last ? cellsFor(last).map(([x, y]) => y * 8 + x) : []);
  for (let i = 0; i < 64; i++) {
    const button = cellButtons[i],
      value = game.board[i];
    button.disabled = !editable();
    button.tabIndex = focusCell === i ? 0 : -1;
    button.classList.toggle("blocked", value === -1);
    button.classList.toggle("preview", preview.has(i));
    button.classList.toggle("invalid", preview.has(i) && !valid);
    button.classList.toggle(
      "grip-cell",
      preview.has(i) && i === (anchor.y + grip[1]) * SIZE + anchor.x + grip[0],
    );
    button.classList.toggle("last-placed", lastCells.has(i));
    if (value > 0 || preview.has(i))
      button.dataset.owner = String(preview.has(i) ? game.turn : value - 1);
    else delete button.dataset.owner;
    const cellState =
      value === -1 ? "黒マス" : value === 0 ? "空き" : `${names[value - 1]}のブロック`;
    button.setAttribute(
      "aria-label",
      `${Math.floor(i / 8) + 1}行${(i % 8) + 1}列、${cellState}${preview.has(i) ? (valid ? "、仮置き" : "、置けない仮置き") : ""}`,
    );
  }
  $("empty-count").textContent = `空き ${game.board.filter((v) => v === 0).length}マス`;
}
function renderSetup() {
  $("setup").hidden = phase !== "ready" && phase !== "waiting";
  $("local-options").hidden = mode === "online";
  $("cpu-options").hidden = mode !== "cpu";
  $("cpu-level").value = difficulty;
  $("cpu-side").value = String(cpuSide);
  $("start-note").textContent =
    mode === "cpu"
      ? "あなたはたくハム、CPUはめぐハム。再戦では先後を交代するよ。"
      : "ひとつの盤を、交代で。たくハムからはじめるよ。";
  $("online-options").hidden = mode !== "online";
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
  $("connection-note").textContent = connectionNote;
  $("connect").hidden = connecting;
  $("connect").textContent = roomAction === "create" ? "へやをつくる →" : "へやに入る →";
  $("cancel-connect").hidden = !connecting;
  $("leave").hidden = phase === "ready" || phase === "waiting";
  $("leave").textContent = mode === "online" ? "へやを出る" : "えらびなおす";
  $("match-info").textContent =
    phase === "ready" || phase === "waiting"
      ? "7つの形を、どこにつめよう？"
      : mode === "online"
        ? `${roomCode} · あなたは${names[localOwner]}`
        : mode === "cpu"
          ? `CPU · ${levels[difficulty]} · あなたはたくハム`
          : "1台でふたり · 交代で置いてね";
}
function render() {
  if (!editable()) pointerDrag?.cancel(false);
  $("board").classList.toggle("has-selection", editable() && !!selected);
  renderSetup();
  for (let p = 0; p < 2; p++) {
    const player = $("player-" + p);
    player.classList.toggle(
      "active",
      phase === "won" ? game.winner === p : game.turn === p && phase === "playing",
    );
    $("seat-" + p).textContent =
      `${game.starter === p ? "先手" : "後手"}${mode === "cpu" ? (p === localOwner ? " · あなた" : " · CPU") : mode === "online" && onlineRound && p === localOwner ? " · あなた" : ""}`;
    $("remaining-" + p).textContent = `のこり ${game.hands[p].length}こ`;
    $("mini-hand-" + p).innerHTML = PIECES.map((piece) =>
      icon(piece).replace("<svg ", `<svg class="${game.hands[p].includes(piece) ? "" : "used"}" `),
    ).join("");
    player.setAttribute(
      "aria-label",
      `${names[p]}の持ちブロック：${game.hands[p].join("・") || "なし"}`,
    );
    const asset =
      game.status === "won"
        ? `${p === 0 ? "tak" : "meg"}-${game.winner === p ? "win" : "lose"}`
        : p === 0
          ? "pink-piece"
          : "cream-piece";
    $("face-" + p).src = `../assets/${asset}.png`;
  }
  $("turn-title").textContent = networkError
    ? "通信が切れたみたい"
    : phase === "won"
      ? `${names[game.winner]}の勝ち！`
      : phase === "playing"
        ? mode === "cpu" && game.turn !== localOwner
          ? "めぐハムが考えているよ…"
          : `${names[game.turn]}の番だよ`
        : "どちらが最後まで置けるかな？";
  $("turn-hint").textContent = networkError
    ? "盤面を止めています。へやを出て、つなぎ直してね。"
    : phase === "won"
      ? game.reason === "all-placed"
        ? "14個ぜんぶ置けたね。後手の勝ち！"
        : `${names[1 - game.winner]}は、残りの形を置けなくなったよ。`
      : phase === "playing"
        ? mode === "cpu" && game.turn !== localOwner
          ? "どこにつめようかな？ ちょっと待ってね。"
          : mode === "online" && game.turn !== localOwner
            ? "相手がどこに置くか、待っていてね。"
            : "形を選んで、仮置き。よければ「ここに置く」。"
        : "ブロックを選んで、空いているところへ。";
  const owner = mode === "cpu" || (mode === "online" && onlineRound) ? localOwner : game.turn;
  $("hand-panel").dataset.owner = String(owner);
  $("hand-title").textContent = `${names[owner]}のブロック`;
  for (const button of pieceButtons) {
    const piece = button.dataset.piece,
      used = !game.hands[owner].includes(piece);
    button.innerHTML =
      icon(piece, selected === piece ? rotation : 0, selected === piece ? grip : null) +
      `<span>${piece}</span>`;
    button.disabled = used || !editable();
    button.classList.toggle("used", used);
    button.setAttribute("aria-pressed", String(selected === piece));
    button.setAttribute("aria-label", `${piece}ブロック${used ? "（使用済み）" : ""}`);
  }
  $("rotate-left").disabled = $("rotate-right").disabled =
    !editable() || !selected || ROTATIONS[selected].length === 1;
  const move = candidate(),
    valid = move && canPlace(game, move);
  const voted = onlineRound?.rematch[localOwner];
  $("place").textContent =
    phase === "won"
      ? voted
        ? "相手の返事を待っているよ"
        : "もういちどあそぶ ↻"
      : pending
        ? "相手に届けているよ…"
        : mode === "cpu" && phase === "playing" && game.turn !== localOwner
          ? "CPUが考え中…"
          : "ここに置く ✓";
  $("place").disabled =
    phase === "won" ? !!networkError || pending || !!voted : !editable() || !valid;
  $("notice").textContent =
    networkError ||
    notice ||
    (phase === "won"
      ? mode === "online"
        ? onlineRound?.rematch[1 - localOwner]
          ? "相手はもういちど遊びたいみたい。"
          : "ふたりが押したら、先後を交代して再戦。"
        : "先後を交代して、黒マスも引き直すよ。"
      : phase !== "playing"
        ? "上のスタートボタンではじめよう。"
        : pending
          ? "置いた場所を確認しているよ。"
          : !editable()
            ? mode === "cpu"
              ? "めぐハムが置く場所を考えているよ。"
              : "相手の番だよ。少し待ってね。"
            : !selected
              ? "7つの中から、使うブロックを選んでね。"
              : !anchor
                ? "つかんで盤面へ。タップなら、●を置くマスを選ぼう。"
                : valid
                  ? "ぴったり入るよ！ よければ確定してね。"
                  : "ここには置けないよ。場所や向きを変えてね。");
  $("notice").classList.toggle("error", !!networkError || (!!move && !valid && editable()));
  renderBoard();
}
function startLocal(starter = 0) {
  cpuTurn.cancel();
  localOwner = 0;
  game = createGame({ starter });
  phase = "playing";
  clearSelection();
  focusCell = 0;
  render();
  scheduleCPU();
}
function acceptLocal(result) {
  if (!result.ok) return;
  game = result.state;
  phase = game.status === "won" ? "won" : "playing";
  clearSelection();
  render();
  scheduleCPU();
}
function scheduleCPU() {
  if (mode !== "cpu" || phase !== "playing" || game.turn === localOwner) return;
  const position = game;
  cpuTurn.start(position, difficulty, (action) => {
    if (mode !== "cpu" || phase !== "playing" || game !== position) return;
    if (action) acceptLocal(play(game, action));
  });
}
function closeOnline() {
  epoch++;
  match?.close();
  match = null;
  onlineRound = null;
  connecting = false;
  pending = false;
  roomCode = "";
  connectionNote = "";
  networkError = "";
}
function toSetup(nextMode = mode) {
  cpuTurn.cancel();
  closeOnline();
  mode = nextMode;
  localOwner = 0;
  phase = "ready";
  game = createGame({ starter: mode === "cpu" ? cpuSide : 0 });
  clearSelection();
  render();
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
    connectionNote = "HAMU- からはじまるキーワードを入れてね。";
    render();
    return;
  }
  closeOnline();
  const attempt = epoch;
  roomCode = code;
  connecting = true;
  phase = "waiting";
  connectionNote = roomAction === "create" ? "へやをつくっているよ…" : "へやを探しているよ…";
  render();
  try {
    const opened = await createBlocksMatch({
      role: roomAction === "create" ? "host" : "guest",
      roomCode,
      onState(next, owner) {
        if (attempt !== epoch) return;
        const changed =
          !onlineRound ||
          next.roundId !== onlineRound.roundId ||
          next.actions.length !== onlineRound.actions.length;
        onlineRound = next;
        localOwner = owner;
        game = next.game;
        connecting = false;
        phase = game.status === "won" ? "won" : "playing";
        if (changed) clearSelection();
        render();
      },
      onStatus(status) {
        if (attempt === epoch) {
          pending = status === "sending";
          render();
        }
      },
      onReject(message) {
        if (attempt === epoch) {
          notice = message;
          render();
        }
      },
      onError(error) {
        if (attempt !== epoch) return;
        connecting = false;
        pending = false;
        if (onlineRound) networkError = error.message;
        else {
          phase = "ready";
          connectionNote = error.message;
        }
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
          ? "キーワードを相手に教えてね。ふたりそろうとはじまるよ。"
          : "相手につないでいるよ…";
    render();
  } catch (error) {
    if (attempt !== epoch) return;
    connecting = false;
    phase = "ready";
    connectionNote = error.message;
    render();
  }
}
$("start").addEventListener("click", () => startLocal(mode === "cpu" ? cpuSide : 0));
$("cpu-level").addEventListener("change", () => {
  difficulty = Object.hasOwn(levels, $("cpu-level").value) ? $("cpu-level").value : "normal";
});
$("cpu-side").addEventListener("change", () => {
  cpuSide = $("cpu-side").value === "1" ? 1 : 0;
  game = createGame({ starter: cpuSide });
  render();
});
$("leave").addEventListener("click", () => toSetup());
$("cancel-connect").addEventListener("click", () => toSetup());
$("connect").addEventListener("click", () => void connect());
$("room-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") void connect();
});
$("copy-room").addEventListener("click", async () => {
  const attempt = epoch;
  try {
    await navigator.clipboard.writeText(roomCode);
    if (attempt === epoch) connectionNote = "コピーしたよ。相手に教えてね。";
  } catch {
    if (attempt === epoch) connectionNote = "キーワードを長押ししてコピーしてね。";
  }
  if (attempt === epoch) render();
});
for (const button of document.querySelectorAll("[data-mode]"))
  button.addEventListener("click", () => {
    if (!connecting) toSetup(button.dataset.mode);
  });
for (const button of document.querySelectorAll("[data-room]"))
  button.addEventListener("click", () => {
    if (!connecting) {
      roomAction = button.dataset.room;
      connectionNote = "";
      render();
    }
  });
$("rotate-left").addEventListener("click", () => rotate(-1));
$("rotate-right").addEventListener("click", () => rotate(1));
$("hand-panel").addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "r" && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    rotate(event.shiftKey ? -1 : 1);
  }
});
$("place").addEventListener("click", () => {
  if (networkError || pending) return;
  if (phase === "won") {
    if (mode === "online") match?.submit("rematch");
    else startLocal(1 - game.starter);
    return;
  }
  const move = candidate();
  if (!editable() || !move || !canPlace(game, move)) return;
  if (mode === "online") {
    match.submit("play", move);
    return;
  }
  const result = play(game, move);
  acceptLocal(result);
});
window.addEventListener("pagehide", () => {
  cpuTurn.cancel();
  if (match || connecting || (mode === "cpu" && phase === "playing")) {
    closeOnline();
    phase = "ready";
    game = createGame({ starter: mode === "cpu" ? cpuSide : 0 });
    clearSelection();
    render();
  }
});
render();
