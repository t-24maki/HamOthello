import {
  createMatch,
  createRoster,
  advance,
  pause,
  resume,
  CHARACTERS,
  STEP,
} from "./engine.js?v=20261021-battle21";
import { createCPU, cpuInput } from "./cpu.js?v=20261021-battle21";
import { createInput, KEY_ACTIONS } from "./input.js?v=20261021-battle21";
import { bindControls, protectGameSurface } from "./controls.js?v=20261021-battle21";
import { loadArt, render, renderStageMap } from "./renderer.js?v=20261021-battle21";
import { getStage, STAGES, platformsAt, surfaceAt } from "./stages.js?v=20261021-battle21";
import { createBattleMusic, wantsMusic } from "./music.js?v=20261021-battle21";
import { fighterAppearance, fighterLabel } from "./appearance.js?v=20261021-battle21";
import {
  createBattleOnline,
  generateRoomCode,
  normalizeRoomCode,
} from "./online.js?v=20261021-battle21";
const $ = (id) => document.getElementById(id);
const arena = $("arena"),
  preview = $("preview"),
  controls = $("controls");
const context = arena.getContext("2d"),
  previewContext = preview.getContext("2d");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let siteMenuOpen = false;
const input = createInput();
const controlInput = bindControls(controls, input, {
  isActive: interactive,
  onInteract: unlockAudio,
});
let art,
  match,
  brains,
  lastTime = 0,
  lastEvent = 0,
  resultShown = false;
let soundEnabled = false,
  audio;
const music = createBattleMusic($("bgm"), () => {
  $("music-note").textContent = "BGMが流れないときは、音をOFF→ONにしてね。";
});
function syncMusic() {
  music.setPlaying(
    wantsMusic(soundEnabled, match?.phase, document.hidden) &&
      !networkError &&
      !online?.info().waiting,
  );
}
let online = null,
  connecting = false,
  roomRole = "host",
  roomCode = "",
  connectionToken = 0;
let networkError = "",
  localSeat = 0,
  netRound = 0,
  netEpoch = 0;
const onlineMode = () => $("settings").elements.mode.value === "online";
const playerCount = () => Number($("settings").elements.players.value);
function cpuChoices(data, count) {
  return [data.get("opponent"), data.get("opponent2"), data.get("opponent3")].slice(0, count);
}
function hudSeats() {
  return [
    { prefix: "you", seat: localSeat, label: "you-label" },
    { prefix: "cpu", seat: 1 - localSeat, label: "opponent-label" },
    ...match.fighters
      .slice(2)
      .map((_, i) => ({ prefix: `cpu${i + 2}`, seat: i + 2, label: `cpu${i + 2}-label` })),
  ];
}
function setupOptions() {
  const net = onlineMode(),
    busy = connecting || !!online;
  $("start").hidden = net;
  $("online-setup").hidden = !net;
  const guest = net && roomRole === "guest",
    four = playerCount() === 4;
  $("player-count-settings").hidden = guest;
  $("cpu-settings").hidden = net && (!four || guest);
  $("cpu-character-label").textContent = four ? "CPU 1" : "相手のキャラ";
  $("cpu-choice-2").hidden = !four;
  $("cpu-choice-3").hidden = !four || net;
  $("stage-settings").hidden = net && roomRole === "guest";
  $("character-note").hidden = !net;
  for (const el of $("settings").querySelectorAll("input, select")) el.disabled = busy;
  $("host-room").disabled = $("join-room").disabled = busy;
  $("host-room").setAttribute("aria-pressed", String(roomRole === "host"));
  $("join-room").setAttribute("aria-pressed", String(roomRole === "guest"));
  $("join-field").hidden = roomRole !== "guest";
  $("connect").hidden = busy;
  $("leave-room").hidden = !busy;
  $("room-waiting").hidden = !busy || roomRole !== "host";
  $("connect").textContent = roomRole === "host" ? "へやをつくる →" : "へやに入る →";
  $("room-help").textContent =
    roomRole === "host"
      ? "人数・CPU・ステージを選んで、へやをつくるよ。"
      : "好きなキャラを選んで、相手のキーワードを入れてね。人数・CPU・ステージは相手が選ぶよ。";
}
function leaveOnline() {
  connectionToken++;
  online?.close();
  online = null;
  connecting = false;
  networkError = "";
  netRound = netEpoch = 0;
  $("online-status").textContent = "";
  setupOptions();
}
for (const role of ["host", "join"])
  $(role + "-room").addEventListener("click", () => {
    roomRole = role === "host" ? "host" : "guest";
    setupOptions();
    updatePreview();
  });
$("leave-room").addEventListener("click", leaveOnline);
$("copy-room").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    $("online-status").textContent = "コピーしたよ。相手に教えてね。";
  } catch {
    $("online-status").textContent = "表示されたキーワードを、相手に教えてね。";
  }
});
$("connect").addEventListener("click", connectRoom);
let previewMatch;
for (const stage of STAGES) renderStageMap($("map-" + stage.id), stage);
function updatePreview() {
  const data = new FormData($("settings"));
  const others = onlineMode()
    ? ["random", ...(playerCount() === 4 && roomRole === "host" ? cpuChoices(data, 2) : [])]
    : cpuChoices(data, playerCount() - 1);
  const roster = createRoster(data.get("character"), others, () => 0);
  previewMatch = createMatch(
    roster[0],
    data.get("difficulty"),
    data.get("stage"),
    roster[1],
    undefined,
    roster.slice(2),
  );
  $("jump-rule").textContent = `↑ ${CHARACTERS[data.get("character")].maxJumps}段ジャンプ`;
  previewMatch.online = onlineMode();
  const stage = getStage(previewMatch.stageId);
  $("stage-number").textContent = `STAGE ${stage.number}`;
  $("stage-name").textContent = stage.name;
  $("stage-description").textContent = stage.description;
  preview.setAttribute(
    "aria-label",
    `${stage.name}のプレビュー。${previewMatch.fighters.map((_, i) => fighterAppearance(previewMatch, i).name).join("・")}。${stage.description}`,
  );
  if (art) render(previewContext, art, previewMatch, 0, true, true);
}
$("settings").addEventListener("change", () => {
  setupOptions();
  updatePreview();
});
setupOptions();
updatePreview();
function fit(canvas) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(rect.width * ratio),
    h = Math.round(rect.height * ratio);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}
const observer = new ResizeObserver(() => {
  fit(arena);
  fit(preview);
  if (art && !match) render(previewContext, art, previewMatch, 0, true, true);
});
observer.observe(arena);
observer.observe(preview);
function unlockAudio() {
  if (!soundEnabled) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (Audio) {
      audio ||= new Audio();
      if (audio.state === "suspended") void audio.resume().catch(() => {});
    }
  } catch {
    /* Audio may be unavailable; the game remains fully playable. */
  }
}
function tone(frequency, length = 0.1, end = frequency, delay = 0) {
  if (!soundEnabled || !audio || audio.state !== "running") return;
  const oscillator = audio.createOscillator(),
    gain = audio.createGain(),
    t = audio.currentTime + delay;
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, t);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, end), t + length);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.08, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(t);
  oscillator.stop(t + length + 0.02);
}
function sound(type) {
  if (type === "hit") tone(220, 0.13, 90);
  else if (type === "jump") tone(350, 0.11, 600);
  else if (type === "special") tone(300, 0.22, 920);
  else if (type === "block") tone(750, 0.06, 540);
  else if (type === "swing") tone(260, 0.05, 180);
  else if (type === "out") tone(650, 0.32, 110);
  else if (type === "grow") {
    tone(390, 0.18, 650);
    tone(650, 0.22, 980, 0.12);
  } else if (type === "finish") {
    tone(523, 0.18, 523);
    tone(659, 0.18, 659, 0.15);
    tone(784, 0.3, 784, 0.3);
  } else if (type === "start") tone(740, 0.2, 1000);
}
function toggleSound() {
  soundEnabled = !soundEnabled;
  for (const id of ["sound", "pause-sound"]) {
    $(id).textContent = soundEnabled ? "♪ 音 ON" : "♪ 音 OFF";
    $(id).setAttribute("aria-pressed", String(soundEnabled));
  }
  if (soundEnabled) {
    unlockAudio();
    tone(660, 0.08);
  } else if (audio) void audio.suspend().catch(() => {});
  syncMusic();
}
$("sound").addEventListener("click", toggleSound);
$("pause-sound").addEventListener("click", toggleSound);
function clearInput() {
  controlInput.clear();
}
function interactive() {
  return (
    match?.phase === "playing" &&
    match.fighters[localSeat].stocks > 0 &&
    !networkError &&
    !online?.info().waiting
  );
}
function startMatch(savedRoster) {
  leaveOnline();
  localSeat = 0;
  const data = new FormData($("settings"));
  const roster =
    savedRoster ?? createRoster(data.get("character"), cpuChoices(data, playerCount() - 1));
  match = createMatch(
    roster[0],
    data.get("difficulty"),
    data.get("stage"),
    roster[1],
    undefined,
    roster.slice(2),
  );
  brains = match.fighters.map(() => createCPU());
  beginMatchUI();
  syncMusic();
  unlockAudio();
}
function beginMatchUI() {
  $("pause-dialog").close();
  $("result-dialog").close();
  music.reset();
  lastEvent = 0;
  resultShown = false;
  lastTime = performance.now();
  clearInput();
  $("setup").hidden = true;
  $("match").hidden = false;
  $("match").setAttribute("aria-label", onlineMode() ? "通信対戦" : "CPU対戦");
  $("match").classList.toggle("four-player", match.fighters.length === 4);
  for (const el of document.querySelectorAll(".extra-hud")) el.hidden = match.fighters.length !== 4;
  $("match-stage").textContent = `${match.fighters.length}人戦・${getStage(match.stageId).name}`;
  $("opponent-label").textContent = onlineMode() ? "相手" : "CPU";
  $("choose").textContent = onlineMode() ? "へやを出る" : "キャラえらびにもどる";
  $("rematch").disabled = false;
  $("rematch").textContent = "もういちど、バトル！";
  for (const { prefix, seat, label } of hudSeats()) {
    const look = fighterAppearance(match, seat);
    const char = look.character;
    $(prefix + "-name").textContent = CHARACTERS[char].name;
    $(prefix + "-icon").src = art.portraits[`${look.key}-icon`];
    $(prefix + "-name").closest(".fighter-hud").dataset.palette = look.key;
    $(prefix + "-name")
      .closest(".fighter-hud")
      .style.setProperty("--fighter-ink", look.ink);
    const player = fighterLabel(match, seat, localSeat, onlineMode());
    $(label).textContent = player;
    $(prefix + "-name")
      .closest(".fighter-hud")
      .setAttribute("aria-label", `${player}・${look.name}`);
    $(prefix + "-name").closest(".fighter-hud").dataset.character = char;
  }
  $("match-status").textContent = "もうすぐ、はじまるよ！";
  fit(arena);
  updateHUD();
  arena.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "instant" });
}
function onlineChanged(state) {
  if (!state.game || networkError) return;
  match = state.game;
  localSeat = state.seat;
  if (state.round !== netRound) {
    netRound = state.round;
    beginMatchUI();
  }
  if (netEpoch !== state.epoch) {
    netEpoch = state.epoch;
    clearInput();
  }
  if (match.phase === "paused" || (state.waiting && match.phase !== "finished")) {
    clearInput();
    $("pause-title").textContent =
      match.beforePause === "countdown" ? "ふたりの準備" : "ひとやすみ中";
    $("match-characters").hidden = false;
    $("match-characters").textContent = hudSeats()
      .map(
        ({ seat }) =>
          `${fighterLabel(match, seat, localSeat, true)}：${fighterAppearance(match, seat).name}`,
      )
      .join("\n");
    $("pause-note").textContent = state.ready[1 - localSeat]
      ? "相手は準備OK！ あなたの準備ができたら始めよう。"
      : "ふたりが「準備OK！」を押すと始まるよ。";
    $("resume").disabled = state.ready[localSeat] || state.waiting;
    $("resume").textContent = state.ready[localSeat]
      ? "相手の準備を待っているよ"
      : state.waiting
        ? "相手と確認中…"
        : "準備OK！";
    $("quit").textContent = "へやを出る";
    if (!siteMenuOpen && !$("pause-dialog").open) $("pause-dialog").showModal();
  } else $("pause-dialog").close();
  if (match.phase === "finished") {
    $("rematch").disabled = state.rematch[localSeat] || state.waiting;
    $("rematch").textContent =
      state.rematch[localSeat] || state.waiting
        ? "相手の再戦を待っているよ"
        : state.rematch[1 - localSeat]
          ? "相手も再戦したいみたい！"
          : "もういちど、バトル！";
  }
  syncMusic();
}
function onlineFailed(error) {
  networkError = error.message || "通信が切れたよ。へやを出て、つなぎ直してね。";
  clearInput();
  music.setPlaying(false);
  if (!match) {
    leaveOnline();
    $("online-status").textContent = error.message;
    return;
  }
  $("result-dialog").close();
  $("pause-title").textContent = "通信がとまったよ";
  $("pause-note").textContent = networkError;
  $("resume").disabled = true;
  $("resume").textContent = "つなぎ直しが必要です";
  $("quit").textContent = "へやを出る";
  if (!siteMenuOpen && !$("pause-dialog").open) $("pause-dialog").showModal();
}
async function connectRoom() {
  if (connecting || online) return;
  if (!art) {
    await prepare();
    if (!art) return;
  }
  roomCode = roomRole === "host" ? generateRoomCode() : normalizeRoomCode($("room-input").value);
  if (!/^HAMU-[A-Z2-9]{6}$/.test(roomCode)) {
    $("online-status").textContent = "HAMU- から始まる6文字のキーワードを入れてね。";
    return;
  }
  const data = new FormData($("settings")),
    token = ++connectionToken;
  connecting = true;
  networkError = "";
  $("room-code").textContent = roomCode;
  setupOptions();
  $("online-status").textContent = "つないでいるよ… 相手が入るまで待ってね。";
  unlockAudio();
  if (soundEnabled) music.unlock();
  try {
    const session = await createBattleOnline({
      role: roomRole,
      roomCode,
      character: data.get("character"),
      stageId: data.get("stage"),
      playerCount: Number(data.get("players")),
      cpuCharacters: cpuChoices(data, 2),
      difficulty: data.get("difficulty"),
      onChange: (state) => {
        if (token === connectionToken) onlineChanged(state);
      },
      onError: (error) => {
        if (token === connectionToken) onlineFailed(error);
      },
    });
    if (token !== connectionToken) {
      session.close();
      return;
    }
    online = session;
    connecting = false;
    $("online-status").textContent =
      roomRole === "host"
        ? "へやができたよ。相手を待っているよ。"
        : "へやにつながったよ。相手を確認中…";
    setupOptions();
  } catch (error) {
    if (token === connectionToken) onlineFailed(error);
  }
}
$("settings").addEventListener("submit", (event) => {
  event.preventDefault();
  if (onlineMode()) {
    void connectRoom();
    return;
  }
  if (art) startMatch();
  else void prepare();
});
function toMenu() {
  leaveOnline();
  clearInput();
  match = null;
  music.reset();
  $("pause-dialog").close();
  $("result-dialog").close();
  $("match").hidden = true;
  $("setup").hidden = false;
  fit(preview);
  render(previewContext, art, previewMatch, 0, true, true);
  $(onlineMode() ? "connect" : "start").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "instant" });
}
function pauseMatch() {
  clearInput();
  if (online) {
    online.request("pause");
    syncMusic();
    return;
  }
  if (!match || !pause(match)) return;
  syncMusic();
  $("match-characters").hidden = true;
  $("pause-title").textContent = "ひとやすみ中";
  $("pause-note").textContent = "じゅんびができたら、つづきから。";
  $("resume").disabled = false;
  $("resume").textContent = "つづける";
  $("quit").textContent = "キャラえらびにもどる";
  if (!siteMenuOpen) $("pause-dialog").showModal();
  if (audio?.state === "running") void audio.suspend().catch(() => {});
}
function resumeMatch() {
  if (networkError) return;
  if (online) {
    clearInput();
    unlockAudio();
    if (soundEnabled) music.unlock();
    online.request("ready");
    return;
  }
  if (!match || !resume(match)) return;
  clearInput();
  lastTime = performance.now();
  $("pause-dialog").close();
  syncMusic();
  unlockAudio();
  arena.focus({ preventScroll: true });
}
$("pause").addEventListener("click", pauseMatch);
window.addEventListener("takumegu-menu", (event) => {
  siteMenuOpen = event.detail.open;
  if (siteMenuOpen) {
    clearInput();
    if (match && ["playing", "countdown"].includes(match.phase)) pauseMatch();
  } else if (match && (match.phase === "paused" || networkError) && !$("pause-dialog").open) {
    $("pause-dialog").showModal();
  } else if (match?.phase === "finished" && !$("result-dialog").open) {
    $("result-dialog").showModal();
  }
});
$("resume").addEventListener("click", resumeMatch);
$("quit").addEventListener("click", toMenu);
$("choose").addEventListener("click", toMenu);
$("rematch").addEventListener("click", () => {
  if (online) {
    online.request("rematch");
    return;
  }
  $("result-dialog").close();
  startMatch(match.fighters.map((f) => f.character));
});
$("pause-dialog").addEventListener("cancel", (e) => {
  e.preventDefault();
  resumeMatch();
});
$("result-dialog").addEventListener("cancel", (e) => {
  e.preventDefault();
  toMenu();
});
function showResult() {
  clearInput();
  resultShown = true;
  syncMusic();
  const winner = match.winner,
    look = fighterAppearance(match, winner === null ? localSeat : winner);
  $("result-eyebrow").textContent =
    winner === null ? "NICE BATTLE!" : winner === localSeat ? "YOU WIN!" : "GOOD TRY!";
  $("result-title").textContent = winner === null ? "なかよく、ひきわけ！" : `${look.name}の勝ち！`;
  $("result-art").src = art.portraits[`${look.key}-win`];
  $("result-detail").textContent =
    (match.reason === "time"
      ? "時間いっぱい！ 残り回数 → 低い％で判定。"
      : winner === null
        ? "最後のぽよんで、なかよく引き分け。"
        : winner === localSeat
          ? "やったね！ 最後まで残れたよ。"
          : "おつかれさま。もうひと勝負してみよう！") +
    "\n" +
    hudSeats()
      .map(({ seat }) => {
        const f = match.fighters[seat];
        return `${fighterLabel(match, seat, localSeat, !!online)} ${f.stocks}回・${Math.round(f.damage)}%`;
      })
      .join(match.fighters.length === 4 ? "\n" : " ／ ");
  $("match-status").textContent = winner === null ? "いい勝負だったね！" : `${look.name}の勝ち！`;
  if (!siteMenuOpen) $("result-dialog").showModal();
}
function updateHUD() {
  for (const { prefix, seat } of hudSeats()) {
    const f = match.fighters[seat];
    $(prefix + "-name")
      .closest(".fighter-hud")
      .classList.toggle("eliminated", !f.stocks);
    const damageHTML = `${Math.round(f.damage)}<small>%</small>`;
    if ($(prefix + "-damage").innerHTML !== damageHTML)
      $(prefix + "-damage").innerHTML = damageHTML;
    $(prefix + "-damage").classList.toggle("danger", f.damage >= 80);
    $(prefix + "-stocks").textContent = Array.from({ length: 3 }, (_, n) =>
      n < f.stocks ? "♥" : "♡",
    ).join(" ");
    $(prefix + "-stocks").setAttribute("aria-label", `残り${f.stocks}回`);
  }
  const sec = Math.ceil(match.remaining);
  $("timer").textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  const f = match.fighters[localSeat];
  const spectating = !f.stocks && match.phase !== "finished";
  $("spectator").hidden = !spectating;
  controls.classList.toggle("spectating", spectating);
  const specialStatus = !f.stocks
    ? "観戦中"
    : f.airSpecial
      ? "ひっさつ 着地で回復"
      : f.specialCooldown > 0
        ? "ひっさつ じゅんび中"
        : "ひっさつ OK";
  if ($("special-status").textContent !== specialStatus)
    $("special-status").textContent = specialStatus;
  $("special-button").classList.toggle(
    "is-unavailable",
    !f.stocks || f.airSpecial || f.specialCooldown > 0,
  );
  controls
    .querySelector('[data-action="guard"]')
    .classList.toggle(
      "is-unavailable",
      !f.stocks || !f.grounded || f.guardLock > 0 || f.shield <= 0,
    );
}
window.addEventListener("keydown", (e) => {
  if (!match || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === "Escape" || e.code === "KeyP") {
    if (e.repeat) {
      e.preventDefault();
      return;
    }
    if (match.phase === "playing" || match.phase === "countdown") {
      e.preventDefault();
      pauseMatch();
    } else if (e.code === "KeyP" && match.phase === "paused") {
      e.preventDefault();
      resumeMatch();
    }
    return;
  }
  const action = KEY_ACTIONS[e.code];
  if (!action || !interactive()) return;
  // Keep Space/Enter activation available to keyboard users focusing a UI button.
  if (e.code === "Space" && e.target.closest?.("button")) return;
  e.preventDefault();
  if (e.repeat) return;
  input.press(`key:${e.code}`, action);
  controlInput.refresh();
  unlockAudio();
});
window.addEventListener("keyup", (e) => {
  if (KEY_ACTIONS[e.code]) input.release(`key:${e.code}`);
  controlInput.refresh();
});
// Also protect HUD and spaces between the canvas and controls. The pause
// button keeps native click activation; its touch-action still prevents zoom.
protectGameSurface($("match"), {
  allowTarget: (target) => !!target.closest?.("#pause"),
});
window.addEventListener("blur", () => {
  clearInput();
  if (!online) pauseMatch();
});
window.addEventListener("pagehide", pauseMatch);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseMatch();
});
function frame(now) {
  const seconds = lastTime ? Math.max(0, (now - lastTime) / 1000) : 0;
  lastTime = now;
  if (art && match) {
    if (online) online.update(seconds, () => input.consume());
    else if (!connecting)
      advance(match, seconds, () =>
        match.fighters.map((_, i) =>
          i === 0 ? input.consume() : cpuInput(match, brains[i], STEP, i),
        ),
      );
    syncMusic();
    for (const event of match.events)
      if (event.id > lastEvent) {
        lastEvent = event.id;
        sound(event.type);
        if (event.type === "start") $("match-status").textContent = "ぽよんと、はじめ！";
        if (event.type === "out") {
          $("match-status").textContent =
            `${fighterAppearance(match, event.player).name}が場外へ！`;
        }
      }
    updateHUD();
    const view = online?.renderGame(seconds) || match;
    render(
      context,
      art,
      { ...view, localPlayer: localSeat, online: !!online },
      now / 1000,
      reducedMotion.matches,
    );
    if (match.phase === "finished" && !resultShown && !networkError) showResult();
  } else if (art && getStage(previewMatch.stageId).platforms.some((p) => p.motion || p.tilt)) {
    previewMatch.elapsed += reducedMotion.matches ? 0 : Math.min(seconds, 0.05);
    const floors = platformsAt(getStage(previewMatch.stageId), previewMatch.elapsed);
    for (const f of previewMatch.fighters) {
      const floor = floors.find((p) => p.id === f.platformId);
      if (floor && f.grounded) f.y = surfaceAt(floor, f.x);
    }
    render(previewContext, art, previewMatch, now / 1000, reducedMotion.matches, true);
  }
  requestAnimationFrame(frame);
}
async function prepare() {
  $("start").disabled = true;
  $("start").textContent = "絵をじゅんび中…";
  try {
    art = await loadArt();
    for (const img of document.querySelectorAll("[data-character-art]"))
      img.src = art.selection[img.dataset.characterArt];
    fit(preview);
    render(previewContext, art, previewMatch, 0, true, true);
    $("start").textContent = "バトル、はじめる！ →";
    $("load-status").textContent = "好きな子で、ぽよんとひと勝負。";
  } catch {
    $("start").textContent = "絵をもういちど読み込む";
    $("load-status").textContent = "絵が届かなかったよ。ボタンからもう一度ためしてね。";
  } finally {
    $("start").disabled = false;
  }
}
void prepare();
requestAnimationFrame(frame);
