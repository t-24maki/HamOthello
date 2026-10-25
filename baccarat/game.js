import {
  CHARACTERS,
  createMatch,
  nextRound,
  decideRound,
  revealRound,
  viewFor,
  chooseCpu,
} from "./rules.js?v=20261024-baccarat5";
import { portrait } from "./art.js?v=20261024-baccarat4";
import { appendCardArtwork } from "../poker/cards.js?v=poker-cards-20261010";

const $ = (id) => document.getElementById(id);
let character = null,
  match = null,
  cpuTimer = null;
let lastAction = -Infinity;
const names = Object.fromEntries(CHARACTERS.map((c) => [c.id, c.name]));
const coin = '<span class="coin" aria-hidden="true"></span>';
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function cardElement(card, label, empty = false) {
  const wrapper = document.createElement("div");
  wrapper.className = `card-slot${empty ? " empty" : ""}`;
  const face = document.createElement("div");
  face.className = `playing-card ${empty ? "card-space" : card ? card.metal : "card-back"}`;
  if (!empty) {
    face.setAttribute("role", "img");
    face.setAttribute(
      "aria-label",
      card
        ? `${{ gold: "金", silver: "銀", bronze: "銅" }[card.metal]}の${card.value}、${label}`
        : `${label}、裏向き`,
    );
    appendCardArtwork(face, card);
  } else {
    face.setAttribute("aria-hidden", "true");
  }
  wrapper.append(face);
  return wrapper;
}

function renderSeat(player, index, view) {
  const node = $(`seat-${index}`),
    own = index === 0,
    result = view.phase === "result";
  const won = result && view.winners.includes(index),
    order = view.order.indexOf(index);
  node.replaceChildren();
  node.classList.toggle("winner", won);
  node.classList.toggle("taking-turn", view.activeSeat === index);
  const heading = document.createElement("div");
  heading.className = "seat-heading";
  const delta = player.chips - player.beforeChips;
  heading.innerHTML = `<h2 class="seat-name"><span class="order-mark${order === 0 ? " dealer" : ""}" aria-label="判断順${order + 1}番${order === 0 ? "、親" : ""}">${order === 0 ? "親" : order + 1}</span>${names[player.character]}${own ? "（あなた）" : ""}</h2><div class="chip-balance" aria-label="持ちチップ${player.chips}枚" title="持ちチップ">${coin}<b>${player.chips}</b><small>枚</small><span class="chip-delta ${delta > 0 ? "gain" : "loss"}">${result ? (delta > 0 ? "+" : "") + delta : ""}</span></div>`;
  node.append(heading);
  if (own) {
    const avatar = document.createElement("div");
    avatar.id = "self-back";
    avatar.className = "self-back";
    avatar.setAttribute("role", "img");
    node.append(avatar);
  } else {
    const pose = result ? (won ? "win" : "lose") : player.expression;
    const avatar = document.createElement("div");
    avatar.className = `portrait ${pose}`;
    avatar.innerHTML = portrait(player.character, pose);
    const kind = CHARACTERS.find((c) => c.id === player.character);
    avatar.setAttribute("role", "img");
    avatar.setAttribute(
      "aria-label",
      `${kind.name}、${pose === "win" ? "勝利ポーズ" : pose === "lose" ? "敗北ポーズ" : player.expression === "tell" ? kind.expression : "いつもどおり"}`,
    );
    if (!result && player.expression === "tell") {
      const emote = document.createElement("span");
      emote.className = `emote emote-${player.character}`;
      emote.textContent = { tak: "〰", meg: "♪", ham: "…" }[player.character];
      emote.setAttribute("aria-hidden", "true");
      avatar.append(emote);
    }
    node.append(avatar);
  }
  const hand = document.createElement("div");
  hand.className = "hand";
  for (let i = 0; i < 3; i++)
    hand.append(
      cardElement(
        player.hand[i],
        i === 1 && !result ? "ひみつ" : i === 2 ? "追加・公開" : "公開",
        i >= player.hand.length,
      ),
    );
  const wager = document.createElement("div");
  wager.className = "wager";
  wager.setAttribute("role", "img");
  wager.setAttribute("aria-label", `この局に出したチップ${player.wager}枚`);
  if (result) wager.setAttribute("aria-hidden", "true");
  wager.innerHTML = coin.repeat(player.wager);
  const total = document.createElement("div");
  total.className = "seat-total";
  if (own || result) {
    const sum = player.hand.map((c) => c.value).join("＋");
    total.innerHTML = `<span class="score-sum">${sum}<span class="equals"> → </span></span><strong title="合計の1の位">${player.score}</strong>${won ? '<span class="win-tag">勝ち</span>' : ""}`;
    total.setAttribute("aria-label", `${sum}、1の位は${player.score}${won ? "、勝ち" : ""}`);
  } else {
    total.textContent =
      player.decision === "draw"
        ? "1枚ひいたよ"
        : player.decision === "stand"
          ? "このまま勝負"
          : view.activeSeat === index
            ? "考え中…"
            : "";
  }
  node.append(hand, wager, total);
}

function render() {
  const view = viewFor(match),
    result = view.phase === "result",
    myTurn = view.activeSeat === 0;
  view.players.forEach((p, i) => renderSeat(p, i, view));
  $("scene").classList.toggle("revealed", result);
  $("match").dataset.phase = view.phase;
  $("match").classList.toggle("your-turn", myTurn);
  $("round-number").textContent = `第${view.roundNumber}局`;
  $("pot-total").innerHTML =
    `${result ? "獲得" : "場のチップ"} ${coin}<b>${result ? view.payout : view.pot}</b>枚`;
  const selfPose = result ? (view.winners.includes(0) ? "win" : "lose") : "back";
  $("self-back").innerHTML = portrait(character, selfPose);
  $("self-back").setAttribute(
    "aria-label",
    `${names[character]}、${selfPose === "win" ? "勝利ポーズ" : selfPose === "lose" ? "敗北ポーズ" : "後ろ姿"}`,
  );
  for (const id of ["draw", "stand"]) $(id).hidden = view.phase !== "choose";
  $("draw").disabled = !myTurn || view.players[0].chips < 1;
  $("stand").disabled = !myTurn;
  $("reveal").hidden = view.phase !== "ready";
  $("next").hidden = !result;
  $("next").textContent = view.finished ? "最終結果を見る" : "次の局へ";
  if (view.phase === "choose") {
    $("status").textContent = myTurn
      ? "あなたの番。どうする？"
      : `${names[view.players[view.activeSeat].character]}の番…`;
    $("action-note").textContent =
      myTurn && view.players[0].chips < 1
        ? "追加のチップがないので、2枚で勝負。"
        : view.roundNumber === 1
          ? "参加費1枚は支払い済み。追加カードは公開。"
          : "追加は1チップ。引いたカードはみんなに公開。";
  } else if (view.phase === "ready") {
    $("status").textContent = "みんな決まったよ。カードを開こう！";
    $("action-note").textContent = "同点なら、判断順が早い子の勝ち。";
  } else {
    $("status").textContent =
      `${names[view.players[view.winners[0]].character]}が${view.payout}枚獲得！`;
    $("action-note").textContent = view.finished
      ? "20枚以上、または0枚になったのでゲーム終了。"
      : view.tiedTop
        ? "同点トップ！ 判断順が早い子の勝ち。"
        : "次は、となりの子が親になるよ。";
  }
}

function scheduleCpu() {
  clearTimeout(cpuTimer);
  if (!match || match.phase !== "choose" || document.hidden) return;
  const current = match,
    number = match.roundNumber,
    seat = match.order[match.turnIndex];
  if (seat === 0) return;
  cpuTimer = setTimeout(() => {
    if (
      match !== current ||
      match.roundNumber !== number ||
      match.phase !== "choose" ||
      match.order[match.turnIndex] !== seat ||
      document.hidden
    )
      return;
    if (decideRound(match, seat, chooseCpu(viewFor(match, seat)))) afterDecision(seat);
  }, 950);
}
function afterDecision(seat) {
  render();
  if (match.players[seat].decision === "draw") animateDraw(seat);
  if (match.phase === "ready") $("reveal").focus({ preventScroll: true });
  else if (match.order[match.turnIndex] === 0)
    ($("draw").disabled ? $("stand") : $("draw")).focus({ preventScroll: true });
  scheduleCpu();
}
function start() {
  if (!character) return;
  clearTimeout(cpuTimer);
  if ($("final-result").open) $("final-result").close();
  const entering = $("match").hidden;
  match = createMatch(character);
  $("setup").hidden = true;
  $("match").hidden = false;
  $("change-character").hidden = false;
  document.body.classList.add("playing");
  render();
  animateDeal();
  if (entering) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  if (match.order[0] === 0) $("draw").focus({ preventScroll: true });
  scheduleCpu();
}
function showSetup() {
  clearTimeout(cpuTimer);
  match = null;
  if ($("final-result").open) $("final-result").close();
  $("setup").hidden = false;
  $("match").hidden = true;
  $("change-character").hidden = true;
  document.body.classList.remove("playing");
  $("characters").querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
}
function collectCoins() {
  if (reduceMotion()) return;
  const target = $(`seat-${match.winners[0]}`)
    .querySelector(".chip-balance")
    .getBoundingClientRect();
  document.querySelectorAll(".wager .coin").forEach((node, i) => {
    const from = node.getBoundingClientRect();
    node.animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        {
          transform: `translate(${target.x + target.width / 2 - from.x - from.width / 2}px,${target.y + target.height / 2 - from.y - from.height / 2}px) scale(0.55)`,
          opacity: 0,
        },
      ],
      { duration: 850, delay: 180 + i * 55, fill: "backwards", easing: "ease-in-out" },
    );
  });
}
// Animate only the action that just happened, not every card on each CPU repaint.
function animateDeal() {
  if (reduceMotion()) return;
  match.order.forEach((seat, turn) => {
    $(`seat-${seat}`)
      .querySelectorAll(".card-slot:not(.empty) .playing-card")
      .forEach((node, i) => {
        node.animate(
          [
            { transform: "translateY(-14px) rotate(-5deg)", opacity: 0 },
            { transform: "none", opacity: 1 },
          ],
          { duration: 310, delay: turn * 45 + i * 100, fill: "backwards", easing: "ease-out" },
        );
      });
  });
}
function animateDraw(seat) {
  if (reduceMotion()) return;
  const node = $(`seat-${seat}`);
  node.querySelector(".card-slot:nth-child(3) .playing-card").animate(
    [
      { transform: "translateY(-20px) rotate(8deg)", opacity: 0 },
      { transform: "none", opacity: 1 },
    ],
    { duration: 380, easing: "cubic-bezier(.2,.75,.25,1)" },
  );
  node.querySelector(".wager .coin:last-child").animate(
    [
      { transform: "translateY(-10px) scale(.55)", opacity: 0 },
      { transform: "none", opacity: 1 },
    ],
    { duration: 330, delay: 90, fill: "backwards", easing: "ease-out" },
  );
}
function animateReveal() {
  if (reduceMotion()) return;
  document
    .querySelectorAll(".opponents .hand .card-slot:nth-child(2) .playing-card")
    .forEach((node, i) => {
      node.animate(
        [
          { transform: "scaleX(.05)", opacity: 0.4 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 360, delay: i * 45, fill: "backwards", easing: "ease-out" },
      );
    });
  const winner = $(`seat-${match.winners[0]}`);
  const lift = match.players[match.winners[0]].character === "tapi" ? 2 : 7;
  winner
    .querySelector(".portrait, .self-back")
    .animate(
      [
        { transform: "translateY(0)" },
        { transform: `translateY(-${lift}px)`, offset: 0.4 },
        { transform: "translateY(0)" },
      ],
      { duration: 580, delay: 230, easing: "ease-in-out" },
    );
  winner
    .querySelector(".chip-balance")
    .animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(1.08)", offset: 0.5 },
        { transform: "scale(1)" },
      ],
      { duration: 380, delay: 800, easing: "ease-out" },
    );
}
function showFinal() {
  const view = viewFor(match);
  $("final-title").textContent =
    view.champions.length > 1
      ? "いっしょに優勝！"
      : `${names[view.players[view.champions[0]].character]}の優勝！`;
  $("final-note").textContent = `第${view.roundNumber}局で終了 · 最終チップ`;
  const ranking = view.players
    .map((p, i) => ({ ...p, index: i }))
    .sort((a, b) => b.chips - a.chips);
  $("final-ranking").innerHTML = ranking
    .map(
      (p) =>
        `<li class="${view.champions.includes(p.index) ? "champion" : ""}"><span class="rank">${1 + ranking.filter((other) => other.chips > p.chips).length}</span>${portrait(p.character, view.champions.includes(p.index) ? "win" : "lose")}<span>${names[p.character]}${p.index === 0 ? "（あなた）" : ""}</span><strong>${coin}${p.chips}<small>枚</small></strong></li>`,
    )
    .join("");
  $("final-result").showModal();
}
// Consecutive taps must not pass through a replaced button to reveal or redeal.
function onAction(id, action) {
  $(id).addEventListener("click", (event) => {
    const now = performance.now();
    if (event.detail > 1 || now - lastAction < 300) return;
    lastAction = now;
    action();
  });
}
onAction("draw", () => {
  if (match && decideRound(match, 0, "draw")) afterDecision(0);
});
onAction("stand", () => {
  if (match && decideRound(match, 0, "stand")) afterDecision(0);
});
onAction("reveal", () => {
  if (!match || !revealRound(match)) return;
  render();
  animateReveal();
  collectCoins();
  $("next").focus({ preventScroll: true });
});
onAction("next", () => {
  if (!match || match.phase !== "result") return;
  if (match.finished) showFinal();
  else if (nextRound(match)) {
    render();
    animateDeal();
    scheduleCpu();
    if (match.order[0] === 0) $("draw").focus({ preventScroll: true });
  }
});
onAction("start", start);
onAction("restart", start);
$("change-character").addEventListener("click", showSetup);
$("final-characters").addEventListener("click", showSetup);
document.addEventListener("visibilitychange", scheduleCpu);

for (const c of CHARACTERS) {
  const button = document.createElement("button");
  button.type = "button";
  button.innerHTML = `${portrait(c.id)}<span>${c.name}</span>`;
  button.setAttribute("aria-label", c.name);
  button.setAttribute("aria-pressed", String(c.id === character));
  button.addEventListener("click", () => {
    character = c.id;
    $("start").disabled = false;
    $("start").textContent = `${c.name}であそぶ`;
    for (const other of $("characters").children)
      other.setAttribute("aria-pressed", String(other === button));
  });
  $("characters").append(button);
  $("invitation-friends").insertAdjacentHTML(
    "beforeend",
    `<div>${portrait(c.id, c.id === "tapi" ? "neutral" : "tell")}</div>`,
  );
  $("expression-guide").insertAdjacentHTML(
    "beforeend",
    `<div>${portrait(c.id, "tell")}<p><b>${c.name}</b><span>${c.hint}</span></p></div>`,
  );
}

// Keep normal page scrolling outside the play surface; cards themselves are not draggable.
for (const surface of [$("scene"), $("actions")]) {
  for (const type of [
    "contextmenu",
    "selectstart",
    "dragstart",
    "dblclick",
    "gesturestart",
    "gesturechange",
    "gestureend",
  ])
    surface.addEventListener(type, (event) => event.preventDefault());
  surface.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });
}
