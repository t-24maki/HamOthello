import {
  METALS,
  WINS_TO_WIN,
  createRound,
  nextRound,
  matchResult,
  evaluateHand,
  exchangeCards,
  continueRound,
  finishCpuTurn,
  exchangeCpuPlayers,
  roundResult,
} from "./rules.js?v=poker-dilemma-20261025";
import {
  CHARACTERS,
  tableCharacters,
  expressionDescription,
} from "./characters.js?v=poker-dilemma-20261025";
import { pokerPortrait as portrait } from "./portraits.js?v=poker-uneasy-20261025";
import { createDealer } from "./dealer.js?v=poker-tells-20261025";
import { appendCardArtwork } from "./cards.js?v=poker-cards-20261010";
import {
  createPokerMatch,
  generateRoomCode,
  normalizeRoomCode,
  isOnlineConfigured,
} from "./online.js?v=poker-dilemma-20261025";

const $ = (id) => document.getElementById(id);
const names = Object.fromEntries(CHARACTERS.map((c) => [c.id, c.name]));
let mode = "cpu",
  character = null,
  round = null,
  selected = new Set(),
  changed = new Set();
let seat = 0,
  roomAction = "create",
  roomCode = "",
  onlineMatch = null;
let connecting = false,
  pendingAction = false,
  networkError = "",
  connectionStatus = "",
  networkEpoch = 0;
let lastAction = -Infinity;
let keyboardNavigation = false;
document.addEventListener("keydown", (event) => {
  if (["Tab", "Enter", " "].includes(event.key)) keyboardNavigation = true;
});
document.addEventListener("pointerdown", () => (keyboardNavigation = false), { passive: true });
const self = () => (mode === "online" ? seat : 0);
const canChoose = () => round?.phase === "choose" && !visualBusy && !pendingAction && !networkError;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const opponents = () => (mode === "online" ? [2, 1 - seat, 3] : [2, 1, 3]);
const displayName = (p) => names[round.characters[p]];
const identity = (p) => (p === self() ? "あなた" : mode === "online" && p < 2 ? "相手" : "CPU");

const dealer = createDealer({
  window,
  layer: $("card-flights"),
  deck: $("deck"),
  discard: $("discard"),
});
let visualEpoch = 0,
  visualBusy = false,
  busyTitle = "",
  activeExchange = null;
let onlineViews = [];
function cancelPresentation() {
  visualEpoch++;
  dealer.cancel();
  visualBusy = false;
  activeExchange = null;
  onlineViews = [];
}
function handCards(player, indices = [0, 1, 2]) {
  const cards = [...document.querySelectorAll(`[data-player="${player}"] .playing-card`)];
  return indices.map((i) => cards[i]).filter(Boolean);
}
function beginPresentation(title) {
  visualBusy = true;
  busyTitle = title;
  return ++visualEpoch;
}
function endPresentation(token, focusIndex = null) {
  if (token !== visualEpoch) return;
  visualBusy = false;
  activeExchange = null;
  render();
  const card =
    focusIndex !== null ? $("seat-self").querySelector(`[data-index="${focusIndex}"]`) : null;
  if (card) card.focus({ preventScroll: true });
  else focusTurn();
}
async function playExchange(next, player, indices, token) {
  if (token !== visualEpoch) return false;
  activeExchange = { player, count: indices.length };
  busyTitle = `${displayName(player)}${indices.length ? `が${indices.length}枚チェンジ` : "はチェンジなし"}`;
  render();
  await dealer.fly(handCards(player, indices), "out");
  if (token !== visualEpoch) return false;
  round = next;
  if (player === self()) changed = new Set(indices);
  render();
  await dealer.fly(handCards(player, indices), "in");
  if (token !== visualEpoch) return false;
  activeExchange = null;
  return true;
}
async function runCpuExchange(next, indices) {
  const token = beginPresentation("カードをチェンジしているよ…");
  try {
    if (!(await playExchange(next, 0, indices, token))) return;
    for (const player of opponents()) {
      if (round.exchanges[player] !== null) continue;
      const after = exchangeCpuPlayers(round, [player]);
      const changedCards = after.hands[player].flatMap((card, i) =>
        card.id !== round.hands[player][i].id ? [i] : [],
      );
      if (!(await playExchange(after, player, changedCards, token))) return;
    }
  } finally {
    endPresentation(token);
  }
}
function animateCards(selector, fresh = false) {
  if (reduced()) return;
  document.querySelectorAll(selector).forEach((node, i) =>
    node.animate(
      [
        { transform: fresh ? "translateY(-16px) rotate(5deg)" : "scaleX(.08)", opacity: 0.3 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 330, delay: i * 35, fill: "backwards", easing: "ease-out" },
    ),
  );
}
function animateResult() {
  animateCards(".opponents .playing-card");
  if (reduced()) return;
  const node = document.querySelector(".winner .portrait, .winner .self-face");
  const winner = roundResult(round).winner;
  const lift = round.characters[winner] === "tapi" ? 2 : 7;
  node?.animate(
    [
      { transform: "translateY(0)" },
      { transform: `translateY(-${lift}px)` },
      { transform: "translateY(0)" },
    ],
    { duration: 580, delay: 260, easing: "ease-in-out" },
  );
}
function animateFriends() {
  if (reduced()) return;
  document.querySelectorAll(".scene .tapi-friend").forEach((friend) => {
    const side = friend.classList.contains("tapi-blue") ? -1 : 1;
    friend.animate(
      [
        { transform: `translateX(${side * 24}px)`, opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 650, delay: 180, fill: "backwards", easing: "ease-out" },
    );
  });
}
function focusTurn() {
  // Touch play needs no focus transfer; VoiceOver receives the live status.
  // Keep keyboard navigation useful without triggering Safari's focus scrolling.
  if (keyboardNavigation && !document.querySelector("dialog[open]"))
    $("main-action").focus({ preventScroll: true });
}
async function startCpu(next = createRound("cpu", Math.random, tableCharacters(character))) {
  cancelPresentation();
  round = next;
  seat = 0;
  selected.clear();
  changed.clear();
  $("final-result").close();
  const token = beginPresentation("カードを配っているよ…");
  render();
  animateFriends();
  try {
    await dealer.fly([...document.querySelectorAll(".hand .playing-card")], "in");
  } finally {
    endPresentation(token);
  }
}
function stopOnline() {
  cancelPresentation();
  networkEpoch++;
  onlineMatch?.close();
  onlineMatch = null;
  connecting = false;
  pendingAction = false;
  networkError = "";
  connectionStatus = "";
  roomCode = "";
}
function backToSetup() {
  stopOnline();
  round = null;
  selected.clear();
  changed.clear();
  $("final-result").close();
  render();
  $("characters").querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
}
function showOnlineView(view, player, epoch) {
  if (epoch !== networkEpoch || networkError) return;
  onlineViews.push({ view, player, epoch });
  if (!visualBusy) void drainOnlineViews();
}
async function drainOnlineViews() {
  while (onlineViews.length) {
    const { view, player, epoch } = onlineViews.shift();
    if (epoch !== networkEpoch || networkError) return;
    seat = player;
    pendingAction = false;
    const next = {
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
    const opening = !round || round.matchId !== next.matchId || round.roundId !== next.roundId;
    const reveal = next.phase === "result" && round?.phase !== "result";
    const focusIndex = document.activeElement?.matches(":focus-visible")
      ? (document.activeElement.dataset.index ?? null)
      : null;
    const before = round;
    const exchanged = opening
      ? [2, 3]
      : [0, 1, 2, 3].filter((p) => before.exchanges[p] === null && next.exchanges[p] !== null);
    if (opening || next.phase !== "choose") selected.clear();
    if (opening) {
      $("final-result").close();
      changed.clear();
    }
    const token = beginPresentation(opening ? "カードを配っているよ…" : "カードを合わせているよ…");
    try {
      if (opening) {
        round = next;
        render();
        animateFriends();
        await dealer.fly([...document.querySelectorAll(".hand .playing-card")], "in");
        if (token !== visualEpoch) return;
      }
      for (const p of exchanged) {
        const indices =
          !opening && p === player
            ? next.hands[p].flatMap((card, i) => (card.id !== before.hands[p][i].id ? [i] : []))
            : Array.from({ length: next.exchanges[p] }, (_, i) => i);
        if (!(await playExchange(next, p, indices, token))) return;
      }
      if (token !== visualEpoch) return;
      round = next;
      render();
    } finally {
      endPresentation(token, next.phase === "choose" ? focusIndex : null);
    }
    if (reveal && token === visualEpoch) animateResult();
  }
}
async function connectOnline() {
  if (connecting || !character) return;
  onlineMatch?.close();
  const epoch = ++networkEpoch;
  networkError = "";
  pendingAction = false;
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
      character,
      onStatus(status) {
        if (epoch !== networkEpoch) return;
        pendingAction = status === "sending";
        if (status === "connected") connectionStatus = "ふたり、そろったよ！";
        if (!visualBusy) render();
      },
      onView(view, player) {
        showOnlineView(view, player, epoch);
      },
      onError(error) {
        if (epoch !== networkEpoch) return;
        cancelPresentation();
        networkError = error.message;
        connectionStatus = error.message;
        pendingAction = false;
        connecting = false;
        render();
      },
    });
    if (epoch !== networkEpoch) {
      match.close();
      return;
    }
    onlineMatch = match;
    if (!round && !networkError) {
      connectionStatus =
        roomAction === "create"
          ? "このキーワードを相手に教えてね。待っているよ。"
          : "相手とつないでいるよ…";
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
function stars(wins) {
  return `<div class="win-stars" role="img" aria-label="${wins}勝、${WINS_TO_WIN}勝で優勝">${Array.from({ length: WINS_TO_WIN }, (_, i) => `<span aria-hidden="true" class="${i < wins ? "earned" : ""}">★</span>`).join("")}<b aria-hidden="true">${wins}勝</b></div>`;
}
function drawHand(container, hand, own, result) {
  const secret = !own && !result;
  (hand ?? [null, null, null]).forEach((card, i) => {
    const slot = document.createElement("div");
    slot.className = "card-slot";
    const interactive = own && canChoose();
    const node = document.createElement(interactive ? "button" : "div");
    node.className = `playing-card ${secret ? "card-back" : card.metal}`;
    node.setAttribute(
      "aria-label",
      secret
        ? "裏向きのカード"
        : `${METALS[card.metal].name}の${card.value}${interactive ? (selected.has(i) ? "、チェンジする" : "、キープする") : ""}`,
    );
    if (!interactive) node.setAttribute("role", "img");
    appendCardArtwork(node, secret ? null : card);
    if (interactive) {
      node.type = "button";
      node.dataset.index = i;
      node.classList.toggle("is-selected", selected.has(i));
      node.setAttribute("aria-pressed", String(selected.has(i)));
      const label = document.createElement("span");
      label.className = "card-choice";
      label.textContent = selected.has(i) ? "✓ チェンジ" : "キープ";
      node.append(label);
      node.addEventListener("click", () => {
        if (!canChoose()) return;
        if (selected.has(i)) selected.delete(i);
        else selected.add(i);
        node.classList.toggle("is-selected", selected.has(i));
        node.setAttribute("aria-pressed", String(selected.has(i)));
        node.setAttribute(
          "aria-label",
          `${METALS[card.metal].name}の${card.value}、${selected.has(i) ? "チェンジする" : "キープする"}`,
        );
        label.textContent = selected.has(i) ? "✓ チェンジ" : "キープ";
        renderControls();
      });
    }
    if (own && round.phase === "review" && changed.has(i)) node.classList.add("fresh-card");
    slot.append(node);
    container.append(slot);
  });
}
function renderSeat(id, p, result) {
  const node = $(id),
    own = p === self(),
    won = result?.winner === p;
  node.replaceChildren();
  node.dataset.player = p;
  node.classList.toggle("winner", won);
  const heading = document.createElement("div");
  heading.className = "seat-heading";
  heading.innerHTML = `<h2 class="seat-name">${displayName(p)}${own ? "" : `<small>${identity(p)}</small>`}</h2>${stars(round.wins[p])}`;
  const pose = result ? (won ? "win" : "lose") : round.expressions[p];
  const avatar = document.createElement("div");
  avatar.className = own ? "self-face" : "portrait";
  avatar.setAttribute("role", "img");
  avatar.setAttribute(
    "aria-label",
    `${displayName(p)}、${result ? (won ? "勝利ポーズ" : "敗北ポーズ") : expressionDescription(round.characters[p], round.expressions[p])}`,
  );
  avatar.innerHTML = portrait(round.characters[p], pose, round.expressions[p] === "friends", own);
  const hand = document.createElement("div");
  hand.className = "hand";
  hand.setAttribute("aria-label", `${identity(p)}の手札`);
  drawHand(hand, round.hands[p], own, result);
  const role = document.createElement("div");
  role.className = "seat-role";
  if (own || result) {
    const badge = document.createElement("span");
    badge.className = "role-pill";
    badge.textContent = evaluateHand(round.hands[p]).name;
    role.append(badge);
    if (won) {
      const mark = document.createElement("small");
      mark.textContent = "勝ち！";
      role.append(mark);
    }
  } else {
    const count = round.exchanges[p];
    role.textContent =
      activeExchange?.player === p
        ? activeExchange.count
          ? `${activeExchange.count}枚チェンジ中…`
          : "チェンジなし"
        : count === null
          ? "考え中…"
          : count === 0
            ? "チェンジなし"
            : `${count}枚チェンジ済み`;
  }
  if (own) {
    const panel = document.createElement("div");
    panel.className = "player-panel";
    panel.setAttribute("aria-label", "あなたのプレイヤー情報");
    const label = document.createElement("div");
    label.className = "player-label";
    label.textContent = "あなた";
    panel.append(label, avatar, heading);
    node.append(panel, hand, role);
  } else node.append(heading, avatar, hand, role);
}
function renderSetup() {
  $("online-setup").hidden = mode !== "online";
  $("join-fields").hidden = roomAction !== "join";
  $("room-waiting").hidden = !connecting || roomAction !== "create";
  $("cancel-connection").hidden = !connecting;
  $("room-display").textContent = roomCode;
  $("online-status").textContent = connectionStatus;
  $("deal").disabled = connecting || !character;
  $("deal").textContent = !character
    ? "キャラを選んでね"
    : connecting
      ? "つながりを待っているよ…"
      : mode === "cpu"
        ? `${names[character]}であそぶ`
        : roomAction === "create"
          ? "へやをつくる"
          : "へやに入る";
  $("room-input").disabled = connecting;
  for (const button of document.querySelectorAll(
    "[data-mode], [data-room-action], [data-character]",
  )) {
    button.disabled = connecting;
    const active = button.dataset.mode
      ? button.dataset.mode === mode
      : button.dataset.roomAction
        ? button.dataset.roomAction === roomAction
        : button.dataset.character === character;
    button.setAttribute("aria-pressed", String(active));
  }
}
function updateFinal() {
  const final = matchResult(round);
  if (!final) return;
  $("final-title").textContent = `${displayName(final.winner)}の優勝！`;
  $("final-note").textContent = `${round.roundNumber}回戦で、3勝に到達！`;
  $("final-ranking").innerHTML = [0, 1, 2, 3]
    .sort((a, b) => round.wins[b] - round.wins[a])
    .map(
      (p) =>
        `<li><span>${1 + round.wins.filter((w) => w > round.wins[p]).length}</span><span class="final-portrait">${portrait(round.characters[p], p === final.winner ? "win" : "lose", round.expressions[p] === "friends")}</span><span>${displayName(p)}<small>（${identity(p)}）</small></span><b>${round.wins[p]}勝</b></li>`,
    )
    .join("");
  $("rematch").disabled =
    pendingAction || Boolean(networkError) || (mode === "online" && round.proceed[self()]);
  $("rematch").textContent = networkError
    ? "通信が切れました。卓からへやを出てね"
    : mode === "online" && round.proceed[self()]
      ? "相手の返事を待っているよ"
      : "もう一度対戦する";
}
function render() {
  const entering = round !== null && !document.body.classList.contains("playing");
  $("setup").hidden = round !== null;
  $("game").hidden = round === null;
  $("settings").hidden = round === null;
  $("match-info").hidden = round === null;
  document.body.classList.toggle("playing", round !== null);
  if (entering) window.scrollTo({ top: 0, behavior: "instant" });
  if (!round) {
    renderSetup();
    return;
  }
  $("settings").textContent = mode === "online" ? "へやを出る" : "キャラを選ぶ";
  $("mode-label").textContent = mode === "online" ? "ふたり＋CPU2匹" : "あなた＋CPU3匹";
  $("game").classList.toggle("choosing", canChoose());
  $("discard").classList.toggle(
    "has-cards",
    (round.discardCount ?? round.discards?.length ?? 0) > 0,
  );
  const result = roundResult(round),
    final = matchResult(round);
  $("game").classList.toggle("is-result", Boolean(result));
  opponents().forEach((p, i) => renderSeat(["seat-left", "seat-top", "seat-right"][i], p, result));
  renderSeat("seat-self", self(), result);
  $("match-round").textContent = `第${round.roundNumber}回戦`;
  renderControls();
  if (final) updateFinal();
}
function renderControls() {
  const result = roundResult(round),
    final = matchResult(round);
  let title = "",
    hint = "",
    label = "",
    note = "";
  const button = $("main-action");
  button.disabled = visualBusy || pendingAction || Boolean(networkError);
  if (round.phase === "choose") {
    title = "チェンジするカードを選んでね";
    hint = "タップで選ぶ・もう一度タップで取り消し。";
    label = selected.size ? `${selected.size}枚チェンジする` : "この3枚で勝負";
    note = selected.size
      ? `${selected.size}枚えらんだよ。チェンジは1回だけ。`
      : "チェンジせず、そのまま勝負もできるよ。";
  } else if (round.phase === "review") {
    title = mode === "cpu" ? "みんな、手札がそろったよ！" : "この3枚で、いくよ！";
    hint = "チェンジはおしまい。どんな役になったかな？";
    label = mode === "online" ? "この手札で、準備OK！" : "みんなで役くらべ！";
    note =
      mode === "online"
        ? "ふたりが準備OKになったら、手札をひらくよ。"
        : "4匹のカードをひらいて、答え合わせ。";
  } else if (result) {
    title = `${displayName(result.winner)}の勝ち！`;
    hint = result.reason;
    label = final ? "最終結果を見る" : "次の勝負へ";
    note = final
      ? `${displayName(final.winner)}が3勝！ 優勝が決まったよ。`
      : `次は第${round.roundNumber + 1}回戦。先に3勝で優勝！`;
    if (!final && mode === "online" && round.proceed[self()]) {
      button.disabled = true;
      label = "相手の返事を待っているよ";
      note = "ふたりとも「次の勝負へ」で次の回戦へ。";
    } else if (!final && mode === "online" && round.proceed[1 - self()])
      note = "相手は次の勝負を待っているよ。";
  } else {
    title = mode === "online" ? "準備、できたよ！" : "みんなが手札を決めているよ…";
    hint =
      mode === "online" ? "相手が準備OKになるまで待ってね。" : "どんなカードを持っているかな？";
    label = "みんなを待っているよ…";
    button.disabled = true;
    note = "準備がそろったら、手札をひらくよ。";
  }
  if (visualBusy) {
    title = busyTitle;
    hint = "山札から、新しいカードを受け取るよ。";
    label = "カードを並べているよ…";
    note = "交換が済んだら、手札をひらこう。";
  }
  if (pendingAction) {
    label = "届けているよ…";
    note = "相手の画面と合わせているよ。";
  }
  if (networkError) {
    title = "通信が切れたみたい";
    hint = networkError;
    label = "へやを出て、つなぎ直してね";
    note = "「へやを出る」から戻れます。";
  }
  $("turn-title").textContent = title;
  $("turn-hint").textContent = hint;
  button.textContent = label;
  $("selection-note").textContent = note;
}
function doMainAction() {
  if (!round || visualBusy || pendingAction || networkError) return;
  if (round.phase === "result" && matchResult(round)) {
    updateFinal();
    $("final-result").showModal();
    return;
  }
  if (mode === "online") {
    const type =
      round.phase === "choose"
        ? "exchange"
        : round.phase === "review"
          ? "ready"
          : round.phase === "result"
            ? "next"
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
    if (!next) return;
    const indices = [...selected];
    selected.clear();
    void runCpuExchange(next, indices);
  } else if (round.phase === "review") {
    round = finishCpuTurn(continueRound(round));
    changed.clear();
    render();
    animateResult();
    focusTurn();
  } else if (round.phase === "result") startCpu(nextRound(round));
}
function onAction(id, action) {
  $(id).addEventListener("click", () => {
    if ($(id).disabled) return;
    const now = performance.now();
    if (["main-action", "rematch", "deal"].includes(id)) {
      if (now - lastAction < 420) return;
      lastAction = now;
    }
    action();
  });
}
for (const c of CHARACTERS) {
  const friend = document.createElement("div");
  friend.innerHTML = portrait(c.id);
  $("invitation-friends").append(friend);
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.character = c.id;
  button.setAttribute("aria-pressed", "false");
  button.setAttribute("aria-label", c.name);
  button.innerHTML = `${portrait(c.id)}<span>${c.name}</span>`;
  button.addEventListener("click", () => {
    if (!connecting) {
      character = c.id;
      renderSetup();
    }
  });
  $("characters").append(button);
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
onAction("deal", () => {
  if (!character) return;
  if (mode === "cpu") {
    startCpu();
  } else void connectOnline();
});
onAction("show-rules", () => $("rules").showModal());
onAction("close-rules", () => $("rules").close());
onAction("settings", backToSetup);
onAction("main-action", doMainAction);
onAction("rematch", () => {
  if (mode === "online") sendOnlineAction("rematch");
  else startCpu();
});
onAction("close-final", () => $("final-result").close());
onAction("cancel-connection", () => {
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
$("room-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !connecting) void connectOnline();
});
for (const node of [$("scene"), document.querySelector(".console")])
  node.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) dealer.finish();
});
window.addEventListener("resize", () => dealer.finish());
window.addEventListener("pagehide", () => {
  dealer.finish();
  onlineMatch?.close();
});
window.addEventListener("pageshow", (e) => {
  if (e.persisted && mode === "online" && round) {
    networkError = "へやを出て、もう一度つなぎ直してね。";
    render();
  }
});
render();
