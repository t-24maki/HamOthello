import {
  FOODS,
  PLAYERS,
  normalize,
  createGame,
  playWord,
  giveUp,
  timeOut,
  TURN_LIMIT_MS,
  resultCopy,
} from "./rules.js?v=20260926-1200words";
import {
  createShiritoriMatch,
  generateRoomCode,
  normalizeRoomCode,
  isOnlineConfigured,
} from "./online.js?v=20260926-1200words";
const $ = (id) => document.getElementById(id);
const CHARACTER_ART = [
  {
    idle: "../assets/pink-piece.png",
    happy: "../assets/tak-win.png",
    sad: "../assets/tak-lose.png",
  },
  {
    idle: "../assets/cream-piece.png",
    happy: "../assets/meg-win.png",
    sad: "../assets/meg-lose.png",
  },
];
// Decode the expressions while the menu is visible, before a turn or result swaps them in.
for (const art of CHARACTER_ART) {
  for (const src of Object.values(art)) {
    const image = new Image();
    image.src = src;
    void image.decode().catch(() => {});
  }
}
let mode = "local",
  roomAction = "create",
  game = null,
  seat = 0,
  localRound = 0,
  match = null,
  connecting = false,
  pending = false,
  connectionNote = "",
  networkError = "",
  roomCode = "",
  epoch = 0,
  composing = false;
let notice = "",
  noticeError = false,
  historyKey = "";
let localDeadline = 0,
  clockTicker = null,
  warningKey = "";
function stopClock() {
  if (clockTicker !== null) clearInterval(clockTicker);
  clockTicker = null;
}
function remainingMs() {
  if (!game || game.winner !== null) return 0;
  return mode === "local"
    ? Math.max(0, Math.min(TURN_LIMIT_MS, localDeadline - Date.now()))
    : (match?.remainingMs() ?? TURN_LIMIT_MS);
}
function renderClock() {
  if (!game) return;
  const ended = game.winner !== null;
  const ms = remainingMs();
  const seconds = Math.ceil(ms / 1000);
  const paused = Boolean(networkError);
  $("turn-clock").classList.toggle("urgent", !ended && !paused && seconds <= 10);
  $("turn-clock").classList.toggle("finished", ended || paused);
  $("clock-label").textContent = paused ? "停止" : ended ? "終了" : "あと";
  $("time-left").textContent =
    ended || paused ? (game.reason === "timeout" ? "0" : "—") : String(seconds);
  $("time-bar").value = ms / 1000;
  $("turn-clock").setAttribute(
    "aria-label",
    ended
      ? game.reason === "timeout"
        ? "時間切れ"
        : "しりとり終了"
      : paused
        ? "通信が切れたため停止中"
        : `${PLAYERS[game.turn]}の残り時間 ${seconds}秒`,
  );
  const key = `${game.roundId ?? localRound}:${game.history.length}`;
  if (warningKey !== key) {
    warningKey = key;
    $("timer-warning").textContent = "";
  }
  if (!ended && !paused && seconds <= 10 && !$("timer-warning").textContent)
    $("timer-warning").textContent = `${PLAYERS[game.turn]}、あと${seconds}秒だよ。`;
}
function tickClock() {
  if (!game || networkError) return;
  if (mode === "local" && game.winner === null && Date.now() >= localDeadline) {
    game = timeOut(game);
    notice = "";
    noticeError = false;
    render();
    revealResult();
    return;
  }
  renderClock();
  if (game.winner === null) {
    $("word-input").disabled = !canPlay();
    $("send-word").disabled = !canPlay() || !normalize($("word-input").value);
    $("giveup").disabled = !canPlay();
  }
}
function startClock() {
  if (clockTicker === null) clockTicker = setInterval(tickClock, 100);
  tickClock();
}
function setNotice(text = "", error = false) {
  notice = text;
  noticeError = error;
  renderNotice();
}
function canPlay() {
  return (
    game &&
    game.winner === null &&
    remainingMs() > 0 &&
    !pending &&
    !networkError &&
    (mode === "local" || (match && game.turn === seat))
  );
}
function renderNotice() {
  $("notice").textContent =
    networkError ||
    (pending ? "言葉を届けているよ…" : notice) ||
    (canPlay() ? "食べ物・飲み物の名前を、ひとつどうぞ。" : "相手が考えているよ。のんびり待とう。");
  $("notice").classList.toggle("error", Boolean(networkError) || noticeError);
  $("word-input").setAttribute("aria-invalid", String(noticeError));
}
function closeOnline() {
  epoch++;
  match?.close();
  match = null;
  connecting = false;
  pending = false;
  roomCode = "";
  connectionNote = "";
  networkError = "";
}
function menu() {
  stopClock();
  localDeadline = 0;
  warningKey = "";
  closeOnline();
  game = null;
  historyKey = "";
  setNotice();
  $("word-input").value = "";
  $("giveup-dialog").close();
  render();
  $("start").focus({ preventScroll: true });
}
function renderSetup() {
  $("online-setup").hidden = mode !== "online";
  $("join-fields").hidden = roomAction !== "join";
  $("room-waiting").hidden = !connecting;
  $("cancel-connect").hidden = !connecting;
  $("room-code").textContent = roomCode;
  $("online-status").textContent = connectionNote;
  $("room-input").disabled = connecting;
  for (const button of document.querySelectorAll("[data-mode]")) {
    button.disabled = connecting;
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  }
  for (const button of document.querySelectorAll("[data-room]")) {
    button.disabled = connecting;
    button.setAttribute("aria-pressed", String(button.dataset.room === roomAction));
  }
  $("start").disabled = connecting;
  $("start").textContent =
    mode === "local"
      ? "しりとりをはじめる →"
      : connecting
        ? "つながりを待っているよ…"
        : roomAction === "create"
          ? "へやをつくる →"
          : "へやに入る →";
}
function renderHistory() {
  const key = game.history.map((item) => `${item.player}:${item.id}:${item.reading}`).join("|");
  if (key === historyKey) return;
  historyKey = key;
  const list = $("history");
  list.replaceChildren();
  game.history.forEach((word, index) => {
    const li = document.createElement("li");
    li.className = word.player === 1 ? "by-megu" : "";
    const step = document.createElement("span");
    step.className = "step";
    step.textContent = String(index + 1).padStart(2, "0");
    const speaker = document.createElement("span");
    speaker.className = "speaker";
    speaker.textContent = PLAYERS[word.player];
    const spoken = document.createElement("span");
    spoken.className = "spoken";
    spoken.textContent = word.name;
    if (word.name !== word.reading) {
      const reading = document.createElement("small");
      reading.textContent = word.reading;
      spoken.append(reading);
    }
    li.append(step, speaker, spoken);
    list.append(li);
  });
  list.scrollTop = list.scrollHeight;
}
function renderScene() {
  const ended = game.winner !== null;
  const latest = game.history.at(-1);
  $("picnic-scene").dataset.ended = String(ended);
  $("picnic-scene").dataset.turn = String(game.turn);
  for (let p = 0; p < 2; p++) {
    const player = $(`player-${p}`);
    const active = !ended && game.turn === p;
    const won = ended && game.winner === p;
    const spoke = !ended && latest?.player === p;
    player.classList.toggle("current", active);
    player.classList.toggle("winner", won);
    player.classList.toggle("loser", ended && !won);
    player.classList.toggle("spoke", spoke);
    const expression = ended ? (won ? "happy" : "sad") : spoke ? "happy" : "idle";
    const image = $(`player-image-${p}`);
    const src = CHARACTER_ART[p][expression];
    if (image.getAttribute("src") !== src) image.src = src;
    image.dataset.expression = expression;
    image.alt = `${PLAYERS[p]}（${expression === "happy" ? "にっこり" : expression === "sad" ? "しょんぼり" : active ? "考え中" : "わくわく"}）`;
    $(`player-speech-${p}`).textContent = ended
      ? won
        ? "やったぁ！"
        : game.reason === "n"
          ? "あっ、「ん」だ…"
          : game.reason === "timeout"
            ? "あっ、時間だ…"
            : game.reason === "repeat"
              ? "あっ、言ったかも…"
              : "まいった〜"
      : active
        ? game.next
          ? `「${game.next}」から…`
          : "なににしよう？"
        : spoke
          ? latest.name
          : "わくわく♪";
  }
}
function revealResult() {
  $("giveup-dialog").close();
  $("result-title").focus({ preventScroll: true });
  $("picnic-scene").scrollIntoView({
    block: "start",
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
  });
}
function render() {
  $("setup").hidden = game !== null;
  $("game").hidden = game === null;
  const dictionaryLocked = game !== null && game.winner === null;
  $("dictionary").hidden = dictionaryLocked;
  $("dictionary-search").disabled = dictionaryLocked;
  if (dictionaryLocked) {
    $("dictionary").open = false;
    $("dictionary-list").replaceChildren();
    $("search-count").textContent = "";
  }
  document.body.classList.toggle("is-playing", game !== null);
  if (!game) {
    stopClock();
    renderSetup();
    return;
  }
  $("mode-label").textContent = mode === "local" ? "1台で交代" : "通信対戦";
  $("game-room").textContent = roomCode;
  $("leave").textContent = mode === "local" ? "メニューへ" : "へやを出る";
  const ended = game.winner !== null;
  if (ended || networkError) stopClock();
  renderScene();
  for (let p = 0; p < 2; p++) {
    const identity = mode === "online" ? (p === seat ? "あなた · " : "相手 · ") : "";
    $(`player-status-${p}`).textContent =
      identity +
      (ended
        ? game.winner === p
          ? "かち！"
          : "またあそぼう"
        : game.turn === p
          ? "いまの番"
          : "待っているよ");
  }
  $("turn-label").textContent = ended
    ? "おいしいしりとり、おしまい！"
    : `${PLAYERS[game.turn]}の番だよ`;
  const last = game.failed ?? game.history.at(-1);
  $("current-word").textContent = last?.name ?? "すきな言葉から";
  $("current-reading").textContent = last && last.name !== last.reading ? last.reading : "";
  $("next-label").textContent = ended ? "おしまい" : game.next ? "つぎは" : "はじめは";
  $("next-sound").textContent = ended ? "✦" : game.next || "？";
  $("word-form").hidden = ended;
  $("result").hidden = !ended;
  $("word-input").disabled = !canPlay();
  $("send-word").disabled = !canPlay() || !normalize($("word-input").value);
  $("giveup").disabled = !canPlay();
  $("word-input").placeholder = game.next ? `「${game.next}」ではじまる名前` : "例：りんご";
  renderNotice();
  if (ended) {
    $("result-title").textContent = `${PLAYERS[game.winner]}のかち！`;
    $("result-reason").textContent = resultCopy(game);
    const voted = mode === "online" && game.rematch[seat];
    $("rematch").disabled = pending || Boolean(networkError) || voted;
    $("rematch").textContent = networkError
      ? "へやを出て、つなぎ直してね"
      : pending
        ? "届けているよ…"
        : voted
          ? "相手の返事を待っているよ"
          : "もういちどあそぶ ↻";
    $("rematch-note").textContent =
      networkError ||
      (mode === "online"
        ? "ふたりとも「もういちどあそぶ」で、次の勝負へ。"
        : "次は、先に言うハムを交代するよ。");
  }
  // Empty history must also clear after a rematch.
  if (!game.history.length) {
    $("history").replaceChildren();
    historyKey = "";
  } else renderHistory();
  $("word-count").textContent = `${game.history.length}こ`;
  $("empty-history").hidden = game.history.length > 0;
  renderClock();
  if (!ended && !networkError) startClock();
}
function acceptState(next, player) {
  const changed =
    !game ||
    next.roundId !== game.roundId ||
    next.history.length !== game.history.length ||
    next.winner !== game.winner;
  const justEnded = game?.winner === null && next.winner !== null;
  game = next;
  seat = player;
  connecting = false;
  if (changed) {
    $("word-input").value = "";
    notice = "";
    noticeError = false;
  }
  render();
  if (justEnded) revealResult();
}
function startLocal() {
  localRound++;
  game = createGame((localRound - 1) % 2);
  localDeadline = Date.now() + TURN_LIMIT_MS;
  notice = "";
  noticeError = false;
  historyKey = "";
  $("word-input").value = "";
  render();
}
async function connect() {
  if (connecting) return;
  if (!isOnlineConfigured()) {
    connectionNote = "通信の準備がまだできていないみたい。";
    renderSetup();
    return;
  }
  const code =
    roomAction === "create" ? generateRoomCode() : normalizeRoomCode($("room-input").value);
  if (!/^HAMU-[A-Z2-9]{6}$/.test(code)) {
    connectionNote = "HAMU- からはじまる6文字のキーワードを入れてね。";
    renderSetup();
    return;
  }
  closeOnline();
  const attempt = epoch;
  roomCode = code;
  connecting = true;
  connectionNote = roomAction === "create" ? "へやをつくっているよ…" : "へやを探しているよ…";
  renderSetup();
  try {
    const opened = await createShiritoriMatch({
      role: roomAction === "create" ? "host" : "guest",
      roomCode: code,
      onState(next, player) {
        if (attempt === epoch) acceptState(next, player);
      },
      onStatus(status) {
        if (attempt !== epoch) return;
        pending = status === "sending";
        render();
      },
      onReject(text) {
        if (attempt === epoch) setNotice(text, true);
      },
      onError(error) {
        if (attempt !== epoch) return;
        pending = false;
        connecting = false;
        networkError = error.message;
        connectionNote = error.message;
        render();
      },
    });
    if (attempt !== epoch) {
      opened.close();
      return;
    }
    match = opened;
    if (!game) {
      connectionNote =
        roomAction === "create"
          ? "このキーワードを相手に教えてね。待っているよ。"
          : "相手とつないでいるよ…";
    }
    render();
  } catch (error) {
    if (attempt !== epoch) return;
    connecting = false;
    connectionNote = error.message;
    renderSetup();
  }
}
$("start").addEventListener("click", () => (mode === "local" ? startLocal() : void connect()));
for (const button of document.querySelectorAll("[data-mode]"))
  button.addEventListener("click", () => {
    if (connecting) return;
    mode = button.dataset.mode;
    connectionNote = "";
    renderSetup();
  });
for (const button of document.querySelectorAll("[data-room]"))
  button.addEventListener("click", () => {
    if (connecting) return;
    roomAction = button.dataset.room;
    connectionNote = "";
    renderSetup();
  });
$("cancel-connect").addEventListener("click", menu);
$("leave").addEventListener("click", menu);
$("copy-room").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    connectionNote = "コピーしたよ。相手にキーワードを教えてね。";
  } catch {
    connectionNote = "キーワードを長押し・選択してコピーしてね。";
  }
  renderSetup();
});
$("word-input").addEventListener("compositionstart", () => {
  composing = true;
});
$("word-input").addEventListener("compositionend", () => {
  composing = false;
});
$("word-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.isComposing || composing || event.keyCode === 229))
    event.preventDefault();
});
$("word-input").addEventListener("input", () => {
  setNotice();
  $("send-word").disabled = !canPlay() || !normalize($("word-input").value);
});
$("word-form").addEventListener("submit", (event) => {
  event.preventDefault();
  tickClock();
  if (composing || !canPlay()) return;
  const player = mode === "local" ? game.turn : seat;
  const result = playWord(game, player, $("word-input").value);
  if (!result.ok) {
    setNotice(result.message, true);
    return;
  }
  if (mode === "online") {
    match?.submit("word", $("word-input").value);
    return;
  }
  game = result.state;
  if (game.winner === null) localDeadline = Date.now() + TURN_LIMIT_MS;
  $("word-input").value = "";
  setNotice();
  render();
  if (game.winner !== null) revealResult();
  else $("word-input").focus({ preventScroll: true });
});
$("giveup").addEventListener("click", () => {
  tickClock();
  if (canPlay()) $("giveup-dialog").showModal();
});
$("continue-game").addEventListener("click", () => $("giveup-dialog").close());
$("confirm-giveup").addEventListener("click", () => {
  $("giveup-dialog").close();
  tickClock();
  if (!canPlay()) return;
  if (mode === "online") {
    match?.submit("giveup");
    return;
  }
  game = giveUp(game, game.turn);
  render();
  revealResult();
});
$("rematch").addEventListener("click", () => {
  if (mode === "online") match?.submit("rematch");
  else startLocal();
});
const foodList = [...FOODS].sort((a, b) => a.reading.localeCompare(b.reading, "ja"));
function renderDictionary() {
  if ($("dictionary").hidden) return;
  const query = normalize($("dictionary-search").value);
  const matches = foodList.filter((food) =>
    [food.name, food.reading, ...food.aliases.map((a) => a.replace("~", ""))].some((text) =>
      normalize(text).includes(query),
    ),
  );
  $("search-count").textContent = `${matches.length}種類みつかったよ`;
  $("dictionary-list").replaceChildren();
  for (const food of matches) {
    const li = document.createElement("li"),
      name = document.createElement("strong"),
      reading = document.createElement("small");
    name.textContent = food.name;
    reading.textContent = `${food.reading} · ${food.category}`;
    li.append(name, reading);
    if (food.aliases.length) {
      const aliases = document.createElement("small");
      aliases.textContent = `別表記：${food.aliases.map((a) => a.split("~")[0]).join("、")}`;
      li.append(aliases);
    }
    $("dictionary-list").append(li);
  }
}
$("dictionary-count").textContent = `${FOODS.length}種類`;
$("dictionary").addEventListener("toggle", () => {
  if ($("dictionary").open) renderDictionary();
});
$("dictionary-search").addEventListener("input", renderDictionary);
window.addEventListener("pagehide", () => {
  stopClock();
  epoch++;
  match?.close();
  match = null;
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted && mode === "online") {
    pending = false;
    connecting = false;
    networkError = "へやを出て、もう一度つなぎ直してね。";
    connectionNote = networkError;
    render();
  }
  if (event.persisted && mode === "local" && game && game.winner === null) startClock();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) tickClock();
});
render();
