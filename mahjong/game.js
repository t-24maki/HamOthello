import {
  boardHand,
  roundPresentation,
  matchPresentation,
  groupsMarkup,
  tileCatalogMarkup,
} from "./presentation.js?v=20261022-mahjong7";
import { tileMarkup, tileInfo, sortTiles, prepareTileArt } from "./tiles.js?v=20261022-mahjong7";
import {
  createGame,
  play,
  nextRound,
  gameView,
  riichiDiscards,
} from "./rules.js?v=20261022-mahjong7";
import { automaticAction } from "./cpu.js?v=20261022-mahjong7";
import {
  createMahjongMatch,
  generateRoomCode,
  normalizeRoomCode,
  isOnlineConfigured,
} from "./online.js?v=20261022-mahjong7";
const $ = (id) => document.getElementById(id);
const names = ["たくハム", "めぐハム"];
const empty = '<span class="empty-tile" aria-hidden="true"></span>';
let mode = "cpu",
  role = "host",
  game = null,
  network = null,
  onlineView = null,
  seat = 0;
let selected = null,
  epoch = 0,
  cpuTimer = null,
  pending = false,
  errorMessage = "",
  resultKey = "",
  resultStage = "round",
  cpuMatch = 0,
  connecting = false;
const ended = (g) => g && ["roundEnd", "matchEnd"].includes(g.phase);
const current = () => (mode === "online" ? onlineView?.game : game ? gameView(game, 0) : null);
const self = () => seat;
const label = (p) =>
  names[p] +
  (mode === "cpu"
    ? p === 0
      ? "（あなた）"
      : "（CPU）"
    : mode === "online" && p === seat
      ? "（あなた）"
      : "");
function stopTimer() {
  clearTimeout(cpuTimer);
  cpuTimer = null;
}
function closeDialogs() {
  for (const d of document.querySelectorAll("dialog[open]")) d.close();
}
function reset() {
  epoch++;
  stopTimer();
  network?.close();
  network = null;
  game = null;
  onlineView = null;
  pending = false;
  connecting = false;
  errorMessage = "";
  selected = null;
  resultKey = "";
  closeDialogs();
  $("setup").hidden = false;
  $("match").hidden = true;
  $("menu").hidden = true;
  $("hand").replaceChildren();
  $("opponent-hand").replaceChildren();
  $("room-waiting").hidden = true;
  $("cancel-connect").hidden = true;
  $("connect").hidden = false;
  $("connection-note").textContent = "";
  updateSetup();
}
function updateSetup() {
  for (const b of document.querySelectorAll("[data-mode]")) {
    b.setAttribute("aria-pressed", b.dataset.mode === mode);
    b.disabled = connecting;
  }
  $("cpu-options").hidden = mode === "online";
  $("online-options").hidden = mode !== "online";
  $("host-room").setAttribute("aria-pressed", role === "host");
  $("join-room").setAttribute("aria-pressed", role === "guest");
  $("host-room").disabled = connecting;
  $("join-room").disabled = connecting;
  $("join-field").hidden = role === "host";
  $("room-input").disabled = connecting;
  $("connect").textContent = role === "host" ? "へやをつくる →" : "へやに入る →";
  $("connect").disabled = connecting;
}
function startCPU(first = 0) {
  stopTimer();
  cpuMatch++;
  resultKey = "";
  selected = null;
  errorMessage = "";
  seat = 0;
  game = createGame({ first });
  $("setup").hidden = true;
  $("match").hidden = false;
  $("menu").hidden = false;
  closeDialogs();
  render();
  scheduleTurn();
}
function commit(next) {
  if (!next) return;
  game = next;
  selected = null;
  render();
  scheduleTurn();
}
function scheduleTurn() {
  stopTimer();
  const g = current();
  if (!g || ended(g) || pending || errorMessage || $("leave-dialog").open) return;
  const player = mode === "cpu" ? g.turn : self();
  const isCPU = mode === "cpu" && player === 1;
  const automatic = g.phase === "draw" || isCPU || (g.phase === "discard" && g.riichi[player]);
  if (g.turn !== player || !automatic) return;
  const token = epoch;
  cpuTimer = setTimeout(
    () => {
      cpuTimer = null;
      if (token !== epoch || pending || errorMessage || $("leave-dialog").open) return;
      const action = automaticAction(isCPU ? gameView(game, player) : current(), player, isCPU);
      if (!action) return;
      if (mode === "online") network?.submit(action.type, action.tile);
      else commit(play(game, player, action));
    },
    g.phase === "draw" ? 300 : 900,
  );
}
function act(type, tile) {
  const g = current();
  if (!g || pending || errorMessage) return;
  if (mode === "online") {
    network?.submit(type, tile);
    return;
  }
  if (mode === "cpu" && game.turn !== 0) return;
  commit(play(game, self(), { type, tile }));
}
function tileRack(hand, drawn, interactive) {
  const sorted = sortTiles(hand ?? []);
  if (drawn !== null && sorted.includes(drawn) && sorted.length === 9) {
    sorted.splice(sorted.indexOf(drawn), 1);
    sorted.push(drawn);
  }
  return Array.from({ length: 9 }, (_, i) =>
    sorted[i] === undefined
      ? empty
      : tileMarkup(sorted[i], { button: interactive, selected: sorted[i] === selected }),
  ).join("");
}
function render() {
  const g = current();
  if (!g) return;
  const me = self(),
    other = 1 - me,
    finish = roundPresentation(g),
    claiming = ["ron", "tsumo"].includes(g.phase);
  const mine = g.turn === me && !ended(g);
  const actionable =
    mine && !pending && !errorMessage && !g.riichi[me] && (mode !== "cpu" || me === 0);
  const choices = actionable ? riichiDiscards(g, me) : [];
  for (let p = 0; p < 2; p++) {
    $(`name-${p}`).textContent = label(p);
    $(`score-${p}`).innerHTML = `${g.scores[p]}<small>点</small>`;
  }
  $("round-label").textContent = `${g.round} / 4`;
  $("opponent-name").textContent = `${names[other]}の手牌`;
  $("dealer-label").textContent = `${names[g.dealer]}から`;
  const opponentCount =
    g.handCounts[other] - (g.result?.method === "ron" && g.result.winner === other ? 1 : 0);
  $("opponent-hand").innerHTML = Array.from({ length: 9 }, (_, i) =>
    i < opponentCount ? tileMarkup(null) : empty,
  ).join("");
  for (const [id, p] of [
    ["opponent", other],
    ["you", me],
  ]) {
    $(`river-${id}-label`).innerHTML =
      `<span>${names[p]}の捨て牌</span>${g.riichi[p] ? '<strong class="riichi-badge">リーチ</strong>' : ""}`;
    $(`river-${id}`).innerHTML = Array.from({ length: 12 }, (_, i) => {
      // A ron tile belongs to the winner now; keep a marked trace in the source river.
      const claimed =
        g.result?.method === "ron" && g.lastDiscard.player === p && i === g.discards[p].length;
      const tile = claimed ? g.lastDiscard.tile : g.discards[p][i];
      if (tile === undefined) return empty;
      const declaration = g.riichiTiles[p] === tile;
      return `<span class="${g.lastDiscard?.tile === tile ? "latest" : ""} ${declaration ? "riichi-discard" : ""} ${claimed ? "ron-source" : ""}"${claimed ? ' aria-label="ロンされた牌"' : declaration ? ' aria-label="リーチの宣言牌"' : ""}>${tileMarkup(tile, { winning: claimed })}${declaration ? '<small class="riichi-marker">リーチ</small>' : claimed ? "<small>ロン</small>" : ""}</span>`;
    }).join("");
  }
  $("wall-count").textContent = g.wallCount;
  $("turn-chip").textContent =
    g.phase === "matchEnd" ? "4局終了" : ended(g) ? "局おわり" : mine ? "あなたの番" : "相手の番";
  const hand = boardHand(g, me);
  $("drawn-label").textContent = hand.length === 9 ? "右端がひいた牌" : "";
  $("hand").innerHTML = tileRack(hand, g.drawn, true);
  for (const b of $("hand").querySelectorAll("button")) {
    b.disabled = !actionable || g.phase !== "discard";
    b.classList.toggle("riichi-option", choices.includes(Number(b.dataset.tile)));
  }
  $("discard").hidden = ended(g) || (claiming && mine);
  $("riichi").hidden = ended(g) || (claiming && mine);
  $("claim").hidden = !claiming || !mine;
  $("claim").textContent = g.phase === "ron" ? "ロン！" : "ツモ！";
  $("claim").disabled = pending || Boolean(errorMessage);
  $("show-result").hidden = !ended(g);
  $("discard").disabled = !actionable || g.phase !== "discard" || selected === null;
  $("discard").textContent = g.riichi[me]
    ? "リーチ中"
    : selected === null
      ? "牌を選んでね"
      : "この牌を捨てる";
  $("riichi").disabled = !actionable || !choices.includes(selected);
  $("selection-note").textContent =
    selected !== null
      ? choices.includes(selected)
        ? "リーチするなら「リーチ ＋1点」を押してね"
        : `${tileInfo(selected).name}・もう1回タップで捨てる`
      : mine && g.phase === "discard" && !g.riichi[me]
        ? "1回で選択、同じ牌をもう1回で捨てる"
        : "";
  $("status").textContent =
    errorMessage ||
    (pending
      ? "相手に届けています…"
      : ended(g)
        ? finish.description
        : !mine
          ? `${names[other]}の番です`
          : claiming
            ? g.phase === "ron"
              ? "相手の捨て牌で上がれます。「ロン」を押してね"
              : "手牌がそろいました。「ツモ」を押してね"
            : g.phase === "draw"
              ? "牌をひいています…"
              : g.riichi[me]
                ? "リーチ中・上がらなければ自動で捨てます"
                : choices.length
                  ? "光っている牌を捨てるとリーチできます"
                  : selected === null
                    ? "捨てる牌を1枚選んでね"
                    : "もう1回タップで、この牌を捨てます");
  $("round-history").innerHTML = Array.from({ length: 4 }, (_, i) => {
    const h = g.history[i];
    return `<span>${i + 1}局 <b>${!h ? "—" : h.winner === null ? "流局" : `${names[h.winner]} +${h.points}`}</b></span>`;
  }).join("");
  if (ended(g)) renderResult(g);
  else if ($("result").open) $("result").close();
  scheduleTurn();
}
function renderResult(g) {
  const r = g.result,
    final = g.phase === "matchEnd",
    finish = roundPresentation(g);
  const key = `${mode === "online" ? onlineView.generation : cpuMatch}:${g.round}`;
  const fresh = resultKey !== key;
  if (fresh) {
    resultKey = key;
    resultStage = "round";
  }
  const summary = final && resultStage === "match";
  $("round-result").hidden = summary;
  $("match-result").hidden = !summary;
  $("review-round").hidden = !summary;
  $("review-board").hidden = summary;
  $("show-result").textContent = summary ? "最終結果を見る →" : `第${g.round}局の結果を見る →`;
  $("result-eyebrow").textContent = `第${g.round}局の結果${final ? "・最終局" : ""}`;
  $("result-title").textContent =
    r.winner === null ? "今回は、流局" : `${names[r.winner]}の上がり！`;
  $("result-description").textContent =
    r.winner === null ? finish.source : finish.source + "で上がり";
  $("result-tile").innerHTML =
    finish.tile === null
      ? ""
      : `${tileMarkup(finish.tile, { winning: true })}<span>${tileInfo(finish.tile).name}<small>${r.method === "ron" ? "ロン" : "ツモ"}の決め手</small></span>`;
  $("result-tile").hidden = finish.tile === null;
  $("result-groups").innerHTML = groupsMarkup(r.score, finish.tile);
  $("result-points").innerHTML = r.score
    ? `<small>この局の得点</small><span>3組 ${r.score.base}点${r.score.bonus.points ? `<br>${r.score.bonus.name} +${r.score.bonus.points}点` : ""}${r.score.riichi ? "<br>リーチ +1点" : ""}</span><strong>+${r.score.total}<small>点</small></strong>`
    : "<small>この局の得点</small><strong>ふたりとも 0<small>点</small></strong>";
  if (summary) {
    const match = matchPresentation(g);
    $("result-eyebrow").textContent = "4局の最終結果";
    $("result-title").textContent = match.title;
    $("match-result").innerHTML = match.table;
  }
  const waiting = mode === "online" && onlineView.ready[seat];
  const reviewFinal = final && !summary;
  $("next").textContent = reviewFinal
    ? "4局の最終結果へ →"
    : errorMessage
      ? "通信が切れています"
      : waiting
        ? "相手を待っています…"
        : pending
          ? "相手に届けています…"
          : final
            ? "もう4局あそぶ →"
            : `第${g.round + 1}局へ →`;
  $("next").disabled = !reviewFinal && (waiting || pending || Boolean(errorMessage));
  if (fresh) {
    if (!$("result").open) $("result").showModal();
  }
}
function changeResultStage(stage) {
  if (current()?.phase !== "matchEnd") return;
  resultStage = stage;
  renderResult(current());
  $("result").scrollTop = 0;
  $("result-title").focus({ preventScroll: true });
}
$("hand").addEventListener("click", (event) => {
  const b = event.target.closest("button[data-tile]");
  if (!b || b.disabled) return;
  const tile = Number(b.dataset.tile);
  if (selected === tile) {
    act("discard", tile);
    return;
  }
  selected = tile;
  render();
  $("hand").querySelector(`[data-tile="${selected}"]`)?.focus({ preventScroll: true });
});
$("claim").addEventListener("click", () => {
  const phase = current()?.phase;
  if (phase === "ron" || phase === "tsumo") act(phase);
});
$("show-result").addEventListener("click", () => {
  if (!ended(current())) return;
  renderResult(current());
  if (!$("result").open) $("result").showModal();
});
$("review-board").addEventListener("click", () => {
  $("result").close();
  $("show-result").focus({ preventScroll: true });
});
$("review-round").addEventListener("click", () => changeResultStage("round"));
$("riichi").addEventListener("click", () => act("riichi", selected));
$("discard").addEventListener("click", () => act("discard", selected));
$("start").addEventListener("click", () => startCPU());
for (const b of document.querySelectorAll("[data-mode]"))
  b.addEventListener("click", () => {
    if (!connecting) {
      mode = b.dataset.mode;
      updateSetup();
    }
  });
$("host-room").addEventListener("click", () => {
  role = "host";
  updateSetup();
});
$("join-room").addEventListener("click", () => {
  role = "guest";
  updateSetup();
});
$("result").addEventListener("cancel", (event) => event.preventDefault());
$("next").addEventListener("click", () => {
  const g = current();
  if (!ended(g)) return;
  if (g.phase === "matchEnd" && resultStage === "round") {
    changeResultStage("match");
    return;
  }
  if (pending || errorMessage) return;
  if (mode === "online") {
    network?.submit(g.phase === "matchEnd" ? "rematch" : "next");
    return;
  }
  if (g.phase === "matchEnd") {
    startCPU(1 - game.first);
    return;
  }
  game = nextRound(game);
  selected = null;
  $("result").close();
  render();
  scheduleTurn();
});
function askLeave() {
  if (ended(current()) || errorMessage) {
    reset();
    return;
  }
  stopTimer();
  $("leave-dialog").showModal();
}
$("menu").addEventListener("click", askLeave);
$("finish-menu").addEventListener("click", askLeave);
$("stay").addEventListener("click", () => {
  $("leave-dialog").close();
  scheduleTurn();
});
$("leave-dialog").addEventListener("close", scheduleTurn);
$("leave").addEventListener("click", reset);
$("cancel-connect").addEventListener("click", reset);
$("connect").addEventListener("click", async () => {
  if (connecting) return;
  if (!isOnlineConfigured()) {
    $("connection-note").textContent = "通信の接続先が設定されていません。";
    return;
  }
  const code = role === "host" ? generateRoomCode() : normalizeRoomCode($("room-input").value);
  if (!code) {
    $("connection-note").textContent = "HAMU-から始まるキーワードを入れてね。";
    return;
  }
  connecting = true;
  const token = ++epoch;
  seat = role === "host" ? 0 : 1;
  errorMessage = "";
  selected = null;
  resultKey = "";
  $("room-code").textContent = code;
  $("room-waiting").hidden = role !== "host";
  $("connection-note").textContent = "相手が入るのを待っています…";
  $("connect").hidden = true;
  $("cancel-connect").hidden = false;
  updateSetup();
  try {
    const connection = await createMahjongMatch({
      role,
      roomCode: code,
      onState(view) {
        if (token !== epoch) return;
        onlineView = view;
        selected = null;
        $("setup").hidden = true;
        $("match").hidden = false;
        $("menu").hidden = false;
        render();
      },
      onStatus(status) {
        if (token !== epoch) return;
        pending = status === "sending";
        if (onlineView) render();
      },
      onReject(message) {
        if (token === epoch) {
          pending = false;
          render();
          $("status").textContent = message;
        }
      },
      onError(error) {
        if (token !== epoch) return;
        errorMessage = error.message;
        pending = false;
        if (onlineView) render();
        else {
          connecting = false;
          $("connection-note").textContent = error.message;
          $("connect").hidden = false;
          updateSetup();
        }
      },
    });
    if (token !== epoch) connection.close();
    else {
      network = connection;
      scheduleTurn();
    }
  } catch (error) {
    if (token !== epoch) return;
    connecting = false;
    $("connection-note").textContent = error.message;
    $("connect").hidden = false;
    updateSetup();
  }
});
$("copy-room").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("room-code").textContent);
    $("connection-note").textContent = "コピーしました。相手に送ってね。";
  } catch {
    $("connection-note").textContent = "キーワードを選んでコピーしてね。";
  }
});
window.addEventListener("pagehide", () => {
  stopTimer();
  network?.close();
});
$("tile-intro").innerHTML = [0, 18, 30].map((id) => tileMarkup(id)).join("");
$("rules-content").innerHTML = `
  ${tileCatalogMarkup()}
  <h3>3枚ずつ、3つの組をつくろう</h3>
  <p>手牌は8枚。自分の番になると自動で1枚ひいて9枚にし、上がれなければ1枚捨てます。<strong>同じ牌を2回タップ</strong>すると捨てられます。1回目は選択、2回目で確定。「この牌を捨てる」ボタンでも確定できます。</p>
  <div class="rule-examples"><div><div class="meld">${[0, 3, 6].map((id) => tileMarkup(id)).join("")}</div><b>同じキャラの連番：1点</b></div><div><div class="meld">${[18, 19, 20].map((id) => tileMarkup(id)).join("")}</div><b>同じ牌を3枚：3点</b></div></div>
  <div class="rule-tapi-example"><div class="meld">${[30, 31, 32].map((id) => tileMarkup(id)).join("")}</div><span>たぴも、同じ色を3枚で<strong>3点</strong></span></div>
  <p>連番は123・234・345。たくハムとめぐハムは混ぜられません。たぴは同じ色の3枚で1組です。自分でひいた牌でそろえば「ツモ」、相手の捨てた牌でそろえば「ロン」。上がれる牌が出ると進行が止まり、「ツモ」「ロン」ボタンが出ます。ボタンを押して上がりを宣言すると、決め手の牌・完成した3組・点数を表示します。組み方が複数あるときは、いちばん高い点数になります。</p>
  <dl><div><dt>オールたくハム / めぐハム</dt><dd>+5点</dd></div><div><dt>オールたぴ</dt><dd>+20点</dd></div><div><dt>リーチして上がり</dt><dd>+1点</dd></div></dl>
  <p>役は3組の点数に加算。オールたぴは合計29点です。上がった人だけに得点が入り、相手の点は減りません。</p>
  <p>あと1枚で上がれる形になる捨て牌を選ぶと「リーチ ＋1点」を押せます。宣言した捨て牌に赤い「リーチ」の印が付きます。宣言後は手牌を変えず、上がらない牌は自動で捨てます。上がるときは「ツモ」「ロン」を押してね。リーチの1点は上がったときだけ加算。流局は0点です。山が空のときは宣言できません。</p>
  <p>4局で先手を交代し、合計点をくらべます。4局目の得点を確認したら「4局の最終結果へ」で、各局の得点・合計・優勝者を見られます。同点は引き分け。山がなくなった局は0点です。鳴き・ドラはありません。</p>`;
prepareTileArt().catch(() => {
  $("load-note").textContent = "たぴの絵を読み込めませんでした。ページを再読み込みしてね。";
});
updateSetup();
