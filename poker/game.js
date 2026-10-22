import {
  METALS,
  MATCH_ROUNDS,
  WINS_TO_WIN,
  createRound,
  nextRound,
  matchResult,
  evaluateHand,
  exchangeCards,
  continueRound,
  finishCpuTurn,
  roundResult,
} from "./rules.js?v=poker-scoreboard-20261022";
import { createDealer } from "./dealer.js?v=poker-table-20260908";
import { appendCardArtwork } from "./cards.js?v=poker-cards-20261010";
import {
  createPokerMatch,
  generateRoomCode,
  normalizeRoomCode,
  isOnlineConfigured,
} from "./online.js?v=poker-scoreboard-20261022";

const $ = (id) => document.getElementById(id);
for (const node of document.querySelectorAll("[data-sample-metal]")) {
  appendCardArtwork(node, { metal: node.dataset.sampleMetal, value: 7 });
}
const players = [
  { name: "たくハム", image: "../assets/pink-piece.png" },
  { name: "めぐハム", image: "../assets/cream-piece.png" },
];
let mode = "cpu",
  round = null,
  selected = new Set(),
  changed = new Set(),
  cpuTimer = null;
let isDealing = false,
  dealVersion = 0;
let seat = 0,
  roomAction = "create",
  roomCode = "",
  onlineMatch = null;
let connecting = false,
  pendingAction = false,
  networkError = "",
  connectionStatus = "",
  networkEpoch = 0;
let viewQueue = Promise.resolve();
const dealer = createDealer({
  window,
  layer: $("card-flight-layer"),
  deck: $("draw-pile"),
  discard: $("discard-pile"),
});
const self = () => (mode === "online" ? seat : 0);
const canChoose = () => round?.phase === "choose" && !isDealing && !pendingAction && !networkError;

function cancelDeal() {
  dealVersion++;
  dealer.cancel();
  isDealing = false;
}
function cancelCpu() {
  if (cpuTimer !== null) window.clearTimeout(cpuTimer);
  cpuTimer = null;
}
function handCards(id, indices = [0, 1, 2]) {
  return indices.map((index) => $(id).children[index]);
}
function focusTurn() {
  $("turn-title").focus({ preventScroll: true });
}
async function dealOpening(next) {
  const version = ++dealVersion;
  isDealing = true;
  round = next;
  render();
  const own = handCards("self-hand"),
    other = handCards("opponent-hand");
  await dealer.fly(
    own.flatMap((card, index) => [other[index], card]),
    "in",
  );
  if (version !== dealVersion) return;
  isDealing = false;
  render();
  focusTurn();
}
async function dealExchange(next, handId, indices) {
  const version = ++dealVersion;
  isDealing = true;
  render();
  await dealer.fly(handCards(handId, indices), "out");
  if (version !== dealVersion) return;
  round = next;
  selected.clear();
  changed = new Set(handId === "self-hand" ? indices : []);
  render();
  await dealer.fly(handCards(handId, indices), "in");
  if (version !== dealVersion) return;
  isDealing = false;
  render();
  focusTurn();
}
function startCpu(next = createRound("cpu")) {
  cancelCpu();
  cancelDeal();
  selected.clear();
  changed.clear();
  void dealOpening(next);
}
function stopOnline() {
  networkEpoch++;
  onlineMatch?.close();
  onlineMatch = null;
  connecting = false;
  pendingAction = false;
  networkError = "";
  connectionStatus = "";
  roomCode = "";
  viewQueue = Promise.resolve();
}
function backToSetup() {
  cancelCpu();
  cancelDeal();
  stopOnline();
  round = null;
  selected.clear();
  changed.clear();
  render();
  $("deal").focus();
}
function refresh() {
  if (!isDealing) render();
}
function fromView(view, player) {
  return {
    ...view,
    mode: "online",
    phase:
      view.phase === "result"
        ? "result"
        : view.exchanges[player] === null
          ? "choose"
          : view.ready[player]
            ? "waiting"
            : "review",
  };
}
async function showOnlineView(view, player, epoch) {
  if (epoch !== networkEpoch || networkError) return;
  seat = player;
  pendingAction = false;
  const next = fromView(view, player);
  if (!round || round.matchId !== next.matchId || round.roundId !== next.roundId) {
    cancelDeal();
    selected.clear();
    changed.clear();
    await dealOpening(next);
  } else {
    const indices = next.hands[player].flatMap((card, index) =>
      card.id !== round.hands[player][index].id ? [index] : [],
    );
    if (indices.length) await dealExchange(next, "self-hand", indices);
    else {
      const previousPhase = round.phase;
      round = next;
      if (next.phase !== "choose") selected.clear();
      render();
      if (previousPhase !== next.phase) focusTurn();
    }
  }
}
async function connectOnline() {
  if (connecting) return;
  onlineMatch?.close();
  const epoch = ++networkEpoch;
  networkError = "";
  pendingAction = false;
  viewQueue = Promise.resolve();
  roomCode =
    roomAction === "create" ? generateRoomCode() : normalizeRoomCode($("room-input").value);
  if (!/^HAMU-[A-Z2-9]{6}$/.test(roomCode)) {
    connectionStatus = "へやのキーワードを6文字で入力してね。";
    renderSetup();
    return;
  }
  if (!isOnlineConfigured()) {
    connectionStatus = "通信の接続設定を確認してね。";
    renderSetup();
    return;
  }
  connecting = true;
  connectionStatus = roomAction === "create" ? "へやをつくっているよ…" : "へやを探しているよ…";
  renderSetup();
  try {
    const match = await createPokerMatch({
      role: roomAction === "create" ? "host" : "guest",
      roomCode,
      onStatus(status) {
        if (epoch !== networkEpoch) return;
        pendingAction = status === "sending";
        if (status === "connected") connectionStatus = "ふたり、そろったよ！";
        refresh();
      },
      onView(view, player) {
        viewQueue = viewQueue
          .then(() => showOnlineView(view, player, epoch))
          .catch((error) => {
            if (epoch !== networkEpoch) return;
            networkError = error.message;
            pendingAction = false;
            cancelDeal();
            render();
          });
      },
      onError(error) {
        if (epoch !== networkEpoch) return;
        networkError = error.message;
        connectionStatus = error.message;
        pendingAction = false;
        connecting = false;
        cancelDeal();
        render();
      },
    });
    if (epoch !== networkEpoch) {
      match.close();
      return;
    }
    onlineMatch = match;
    if (!round && !networkError) {
      connectionStatus = "このキーワードを相手に教えてね。待っているよ。";
      renderSetup();
    }
  } catch (error) {
    if (epoch !== networkEpoch) return;
    connecting = false;
    connectionStatus = error.message;
    renderSetup();
  }
}
function sendOnlineAction(type, indices) {
  if (!onlineMatch || pendingAction || networkError) return;
  pendingAction = true;
  render();
  if (!onlineMatch.submit(type, indices)) {
    pendingAction = false;
    networkError = "通信を確認できませんでした。へやを出て、つなぎ直してね。";
    render();
  }
}

function drawHand(container, hand, { secret = false, interactive = false, fresh = false } = {}) {
  container.replaceChildren();
  hand.forEach((card, index) => {
    const node = document.createElement(interactive ? "button" : "div");
    if (secret) {
      node.className = "playing-card card-back";
      node.setAttribute("aria-label", "裏向きのカード");
      appendCardArtwork(node);
    } else {
      node.className = `playing-card ${card.metal}`;
      node.setAttribute(
        "aria-label",
        `${METALS[card.metal].name}の${card.value}${interactive ? (selected.has(index) ? "、チェンジする" : "、キープする") : ""}`,
      );
      appendCardArtwork(node, card);
      if (interactive) {
        node.type = "button";
        node.dataset.index = index;
        node.classList.toggle("is-selected", selected.has(index));
        node.setAttribute("aria-pressed", String(selected.has(index)));
        const label = document.createElement("span");
        label.className = "card-choice";
        label.textContent = selected.has(index) ? "↻ チェンジ" : "キープ";
        node.append(label);
        node.addEventListener("click", () => {
          if (!canChoose()) return;
          if (selected.has(index)) selected.delete(index);
          else selected.add(index);
          render();
          $("self-hand").querySelector(`[data-index="${index}"]`).focus({ preventScroll: true });
        });
      }
      if (fresh && changed.has(index)) node.classList.add("fresh-card");
    }
    container.append(node);
  });
}

function playerPanel(prefix, index, result) {
  $(`${prefix}-name`).textContent = players[index].name;
  $(`${prefix}-image`).src = players[index].image;
  const identity = index === self() ? "あなた" : mode === "cpu" ? "CPU" : "相手";
  const count = round.exchanges[index];
  $(`${prefix}-status`).textContent =
    `${identity} · ${count === null ? "あと1回チェンジ" : count === 0 ? "チェンジなし" : `${count}枚チェンジ`}`;
  $(prefix).classList.toggle("is-winner", result?.winner === index);
  const role = $(`${prefix}-role`);
  role.hidden = isDealing || (prefix === "opponent" && !result);
  role.textContent = role.hidden ? "" : evaluateHand(round.hands[index]).name;
}
function renderSetup() {
  $("online-setup").hidden = mode !== "online";
  $("join-fields").hidden = roomAction !== "join";
  $("room-waiting").hidden = !connecting;
  $("cancel-connection").hidden = !connecting;
  $("room-display").textContent = roomCode;
  $("online-status").textContent = connectionStatus;
  $("deal").disabled = connecting;
  $("deal").textContent =
    mode === "cpu"
      ? "カードを配る →"
      : connecting
        ? "つながりを待っているよ…"
        : roomAction === "create"
          ? "へやをつくる →"
          : "へやに入る →";
  $("room-input").disabled = connecting;
  for (const button of document.querySelectorAll("[data-mode]")) {
    button.disabled = connecting;
    button.classList.toggle("selected", button.dataset.mode === mode);
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  }
  for (const button of document.querySelectorAll("[data-room-action]")) {
    button.disabled = connecting;
    button.classList.toggle("selected", button.dataset.roomAction === roomAction);
    button.setAttribute("aria-pressed", String(button.dataset.roomAction === roomAction));
  }
}
function renderScoreboard(final) {
  $("match-round").textContent = final ? "対戦終了" : `第${round.roundNumber}回戦`;
  $("score-head").innerHTML = `<tr><th scope="col">対戦成績</th>${Array.from(
    { length: MATCH_ROUNDS },
    (_, i) =>
      `<th scope="col"${i + 1 === round.roundNumber ? ' class="current-round"' : ""}>${i + 1}<span class="sr-only">回戦</span></th>`,
  ).join("")}<th scope="col">勝数</th></tr>`;
  $("score-rows").innerHTML = players
    .map((player, p) => {
      const champion = final?.winner === p;
      const cells = Array.from({ length: MATCH_ROUNDS }, (_, i) => {
        const played = i < round.history.length;
        const winner = round.history[i];
        const current = !final && i + 1 === round.roundNumber && !played;
        const result = !played
          ? current
            ? "対戦中"
            : final
              ? "未実施"
              : "未対戦"
          : winner === null
            ? "引き分け"
            : winner === p
              ? "勝ち"
              : "負け";
        const mark = !played ? "—" : winner === null ? "△" : winner === p ? "○" : "×";
        return `<td class="score-cell ${played ? (winner === p ? "won" : "lost") : current ? "current-round" : "unplayed"}" aria-label="${i + 1}回戦：${result}">${mark}</td>`;
      }).join("");
      return `<tr class="${p === 0 ? "tak-score" : "meg-score"}${champion ? " champion" : ""}"><th scope="row">${player.name}</th>${cells}<td class="score-total"><strong>${round.wins[p]}</strong></td></tr>`;
    })
    .join("");
  $("match-outcome").classList.toggle("is-final", Boolean(final));
  $("match-outcome").textContent = final
    ? final.winner === null
      ? "対戦終了 · 引き分け"
      : `優勝　${players[final.winner].name}！`
    : `○ 勝ち　× 負け　·　先に${WINS_TO_WIN}勝で優勝`;
}
function render() {
  $("setup").hidden = round !== null;
  $("game").hidden = round === null;
  document.body.classList.toggle("is-playing", round !== null);
  $("game").classList.toggle("is-dealing", isDealing);
  $("game").classList.toggle("is-result", !isDealing && round?.phase === "result");
  if (isDealing) $("game").setAttribute("aria-busy", "true");
  else $("game").removeAttribute("aria-busy");
  if (!round) {
    renderSetup();
    return;
  }
  $("mode-label").textContent = mode === "cpu" ? "CPU対戦" : "通信対戦";
  $("table-room-code").textContent = mode === "online" ? roomCode : "";
  $("settings").textContent = mode === "online" ? "へやを出る" : "メニューへ";
  $("deck-count").textContent = round.deckCount ?? round.deck.length;
  $("discard-count").textContent = round.discardCount ?? round.discards.length;
  $("discard-back").hidden = (round.discardCount ?? round.discards.length) === 0;
  const result = isDealing ? null : roundResult(round);
  const final = isDealing ? null : matchResult(round);
  renderScoreboard(final);
  $("round-context").textContent = `第${round.roundNumber}回戦${result ? "の結果" : ""}`;
  const active = self(),
    rival = 1 - active;
  playerPanel("self", active, result);
  playerPanel("opponent", rival, result);
  drawHand($("opponent-hand"), round.hands[rival] ?? [null, null, null], { secret: !result });
  drawHand($("self-hand"), round.hands[active], {
    interactive: canChoose(),
    fresh: round.phase === "review" && !isDealing,
  });
  const button = $("main-action");
  button.disabled = isDealing || pendingAction || Boolean(networkError);
  let note = "",
    label = "";
  if (round.phase === "choose") {
    label = selected.size ? `${selected.size}枚チェンジする` : "この3枚で勝負";
    note = selected.size
      ? `${selected.size}枚えらんだよ。もう一度タップで取り消せるよ。`
      : "チェンジしないで、そのまま勝負もできるよ。";
  } else if (round.phase === "review") {
    label = mode === "online" ? "この手札で、準備OK！" : "ふたりで役くらべ！";
    note = "チェンジはおしまい。この手札でいくよ。";
  } else if (round.phase === "result") {
    label = final ? "もう一度対戦する ↻" : "次の勝負へ →";
    note = final
      ? "勝数をリセットして、新しい対戦へ。"
      : `次は第${round.roundNumber + 1}回戦。先に${WINS_TO_WIN}勝で優勝！`;
    if (mode === "online" && round.proceed[active]) {
      button.disabled = true;
      label = "相手の返事を待っているよ";
      note = final ? "相手も「もう一度対戦する」で再戦。" : "相手も「次の勝負へ」で次の回戦へ。";
    } else if (mode === "online" && round.proceed[rival])
      note = final ? "相手が、もう一度対戦したいみたい。" : "相手は次の勝負を待っているよ。";
  } else {
    button.disabled = true;
    label = "相手を待っているよ…";
    note =
      mode === "online"
        ? "相手も準備OKになったら、手札をひらくよ。"
        : "めぐハムもチェンジしているよ。";
  }
  if (isDealing) {
    label = "配っているよ…";
    note = "1枚ずつ、お届けするよ。";
  } else if (pendingAction) {
    label = "届けているよ…";
    note = "相手の画面と合わせているよ。";
  }
  if (networkError) {
    note = networkError;
    label = "へやを出て、つなぎ直してね";
  }
  button.textContent = label;
  $("selection-note").textContent = note;
  if (isDealing) {
    $("turn-title").textContent = "カードを、すーっと…";
    $("turn-hint").textContent = "もうすぐ手札がそろうよ。";
  } else if (result) {
    $("turn-title").textContent =
      result.winner === null ? "この勝負は引き分け！" : `${players[result.winner].name}の勝ち！`;
    $("turn-hint").textContent = result.reason;
  } else if (round.phase === "choose") {
    $("turn-title").textContent = `${players[active].name}の番だよ`;
    $("turn-hint").textContent = "カードをタップして選んでね。";
  } else if (round.phase === "review") {
    $("turn-title").textContent = changed.size ? "この3枚がそろったよ！" : "この3枚で、いくよ！";
    $("turn-hint").textContent =
      mode === "online" ? "決まったら「準備OK！」を押してね。" : "どんな役になったかな？";
  } else {
    $("turn-title").textContent = mode === "online" ? "準備、できたよ！" : "めぐハムが、うーん…";
    $("turn-hint").textContent =
      mode === "online"
        ? "相手が手札を決めるのを待っているよ。"
        : "チェンジするカードをえらんでいるよ。";
  }
}
for (const button of document.querySelectorAll("[data-mode]"))
  button.addEventListener("click", () => {
    if (connecting) return;
    mode = button.dataset.mode;
    connectionStatus = "";
    networkError = "";
    renderSetup();
  });
for (const button of document.querySelectorAll("[data-room-action]"))
  button.addEventListener("click", () => {
    if (connecting) return;
    roomAction = button.dataset.roomAction;
    connectionStatus = "";
    renderSetup();
  });
$("deal").addEventListener("click", () => {
  if (mode === "cpu") startCpu();
  else void connectOnline();
});
$("settings").addEventListener("click", backToSetup);
$("cancel-connection").addEventListener("click", () => {
  stopOnline();
  renderSetup();
});
$("copy-room").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    connectionStatus = "コピーしたよ。相手にキーワードを教えてね。";
  } catch {
    connectionStatus = "キーワードを長押ししてコピーしてね。";
  }
  renderSetup();
});
$("room-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !connecting) void connectOnline();
});
$("main-action").addEventListener("click", () => {
  if (!round || isDealing || pendingAction || networkError) return;
  if (mode === "online") {
    const type =
      round.phase === "choose"
        ? "exchange"
        : round.phase === "review"
          ? "ready"
          : round.phase === "result"
            ? matchResult(round)
              ? "rematch"
              : "next"
            : null;
    if (type)
      sendOnlineAction(
        type,
        [...selected].sort((a, b) => a - b),
      );
    return;
  }
  if (round.phase === "choose") {
    const next = exchangeCards(round, [...selected]);
    if (next)
      void dealExchange(
        next,
        "self-hand",
        [...selected].sort((a, b) => a - b),
      );
  } else if (round.phase === "review") {
    const next = continueRound(round);
    if (!next) return;
    round = next;
    selected.clear();
    changed.clear();
    render();
    focusTurn();
    const expected = round;
    cpuTimer = window.setTimeout(() => {
      cpuTimer = null;
      if (round !== expected) return;
      const next = finishCpuTurn(round);
      const indices = next.hands[1].flatMap((card, i) =>
        card.id !== round.hands[1][i].id ? [i] : [],
      );
      void dealExchange(next, "opponent-hand", indices);
    }, 550);
  } else if (round.phase === "result")
    startCpu(matchResult(round) ? createRound("cpu") : nextRound(round));
});
window.addEventListener("resize", () => dealer.finish());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) dealer.finish();
});
window.addEventListener("pagehide", () => {
  onlineMatch?.close();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted && mode === "online") {
    networkError = "へやを出て、もう一度つなぎ直してね。";
    cancelDeal();
    render();
  }
});
render();
