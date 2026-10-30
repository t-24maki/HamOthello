import { CHARACTERS } from "../poker/characters.js?v=poker-dilemma-20261025";
import { pokerPortrait as portrait } from "../poker/portraits.js?v=poker-uneasy-20261025";
import {
  SPOT,
  WHEEL,
  color,
  stake,
  payout,
  finished,
  ranking,
  tableCharacters,
  createRound,
  applyAction,
  visibleResults,
} from "./rules.js?v=20261030-roulette7";
import {
  boardMarkup,
  chipsMarkup,
  wheelMarkup,
  landingRotation,
  chipFace,
  placedChipPoint,
} from "./board.js?v=20261030-roulette7";
import { ChipPlacements } from "./placements.js?v=20261030-roulette5";
import {
  createRouletteMatch,
  generateRoomCode,
  normalizeRoomCode,
} from "./online.js?v=20261030-roulette7";
const $ = (id) => document.getElementById(id);
const names = Object.fromEntries(CHARACTERS.map((c) => [c.id, c.name]));
let character = null,
  mode = "cpu",
  roomAction = "create",
  roomCode = "",
  connecting = false;
let round = null,
  seat = 0,
  online = null,
  epoch = 0,
  error = "",
  sending = false,
  connectionText = "";
let draft = [],
  history = [],
  selectedSpot = null,
  spin = null,
  frame = null,
  visualDone = false,
  finalShown = "";
let menuOpen = false;
let placements = null,
  placementFrame = null,
  placementLast = 0;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const coin = '<span class="coin-icon" aria-hidden="true">●</span>';
const paused = () =>
  document.hidden || menuOpen || $("rules").open || $("spot-dialog").open || Boolean(error);
const identity = (p) => (p === seat ? "あなた" : mode === "online" && p < 2 ? "相手" : "CPU");
const key = (s) => `${s.matchId}:${s.roundId}`;
const editable = () => round?.phase === "bet" && round.bets[seat] === null && !sending && !paused();
const currentBets = () => round?.bets[seat] ?? draft;
const tableBets = () => round.bets.map((_, p) => (p === seat ? currentBets() : placements.bets[p]));
const marker = (p) => `<span class="seat-marker" data-player="${p}" aria-hidden="true"></span>`;
function betSummary(p) {
  const bets = tableBets()[p];
  if (!bets) return "考え中…";
  if (!bets.length) return "まだ置いていないよ";
  return bets.map((b) => `${SPOT[b.id].label}に${b.amount}枚`).join(" ／ ");
}
function spotList() {
  const canEdit = round.phase === "bet" && round.bets[seat] === null && !sending && !error;
  $("spot-list").innerHTML = Object.values(SPOT)
    .map((s) => {
      const entries = tableBets()
        .flatMap((bets, p) => {
          const amount = bets?.find((b) => b.id === s.id)?.amount;
          return amount
            ? [
                `<span class="list-bet">${marker(p)}${names[round.characters[p]]}（${identity(p)}） ${amount}枚</span>`,
              ]
            : [];
        })
        .join("");
      return `<button data-pick="${s.id}" ${canEdit && stake(currentBets()) < round.bank[seat] ? "" : "disabled"}><b>${s.label}</b><small>${s.kind === "color" ? "色" : s.kind + "数字"} ${canEdit ? "・押すと1枚" : ""}</small>${entries}</button>`;
    })
    .join("");
}
let flashTimer;
function flashSpot(id) {
  clearTimeout(flashTimer);
  $("board")
    .querySelectorAll(".tapped")
    .forEach((el) => el.classList.remove("tapped"));
  $("board").querySelector(`[data-spot="${id}"]`)?.classList.add("tapped");
  flashTimer = setTimeout(
    () =>
      $("board")
        .querySelectorAll(".tapped")
        .forEach((el) => el.classList.remove("tapped")),
    450,
  );
}
function edit(id) {
  if (!editable() || !Object.hasOwn(SPOT, id)) return;
  selectedSpot = id;
  if (stake(draft) >= round.bank[seat]) {
    render();
    return;
  }
  history.push(id);
  const existing = draft.find((b) => b.id === id);
  if (existing) existing.amount++;
  else draft.push({ id, amount: 1 });
  render();
  flashSpot(id);
}
function undo() {
  if (!editable() || !history.length) return;
  const id = history.pop(),
    b = draft.find((b) => b.id === id);
  b.amount--;
  draft = draft.filter((b) => b.amount > 0);
  selectedSpot = id;
  render();
}
function pose(p) {
  const c = round.characters[p],
    bets = tableBets()[p];
  if (round.phase === "result" && visualDone) {
    const delta = round.coins[p] - round.bank[p];
    return delta > 0 ? "win" : delta < 0 ? "lose" : "neutral";
  }
  if (c === "tak" && round.bank[p] <= 5) return "sad";
  if (c === "meg" && round.bank[p] >= 15) return "happy";
  if (c === "ham" && stake(bets) >= Math.ceil(round.bank[p] / 2)) return "worried";
  return "neutral";
}
function friends(p) {
  return (
    round.characters[p] === "tapi" &&
    (round.bank[p] >= 20 || (visualDone && round.coins[p] - round.bank[p] >= 10))
  );
}
function seatMarkup(p, own = false) {
  const settled = round.phase === "result" && visualDone;
  const spent = stake(tableBets()[p]);
  const balance = settled ? round.coins[p] : round.bank[p] - spent;
  const change = round.coins[p] - round.bank[p];
  const note = settled
    ? change > 0
      ? `＋${change}枚！`
      : change < 0
        ? `−${-change}枚`
        : "増減なし"
    : placements.pending(p)
      ? placements.active.player === p
        ? "コインを置いているよ"
        : "コインを準備中…"
      : round.bets[p]
        ? `${spent}枚で準備OK`
        : own
          ? "あなたのコイン"
          : "考え中…";
  const face = portrait(round.characters[p], pose(p), friends(p), own);
  const head = `<div class="seat-heading">${marker(p)}${names[round.characters[p]]}${own ? "" : `<span class="identity">${identity(p)}</span>`}</div>`;
  const amount = `<div class="coin-line" aria-label="残り${balance}枚">${coin}<span>${balance}</span></div>`;
  const bets = tableBets()[p];
  const summary = bets?.length
    ? `${SPOT[bets[0].id].label} ×${bets[0].amount}${bets.length > 1 ? ` ほか${bets.length - 1}か所` : ""}`
    : "—";
  const state = `<div class="seat-state">${note}</div>`;
  const wager = `<div class="seat-bet" title="${betSummary(p)}" aria-label="${betSummary(p)}">${summary}</div>`;
  return own
    ? `<div class="player-label">あなた</div><div class="self-face">${face}</div>${head}${amount}${state}`
    : `${head}${amount}<div class="portrait">${face}</div>${wager}${state}`;
}
function renderSetup() {
  $("online-setup").hidden = mode !== "online";
  $("join-fields").hidden = roomAction !== "join";
  $("room-waiting").hidden = !connecting || roomAction !== "create";
  $("room-display").textContent = roomCode;
  $("online-status").textContent = connectionText || error;
  $("cancel").hidden = !connecting;
  $("start").disabled = !character || connecting;
  $("start").textContent = !character
    ? "キャラを選んでね"
    : connecting
      ? "相手を待っているよ…"
      : mode === "cpu"
        ? "ルーレットであそぶ"
        : roomAction === "create"
          ? "へやをつくる"
          : "へやに入る";
  document.querySelectorAll("[data-character]").forEach((b) => {
    b.disabled = connecting;
    b.setAttribute("aria-pressed", String(b.dataset.character === character));
  });
  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.disabled = connecting;
    b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  });
  document.querySelectorAll("[data-room]").forEach((b) => {
    b.disabled = connecting;
    b.setAttribute("aria-pressed", String(b.dataset.room === roomAction));
  });
}
function render() {
  document.body.classList.toggle("playing", Boolean(round));
  $("setup").hidden = Boolean(round);
  $("game").hidden = !round;
  $("settings").hidden = !round;
  if (!round) {
    $("round-label").textContent = "くるくる、どこに止まるかな。";
    renderSetup();
    return;
  }
  $("round-label").textContent = `第${round.roundNumber}回`;
  const results = visibleResults(round, visualDone);
  const resultsKey = results.join(",");
  if ($("result-history").dataset.results !== resultsKey) {
    $("result-history").dataset.results = resultsKey;
    $("result-history").innerHTML = results.length
      ? results
          .map(
            (n, i) =>
              `<li class="past-result ${color(n)}" aria-label="第${i + 1}回：${n}" title="第${i + 1}回">${n}</li>`,
          )
          .reverse()
          .join("")
      : '<li class="history-empty">まだ回していないよ</li>';
    $("result-history").scrollLeft = 0;
  }
  $("opponents").innerHTML = [2, seat === 0 ? 1 : 0, 3]
    .map(
      (p) =>
        `<section data-seat="${p}" class="seat ${placements.active?.player === p ? "placing" : ""} ${visualDone && round.coins[p] > round.bank[p] ? "winner" : ""}" aria-label="${names[round.characters[p]]} ${identity(p)}">${seatMarkup(p)}</section>`,
    )
    .join("");
  $("self").innerHTML = seatMarkup(seat, true);
  $("chip-layer").innerHTML = chipsMarkup(
    tableBets(),
    seat,
    visualDone ? WHEEL[round.pocket] : null,
  );
  $("stake").textContent = stake(currentBets());
  $("board").classList.toggle("blocked", !editable());
  $("board").classList.toggle("settled", visualDone);
  $("board")
    .querySelectorAll(".number")
    .forEach((n) =>
      n.classList.toggle(
        "winning-number",
        visualDone && n.dataset.spot === `n${WHEEL[round.pocket]}`,
      ),
    );
  $("outcome").hidden = !visualDone;
  if (visualDone)
    $("outcome").textContent =
      `${WHEEL[round.pocket]}・${{ green: "緑", red: "赤", black: "黒" }[color(WHEEL[round.pocket])]}`;
  $("board")
    .querySelectorAll("[data-spot]")
    .forEach((n) => n.setAttribute("aria-disabled", String(!editable())));
  $("undo").disabled = !editable() || !history.length;
  $("clear").disabled = !editable() || !draft.length;
  $("pick-spot").disabled = Boolean(error);
  if ($("spot-dialog").open) spotList();
  $("spin-panel").classList.toggle("spinning", Boolean(spin));
  if (!spin) $("spin-caption").textContent = "";
  drawPlacement();
  let hint = "数字や境目をタップして1枚";
  if (selectedSpot && editable()) {
    const s = SPOT[selectedSpot],
      b = draft.find((b) => b.id === selectedSpot);
    hint = b
      ? `${s.label}：${b.amount}枚 → 当たりで${b.amount * s.multiplier}枚`
      : `${s.label}を選択中`;
  }
  $("bet-note").textContent = hint;
  const button = $("main-action");
  button.disabled = true;
  let message = "好きな場所にコインを置こう";
  if (error) {
    button.textContent = "通信が切れました";
    message = error;
  } else if (spin) {
    button.textContent = "くるくる…";
    message = "みんなのコイン、どうなるかな";
  } else if (round.phase === "bet") {
    const total = stake(draft);
    button.textContent = round.bets[seat]
      ? "相手を待っているよ…"
      : total
        ? `${total}枚で決定`
        : "コインを置いてね";
    button.disabled = !editable() || total === 0;
    if (total >= round.bank[seat]) message = "手持ちのコインを全て置いているよ";
    if (round.bets[seat]) message = "ふたりの準備ができたら回るよ";
  } else if (placements.active) {
    button.textContent = "コインを置いているよ…";
  } else if (visualDone) {
    const n = WHEEL[round.pocket],
      delta = round.coins[seat] - round.bank[seat];
    const result = `${n}・${{ green: "緑", red: "赤", black: "黒" }[color(n)]}！ あなたは${delta > 0 ? "＋" + delta : delta < 0 ? "−" + -delta : "増減なし"}${delta ? "枚" : ""}`;
    message = result;
    $("bet-note").textContent = `返却 ${payout(round.bets[seat], n)}枚（賭け金込み）`;
    const allSeen = round.seen.slice(0, round.humans).every(Boolean);
    button.textContent = finished(round)
      ? "最終結果を見る"
      : round.proceed[seat]
        ? "相手を待っているよ…"
        : "次のルーレット";
    button.disabled = sending || (!finished(round) && (!allSeen || round.proceed[seat]));
    if (!allSeen) message = "相手のルーレットが止まるのを待っているよ";
    if (finished(round) && finalShown !== key(round)) {
      finalShown = key(round);
      showFinal();
    }
  }
  if (placements.active && !error)
    message = `${names[round.characters[placements.active.player]]}がコインを置いているよ`;
  if (sending) message = "通信中…";
  $("status").textContent = message;
  if ($("final").open) {
    $("rematch").disabled =
      Boolean(error) ||
      sending ||
      !round.seen.slice(0, round.humans).every(Boolean) ||
      round.proceed[seat];
    $("rematch").textContent = round.proceed[seat] ? "相手を待っているよ…" : "もう一度あそぶ";
  }
}
function showFinal() {
  const ranks = ranking(round.coins),
    winners = ranks.filter((r) => r.rank === 1);
  $("final-title").textContent =
    winners.length > 1 ? "同点で優勝！" : `${names[round.characters[ranks[0].player]]}の優勝！`;
  $("ranking").innerHTML = ranks
    .map(
      (r) =>
        `<li><b>${r.rank}位</b>${portrait(round.characters[r.player], r.rank === 1 ? "win" : "lose", friends(r.player))}<span>${names[round.characters[r.player]]}<small>${identity(r.player)}</small></span><b>${r.coins}枚</b></li>`,
    )
    .join("");
  if (!$("final").open) $("final").showModal();
}
function stopSpin() {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  spin = null;
}
function stopPlacements() {
  if (placementFrame !== null) cancelAnimationFrame(placementFrame);
  placementFrame = null;
  $("chip-flight").setAttribute("hidden", "");
}
function drawPlacement() {
  const active = placements?.active,
    flight = $("chip-flight");
  const hidden = !active || paused() || reducedMotion.matches;
  flight.toggleAttribute("hidden", hidden);
  if (hidden) return;
  const { player, id, amount } = active;
  const hand = $("opponents").querySelector(`[data-seat="${player}"] .portrait`);
  const svg = $("board").firstElementChild,
    matrix = svg.getScreenCTM();
  if (!hand || !matrix) return;
  const displayed = tableBets();
  displayed[player] = [...displayed[player], { id, amount }];
  const [x, y] = placedChipPoint(displayed, player, id);
  const target = new DOMPoint(x, y).matrixTransform(matrix),
    rect = hand.getBoundingClientRect();
  const startX = rect.left + rect.width * 0.61,
    startY = rect.top + rect.height * 0.8;
  const t = placements.progress,
    ease = t * t * (3 - 2 * t),
    arc = Math.sin(t * Math.PI) * Math.min(36, Math.abs(target.y - startY) * 0.18);
  const px = startX + (target.x - startX) * ease,
    py = startY + (target.y - startY) * ease - arc;
  const restingSize = 28 * Math.hypot(matrix.a, matrix.b);
  const size = restingSize + (Math.max(30, restingSize * 1.25) - restingSize) * (1 - t);
  const flightKey = `${player}:${id}:${amount}`;
  if (flight.dataset.flight !== flightKey) {
    flight.dataset.flight = flightKey;
    flight.innerHTML = `<g class="chip" data-player="${player}">${chipFace(amount)}</g>`;
  }
  flight.style.width = `${size}px`;
  flight.style.height = `${size}px`;
  flight.style.transform = `translate(${px - size / 2}px, ${py - size / 2}px) rotate(${-12 * Math.sin(Math.PI * t)}deg)`;
}
function continuePresentation() {
  if (!round) return;
  if (!placements.active) {
    stopPlacements();
    if (round.phase === "result" && !spin && !visualDone) beginSpin();
    return;
  }
  if (placementFrame !== null) return;
  placementLast = performance.now();
  function tick(now) {
    placementFrame = null;
    if (!round || !placements?.active) return;
    const changed = placements.advance(Math.min(50, now - placementLast), {
      paused: paused(),
      reduced: reducedMotion.matches,
    });
    placementLast = now;
    if (changed) render();
    else drawPlacement();
    if (placements.active) placementFrame = requestAnimationFrame(tick);
    else continuePresentation();
  }
  placementFrame = requestAnimationFrame(tick);
}
function receive(next, player = 0) {
  const opening = !round || key(round) !== key(next);
  round = next;
  seat = player;
  sending = false;
  if (opening) {
    stopSpin();
    stopPlacements();
    placements = new ChipPlacements(seat);
    visualDone = false;
    draft = [];
    history = [];
    selectedSpot = null;
    $("final").close();
    $("wheel").style.transform = "rotate(0deg)";
    window.scrollTo(0, 0);
  }
  placements.sync(round.bets);
  render();
  continuePresentation();
}
function submit(type, bets) {
  if (error || !round) return;
  if (mode === "cpu") {
    const next = applyAction(round, seat, {
      type,
      bets,
      matchId: round.matchId,
      roundId: round.roundId,
    });
    if (next) receive(next, seat);
  } else online?.submit(type, bets);
}
function beginSpin() {
  stopSpin();
  visualDone = false;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  spin = {
    key: key(round),
    time: 0,
    last: performance.now(),
    duration: reduced ? 200 : 4200,
    reduced,
  };
  $("wheel").style.transform = "rotate(0deg)";
  $("spin-caption").textContent = "くるくる…";
  render();
  function tick(now) {
    if (!spin || spin.key !== key(round)) return;
    if (!paused()) spin.time += Math.min(50, now - spin.last);
    spin.last = now;
    const t = Math.min(1, spin.time / spin.duration),
      ease = 1 - (1 - t) ** 4;
    const rotation = landingRotation(round.pocket);
    $("wheel").style.transform = `rotate(${spin.reduced ? rotation : rotation * ease}deg)`;
    if (t === 1) $("spin-caption").textContent = `${WHEEL[round.pocket]}！`;
    if (spin.time >= spin.duration + 800) {
      spin = null;
      frame = null;
      visualDone = true;
      render();
      submit("seen");
      return;
    }
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
}
function stopOnline() {
  epoch++;
  online?.close();
  online = null;
  connecting = false;
  sending = false;
  error = "";
  connectionText = "";
  roomCode = "";
}
function back() {
  stopOnline();
  stopSpin();
  stopPlacements();
  placements = null;
  round = null;
  draft = [];
  history = [];
  visualDone = false;
  $("final").close();
  render();
}
async function connect() {
  if (!character || connecting) return;
  error = "";
  connectionText = "接続しているよ…";
  roomCode =
    roomAction === "create" ? generateRoomCode() : normalizeRoomCode($("room-input").value);
  if (!/^HAMU-[A-Z0-9]{6}$/.test(roomCode)) {
    error = "キーワードを確認してね。";
    connectionText = "";
    renderSetup();
    return;
  }
  connecting = true;
  const token = ++epoch;
  renderSetup();
  try {
    const match = await createRouletteMatch({
      role: roomAction === "create" ? "host" : "guest",
      roomCode,
      character,
      onView(next, p) {
        if (token === epoch) receive(next, p);
      },
      onStatus(status) {
        if (token !== epoch) return;
        sending = status === "sending";
        connectionText = status === "connected" ? "つながったよ" : "通信中…";
        render();
      },
      onError(e) {
        if (token !== epoch) return;
        error = e.message;
        sending = false;
        connecting = false;
        connectionText = "";
        render();
      },
    });
    if (token !== epoch) {
      match.close();
      return;
    }
    online = match;
    connectionText = "相手が入るのを待っているよ…";
    render();
  } catch (e) {
    if (token === epoch) {
      error = e.message;
      connecting = false;
      connectionText = "";
      render();
    }
  }
}
$("board").innerHTML = boardMarkup();
$("wheel").innerHTML = wheelMarkup();
// Wide and short screens have room beside the betting board; tall phones
// tuck the wheel into the upper-right space above the circular board.
const sideBySide = matchMedia("(min-width: 700px), (max-height: 540px), (orientation: landscape)");
const sizeBoard = () =>
  $("board").firstElementChild.setAttribute(
    "viewBox",
    sideBySide.matches ? "0 0 390 320" : "0 -80 390 400",
  );
sideBySide.addEventListener("change", sizeBoard);
sizeBoard();
$("invitation").innerHTML = CHARACTERS.map((c) => portrait(c.id)).join("");
$("characters").innerHTML = CHARACTERS.map(
  (c) =>
    `<button data-character="${c.id}" aria-pressed="false">${portrait(c.id)}<span>${c.name}</span></button>`,
).join("");
$("characters").addEventListener("click", (e) => {
  const b = e.target.closest("[data-character]");
  if (b && !connecting) {
    character = b.dataset.character;
    renderSetup();
  }
});
document.querySelectorAll("[data-mode]").forEach((b) =>
  b.addEventListener("click", () => {
    mode = b.dataset.mode;
    error = "";
    renderSetup();
  }),
);
document.querySelectorAll("[data-room]").forEach((b) =>
  b.addEventListener("click", () => {
    roomAction = b.dataset.room;
    error = "";
    renderSetup();
  }),
);
$("start").addEventListener("click", () => {
  if (!character || connecting) return;
  if (mode === "online") void connect();
  else receive(createRound("cpu-" + Date.now(), 1, Math.random, null, tableCharacters(character)));
});
$("cancel").addEventListener("click", () => {
  stopOnline();
  render();
});
$("settings").addEventListener("click", back);
$("copy-room").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    connectionText = "コピーしたよ。相手に教えてね。";
  } catch {
    connectionText = "キーワードを長押ししてコピーしてね。";
  }
  renderSetup();
});
$("room-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") void connect();
});
$("board").addEventListener("click", (e) => {
  const g = e.target.closest("[data-spot]");
  if (g) edit(g.dataset.spot);
});
$("board").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    const g = e.target.closest("[data-spot]");
    if (g) {
      e.preventDefault();
      edit(g.dataset.spot);
    }
  }
});
$("undo").addEventListener("click", undo);
$("pick-spot").addEventListener("click", () => {
  if (!round || error) return;
  spotList();
  $("spot-dialog").showModal();
  render();
});
$("spot-list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-pick]");
  if (b) {
    $("spot-dialog").close();
    edit(b.dataset.pick);
  }
});
$("close-spots").addEventListener("click", () => $("spot-dialog").close());
$("spot-dialog").addEventListener("close", render);
$("clear").addEventListener("click", () => {
  if (editable()) {
    draft = [];
    history = [];
    selectedSpot = null;
    render();
  }
});
$("main-action").addEventListener("click", () => {
  if (round?.phase === "bet" && editable()) submit("bet", draft);
  else if (visualDone) {
    if (finished(round)) {
      showFinal();
      render();
    } else submit("next");
  }
});
$("rematch").addEventListener("click", () => submit("rematch"));
$("close-final").addEventListener("click", () => $("final").close());
$("show-rules").addEventListener("click", () => {
  $("rules").showModal();
  render();
});
$("close-rules").addEventListener("click", () => $("rules").close());
$("rules").addEventListener("close", render);
window.addEventListener("takumegu-menu", (e) => {
  menuOpen = e.detail.open;
  render();
});
document.addEventListener("visibilitychange", render);
window.addEventListener("pagehide", () => {
  stopSpin();
  stopPlacements();
  online?.close();
});
window.addEventListener("pageshow", (e) => {
  if (e.persisted && round) {
    if (mode === "online") {
      error = "へやを出て、もう一度つなぎ直してね。";
      render();
    } else continuePresentation();
  }
});
$("game").addEventListener("contextmenu", (e) => e.preventDefault());
render();
