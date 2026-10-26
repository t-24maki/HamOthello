import {
  createGame,
  PLAYERS,
  chooseCharacters,
  playerInfo,
  fieldById,
  STEP,
  tick,
  pause,
  resume,
  scores,
  winners,
  DURATION,
  PAINT_SIZE,
} from "./engine.js?v=20261026-jintori6";
import { createCPU, cpuInput } from "./cpu.js?v=20261026-jintori6";
import { bindStick } from "./stick.js?v=20261026-jintori6";
import { createInput, KEYS } from "./input.js?v=20261026-jintori6";
import { protectGameSurface } from "../battle/controls.js?v=20261021-battle21";
import { createOnline, generateRoomCode, normalizeRoomCode } from "./online.js?v=20261026-jintori6";
import { loadArt, render, renderPaintMap, portrait } from "./renderer.js?v=20261026-jintori6";
import { createResultGate } from "./presentation.js?v=20261026-jintori6";
import { createMatchMusic, prepareMusicSource } from "./music.js?v=20261026-jintori6";
const $ = (id) => document.getElementById(id);
const input = createInput();
const resultGate = createResultGate();
let game = null,
  brains = [],
  art = [],
  online = null,
  onlineMode = false,
  seat = 0,
  character = 0;
let generation = 0,
  onlineInfo = null,
  errorMessage = "",
  siteMenuOpen = false,
  accumulator = 0,
  last = performance.now(),
  lastHUD = 0;
let modalMode = "",
  rankingMarkup = "",
  resultMapKey = "",
  displayedRound = -1,
  displayedEpoch = -1,
  reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let soundEnabled = false;
let musicLoaded = false;
let musicSource = null;
const music = createMatchMusic($("bgm"), () => {
  $("music-note").textContent = "BGMを再生できませんでした。音をOFF→ONにして、もう一度試してね。";
  $("sound").title = $("pause-sound").title = $("music-note").textContent;
});
void prepareMusicSource($("bgm"))
  .then((source) => {
    musicSource = source;
  })
  .catch(() => {
    $("music-note").textContent = "曲を読み込めませんでした。再読み込みして、もう一度試してね。";
  })
  .finally(() => {
    musicLoaded = true;
    syncMusic();
  });
function syncMusic() {
  music.sync({
    key: game ? `${generation}:${onlineInfo?.round || 0}` : null,
    phase: game?.phase || "",
    frame: game?.frame || 0,
    blocked:
      !musicLoaded || document.hidden || siteMenuOpen || !!errorMessage || !!onlineInfo?.waiting,
  });
}
function toggleSound() {
  soundEnabled = !soundEnabled;
  for (const id of ["sound", "pause-sound"]) {
    $(id).textContent = `♪ 音 ${soundEnabled ? "ON" : "OFF"}`;
    $(id).setAttribute("aria-pressed", String(soundEnabled));
    $(id).setAttribute("aria-label", `BGMを${soundEnabled ? "OFF" : "ON"}にする`);
    $(id).removeAttribute("title");
  }
  $("music-note").textContent = "♪ ハムハムサンバ — 音をONにすると、試合に合わせて流れるよ。";
  syncMusic();
  music.setEnabled(soundEnabled);
  music.unlock();
}
$("sound").addEventListener("click", toggleSound);
$("pause-sound").addEventListener("click", toggleSound);
const pad = bindStick($("controls"), input, {
  isActive: () =>
    game?.phase === "playing" &&
    !$("modal").open &&
    !siteMenuOpen &&
    !errorMessage &&
    !onlineInfo?.waiting,
});
protectGameSurface($("board"));
function clearInput() {
  pad.clear();
  accumulator = 0;
}
function playerLabel(i) {
  return `${i + 1} ${playerInfo(game, i).name}${i === seat ? "（自分）" : onlineMode && i < 2 ? "（相手）" : "（CPU）"}`;
}
function buildScoreboard() {
  $("scoreboard").innerHTML = game.players
    .map((_, i) => playerInfo(game, i))
    .map(
      (p, i) =>
        `<div class="score${i === seat ? " mine" : ""}" style="--player-color:${p.color}" role="group" aria-label="${playerLabel(i)}"><span>${i + 1} ${p.name}</span><strong id="score-${i}">0.0<small>%</small></strong></div>`,
    )
    .join("");
  $("you-label").textContent = `${seat + 1} ${playerInfo(game, seat).name}が自分`;
}
function updateHUD() {
  if (!game) return;
  $("field-name").textContent = fieldById(game.fieldId).name;
  $("seconds").textContent = String(Math.ceil(DURATION - game.frame * STEP));
  $("seconds").parentElement.classList.toggle("urgent", game.frame >= (DURATION - 5) / STEP);
  for (const score of scores(game))
    $("score-" + score.player).firstChild.textContent = score.percent.toFixed(1);
  const effects = game.players.flatMap((p, i) => [
    ...(p.giantFrames > 0
      ? [`${playerInfo(game, i).name}は巨大化、あと${Math.ceil(p.giantFrames / 60)}秒`]
      : []),
    ...(p.dashFrames > 0
      ? [`${playerInfo(game, i).name}はダッシュ、あと${Math.ceil(p.dashFrames / 60)}秒`]
      : []),
    ...(p.stunFrames > 0 ? [`${playerInfo(game, i).name}は衝突して停止中`] : []),
  ]);
  $("board").setAttribute(
    "aria-label",
    [
      `${fieldById(game.fieldId).name}のフィールド`,
      "スティックまたはWASDで移動",
      ...game.items.potions.map((item) =>
        item.type === "dash" ? "ダッシュアイテム" : "巨大化アイテム",
      ),
      ...effects,
      game.phase === "finished" ? "終了。最終的な塗り分けを表示しています" : "",
    ]
      .filter(Boolean)
      .join("。") + "。",
  );
}
function showMatch() {
  $("setup").hidden = true;
  $("match").hidden = false;
  buildScoreboard();
  updateHUD();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function syncModal() {
  syncMusic();
  if (!game && !errorMessage) return;
  const resultKey = `${generation}:${onlineInfo?.round || 0}`;
  const resultReady = resultGate.ready(resultKey, game?.phase === "finished");
  if (game?.phase === "finished") clearInput();
  const hold = onlineInfo?.waiting && game?.phase !== "finished";
  const mode = errorMessage
    ? "error"
    : game?.phase === "finished" && resultReady
      ? "finished"
      : game?.phase === "paused" || hold
        ? "paused"
        : "";
  if (mode !== modalMode) {
    clearInput();
    modalMode = mode;
  }
  if (!mode) {
    if ($("modal").open) $("modal").close();
    return;
  }
  $("pause-sound").hidden = mode !== "paused";
  $("ranking").hidden = mode !== "finished";
  $("result-map").hidden = mode !== "finished";
  $("modal-note").hidden = mode === "finished";
  $("continue").hidden = mode === "error";
  $("continue").disabled = false;
  if (mode === "error") {
    $("modal-kicker").textContent = "CONNECTION";
    $("modal-title").textContent = "通信がとまったよ";
    $("modal-note").textContent = errorMessage;
  } else if (mode === "paused") {
    const initial = game.frame === 0 && game.countdown === 180;
    $("modal-kicker").textContent = onlineMode ? "ONLINE / 4 PLAYERS" : "PAUSE";
    $("modal-title").textContent = initial ? "じゅんびはいい？" : "ひとやすみ";
    $("modal-note").textContent = onlineMode
      ? `${fieldById(game.fieldId).name} ／ 自分は${playerInfo(game, seat).name}。ふたりが準備できたらスタート。`
      : "時間は止まっているよ。";
    const waiting = onlineMode && (onlineInfo?.ready[seat] || onlineInfo?.waiting);
    $("continue").textContent = waiting
      ? "相手の準備を待っています…"
      : onlineMode
        ? "準備できた！"
        : "つづける";
    $("continue").disabled = !!waiting;
  } else {
    const win = winners(game);
    $("modal-kicker").textContent = `TIME UP! / ${DURATION}秒の結果`;
    $("modal-title").textContent =
      win.length > 1
        ? "引き分け！"
        : win[0] === seat
          ? "あなたの勝ち！"
          : `${playerInfo(game, win[0]).name}の勝ち！`;
    $("modal-note").textContent =
      win.length > 1
        ? "いちばん広い色が、同じ広さだったよ。"
        : "いっぱい歩いて、いっぱいぬったね。";
    const result = scores(game).sort((a, b) => b.count - a.count);
    if (resultMapKey !== resultKey) {
      renderPaintMap($("result-board"), game);
      $("result-board").setAttribute(
        "aria-label",
        `${fieldById(game.fieldId).name}の最終的な塗り分け。${result.map((s) => `${playerInfo(game, s.player).name} ${s.percent.toFixed(1)}%`).join("、")}。`,
      );
      resultMapKey = resultKey;
    }
    const markup = result
      .map(
        (s) =>
          `<div class="rank" style="--player-color:${playerInfo(game, s.player).color}"><span>${1 + result.filter((other) => other.count > s.count).length}位</span><span class="swatch"></span><span>${playerLabel(s.player)}</span><b>${s.percent.toFixed(1)}<small>%</small></b></div>`,
      )
      .join("");
    if (markup !== rankingMarkup) {
      $("ranking").innerHTML = markup;
      rankingMarkup = markup;
    }
    const waiting = onlineMode && (onlineInfo?.rematch[seat] || onlineInfo?.waiting);
    $("continue").textContent = waiting
      ? "相手の再戦を待っています…"
      : "もういちど（ランダムな場所）";
    $("continue").disabled = !!waiting;
  }
  if (!siteMenuOpen && !$("modal").open) $("modal").showModal();
}
function startCPU() {
  leaveRoom();
  seat = 0;
  onlineMode = false;
  errorMessage = "";
  game = createGame(undefined, undefined, chooseCharacters([character]));
  brains = PLAYERS.map((_, i) => createCPU(game.seed + i * 1009));
  clearInput();
  showMatch();
  syncModal();
  last = performance.now();
  music.unlock();
}
function leaveRoom() {
  music.reset();
  generation++;
  online?.close();
  online = null;
  onlineInfo = null;
  $("host").disabled = $("join").disabled = $("room-input").disabled = false;
  $("cancel-room").hidden = true;
  $("room-code-row").hidden = true;
  $("connection-status").textContent = "";
  setCharacterDisabled(false);
}
function home() {
  leaveRoom();
  clearInput();
  game = null;
  errorMessage = "";
  onlineMode = false;
  modalMode = "";
  if ($("modal").open) $("modal").close();
  $("match").hidden = true;
  $("setup").hidden = false;
  $("lobby").hidden = true;
  syncMusic();
  $("cpu-start").focus();
}
function requestPause() {
  clearInput();
  if (!game || !["playing", "countdown"].includes(game.phase)) return;
  if (onlineMode) online?.request("pause");
  else {
    pause(game);
    syncModal();
  }
  syncMusic();
}
function onlineChanged(info) {
  onlineInfo = info;
  game = info.game;
  seat = info.seat;
  if (!game) return;
  if (displayedRound !== info.round || displayedEpoch !== info.epoch) {
    clearInput();
    displayedRound = info.round;
    displayedEpoch = info.epoch;
  }
  if ($("match").hidden) showMatch();
  updateHUD();
  syncModal();
}
async function connect(role, code) {
  leaveRoom();
  const token = generation;
  onlineMode = true;
  seat = role === "host" ? 0 : 1;
  errorMessage = "";
  displayedEpoch = displayedRound = -1;
  $("host").disabled = $("join").disabled = $("room-input").disabled = true;
  $("cancel-room").hidden = false;
  $("connection-status").textContent = "つないでいます…";
  setCharacterDisabled(true);
  if (role === "host") {
    $("room-code-row").hidden = false;
    $("room-code").textContent = code;
  }
  const failed = (error) => {
    if (generation !== token) return;
    clearInput();
    errorMessage = error.message;
    if (game) syncModal();
    else {
      leaveRoom();
      onlineMode = false;
      $("connection-status").textContent = error.message;
    }
  };
  try {
    const session = await createOnline({
      role,
      roomCode: code,
      character,
      onChange: (info) => {
        if (token === generation) onlineChanged(info);
      },
      onError: failed,
    });
    if (token !== generation) {
      session.close();
      return;
    }
    online = session;
    $("connection-status").textContent =
      role === "host" ? "相手が入るのを待っています。" : "相手のへやを探しています。";
    onlineChanged(session.info());
  } catch (error) {
    failed(error);
  }
}
const characterButtons = [...document.querySelectorAll("[data-character]")];
function setCharacterDisabled(disabled) {
  characterButtons.forEach((button) => {
    button.disabled = disabled;
  });
  $("cpu-start").disabled = disabled;
}
characterButtons.forEach((button) =>
  button.addEventListener("click", () => {
    character = Number(button.dataset.character);
    characterButtons.forEach((choice) =>
      choice.setAttribute("aria-pressed", String(choice === button)),
    );
  }),
);
function drawCharacters() {
  characterButtons.forEach((button, i) => {
    const canvas = button.querySelector("canvas"),
      ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const size = i === 3 ? 112 : 140;
    portrait(ctx, art[i], i, (160 - size) / 2, 150 - size, size);
  });
}
$("cpu-start").addEventListener("click", startCPU);
$("online-show").addEventListener("click", () => {
  $("lobby").hidden = !$("lobby").hidden;
  if (!$("lobby").hidden) $("host").focus();
});
$("host").addEventListener("click", () => connect("host", generateRoomCode()));
$("join-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const code = normalizeRoomCode($("room-input").value);
  if (!/^HAMU-[A-Z2-9]{6}$/.test(code)) {
    $("connection-status").textContent = "HAMU-から始まる6文字のキーワードを入れてね。";
    return;
  }
  $("room-input").value = code;
  void connect("guest", code);
});
$("copy-code").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("room-code").textContent);
    $("connection-status").textContent = "コピーしたよ。相手に送ってね。";
  } catch {
    $("connection-status").textContent = "表示されたキーワードを相手に伝えてね。";
  }
});
$("cancel-room").addEventListener("click", () => {
  leaveRoom();
  onlineMode = false;
});
$("pause").addEventListener("click", requestPause);
$("home").addEventListener("click", home);
$("continue").addEventListener("click", () => {
  clearInput();
  if (onlineMode) online?.request(game.phase === "finished" ? "rematch" : "ready");
  else if (game.phase === "finished") startCPU();
  else {
    resume(game);
    syncModal();
    last = performance.now();
  }
  syncMusic();
  music.unlock();
});
$("modal").addEventListener("cancel", (event) => event.preventDefault());
window.addEventListener("keydown", (event) => {
  if (!game || siteMenuOpen || event.target.closest?.("input,textarea,select")) return;
  if (event.code === "Escape" || event.code === "KeyP") {
    event.preventDefault();
    if (!$("modal").open) requestPause();
    return;
  }
  const action = KEYS[event.code];
  if (
    action &&
    !$("modal").open &&
    game.phase === "playing" &&
    !onlineInfo?.waiting &&
    !errorMessage
  ) {
    event.preventDefault();
    input.press("key:" + event.code, action);
    pad.refresh();
  }
});
window.addEventListener("keyup", (event) => {
  input.release("key:" + event.code);
  pad.refresh();
});
window.addEventListener("blur", requestPause);
window.addEventListener("resize", clearInput);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) requestPause();
  syncMusic();
});
window.addEventListener("pagehide", () => {
  music.reset();
  clearInput();
  online?.close();
});
window.addEventListener("unload", () => {
  if (musicSource) URL.revokeObjectURL(musicSource);
});
window.addEventListener("takumegu-menu", (event) => {
  siteMenuOpen = event.detail.open;
  if (siteMenuOpen) {
    requestPause();
    if ($("modal").open) $("modal").close();
  } else syncModal();
});
const preview = createGame(16, "garden");
preview.players = [
  [8.5, 10.5],
  [16.5, 10.5],
  [16.5, 15.5],
  [8.5, 15.5],
].map(([x, y]) => ({ x, y, dx: 0, dy: 0 }));
preview.paint = preview.paint.map((value, i) =>
  value < 0
    ? -1
    : i % PAINT_SIZE < PAINT_SIZE / 2
      ? i < PAINT_SIZE ** 2 / 2
        ? 1
        : 4
      : i < PAINT_SIZE ** 2 / 2
        ? 2
        : 3,
);
render($("preview"), preview, art, 0, 0, true);
void loadArt().then((images) => {
  art = images;
  drawCharacters();
  render($("preview"), preview, art, 0, 0, true);
});
function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  if (game && !errorMessage && !siteMenuOpen) {
    if (onlineMode) online?.update(dt, () => input.consume());
    else if (["playing", "countdown"].includes(game.phase)) {
      if (dt > 0.25) requestPause();
      else {
        accumulator += dt;
        while (accumulator + 1e-9 >= STEP && ["playing", "countdown"].includes(game.phase)) {
          accumulator -= STEP;
          tick(game, [input.consume(), ...[1, 2, 3].map((i) => cpuInput(game, brains[i], i))]);
        }
        if (game.phase === "finished") syncModal();
      }
    }
  }
  if (game) {
    if (game.phase === "finished" && modalMode !== "finished") syncModal();
    const view = onlineMode ? online?.renderGame(dt) || game : game;
    render($("board"), view, art, seat, reducedMotion ? 0 : now / 1000);
    if (now - lastHUD > 100) {
      updateHUD();
      lastHUD = now;
    }
  }
  syncMusic();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
