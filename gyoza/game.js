import { createControls, pieceControlsPosition } from "./controls.js?v=20261027-gyoza6";
import {
  createGame,
  drop,
  aim,
  step,
  view,
  dispose,
  legalAim,
  STEP_MS,
  PLATE_Y,
} from "./engine.js?v=20261027-gyoza3";
import { SHAPES, TURN_ANGLE, GYOZA_SCALE } from "./shapes.js?v=20261027-gyoza3";
import { render, previewY } from "./art.js?v=20261027-gyoza5";
import {
  createMatch,
  generateRoomCode,
  normalizeRoomCode,
  isOnlineConfigured,
} from "./online.js?v=20261027-gyoza3";
const $ = (id) => document.getElementById(id),
  names = ["たくハム", "めぐハム"];
const faces = [
  { idle: "pink-piece", win: "tak-win", lose: "tak-lose" },
  { idle: "cream-piece", win: "meg-win", lose: "meg-lose" },
];
let mode = "cpu",
  game = null,
  online = null,
  state = null,
  seat = 0,
  draft = { x: 240, angle: 0 },
  draftKey = "",
  epoch = 0,
  round = 0,
  worker = null,
  cpuKey = "",
  uiKey = "",
  frameMap = null,
  last = 0,
  acc = 0,
  resultAt = 0,
  networkError = "",
  connecting = false,
  lastAim = 0,
  sound = false,
  audio = null,
  oldTotal = 0;
let receivedAt = 0,
  previousFrame = null;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
function seed() {
  return crypto.getRandomValues(new Uint32Array(1))[0] || 1;
}
function tone(win = false) {
  if (!sound) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    void audio.resume();
    const osc = audio.createOscillator(),
      gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(win ? 740 : 260, audio.currentTime);
    osc.frequency.exponentialRampToValueAtTime(win ? 980 : 160, audio.currentTime + 0.13);
    gain.gain.setValueAtTime(0.045, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.18);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.2);
  } catch {
    /* Sound is optional. */
  }
}
$("sound").onclick = () => {
  sound = !sound;
  $("sound").textContent = `♪ 音 ${sound ? "ON" : "OFF"}`;
  $("sound").setAttribute("aria-pressed", String(sound));
  if (sound) tone();
};
function controllable() {
  return (
    state &&
    !networkError &&
    !state.paused &&
    state.phase === "aim" &&
    (mode === "local" || state.turn === (mode === "cpu" ? 0 : seat))
  );
}
function setState(next, who = seat) {
  const previous = state;
  if (mode === "online" && who === 1) {
    previousFrame = previous;
    receivedAt = performance.now();
  }
  state = next;
  seat = who;
  if (previous && previous.round !== state.round) oldTotal = 0;
  if (!previous) {
    document.body.classList.add("playing");
    $("setup").hidden = true;
    $("match").hidden = false;
    $("pause").hidden = false;
    window.scrollTo(0, 0);
  }
  const key = `${state.round}:${state.move}`;
  if (key !== draftKey) {
    draftKey = key;
    draft = { ...state.preview };
    cpuKey = "";
  }
  if (state.total > oldTotal) {
    tone();
    oldTotal = state.total;
  }
  if (state.phase === "finished" && previous?.phase !== "finished") {
    resultAt = performance.now() + 1400;
    tone(true);
  }
  if (state.phase !== "finished") resultAt = 0;
  updateUI();
}
function updateUI() {
  if (!state) return;
  const finished = state.phase === "finished",
    showResult = finished && performance.now() >= resultAt;
  const key = [
    mode,
    state.round,
    state.move,
    state.phase,
    state.turn,
    state.paused,
    state.winner,
    showResult,
    networkError,
    state.resumeVotes?.join(),
    state.rematchVotes?.join(),
  ].join("|");
  if (key === uiKey) return;
  uiKey = key;
  $("count").textContent = state.total;
  $("piece-name").textContent = SHAPES[state.current].name;
  if (state.phase === "aim")
    $("height").textContent = Math.max(0, Math.round((PLATE_Y - state.top) / 5));
  for (let i = 0; i < 2; i++) {
    $("player-" + i).classList.toggle("active", !finished && state.turn === i);
    $("label-" + i).textContent =
      mode === "cpu"
        ? i === 0
          ? "あなた"
          : "CPU"
        : mode === "online"
          ? i === seat
            ? "あなた"
            : "相手"
          : "";
    const face = finished ? (state.winner === i ? "win" : "lose") : "idle";
    $("face-" + i).src = `../assets/${faces[i][face]}.png`;
  }
  $("turn").textContent = networkError
    ? "通信が止まっています"
    : state.paused
      ? "ひとやすみ中"
      : finished
        ? "あっ、こぼれちゃった！"
        : state.phase === "falling"
          ? "そーっと… 見守ってね"
          : mode === "cpu" && state.turn === 1
            ? "めぐハム、考え中…"
            : `${names[state.turn]}の番`;
  for (const id of ["drop", "rotate-left", "rotate-right"]) $(id).disabled = !controllable();
  $("pause").disabled = finished || !!networkError;
  $("controls-note").textContent =
    state.phase === "falling"
      ? "落ち着くまで、ちょっと待ってね。"
      : controllable()
        ? "ぎょうざの下で、回転・おとす。"
        : "相手のぎょうざを見守ろう。";
  $("overlay").dataset.result = String(finished && !state.paused && !networkError);
  $("overlay").hidden = !(state.paused || showResult || networkError);
  $("continue").hidden = !!networkError;
  $("continue").disabled = false;
  if (networkError) {
    $("overlay-kicker").textContent = "CONNECTION";
    $("overlay-title").textContent = "通信が切れたみたい";
    $("overlay-note").textContent = networkError;
  } else if (state.paused) {
    $("overlay-kicker").textContent = "TEA BREAK";
    $("overlay-title").textContent = "ひとやすみ";
    $("overlay-note").textContent =
      mode === "online"
        ? "ふたりが「つづける」を押すと再開するよ。"
        : "積んだぎょうざは、そのまま。";
    $("continue").textContent = state.resumeVotes?.[seat] ? "相手を待っています…" : "つづける";
    $("continue").disabled = !!state.resumeVotes?.[seat];
  } else if (showResult) {
    $("overlay-kicker").textContent = "ごちそうさまでした";
    $("overlay-title").textContent = `${names[state.winner]}のかち！`;
    $("overlay-note").textContent =
      `${state.total}こ、積めたね。次は${names[1 - state.starter]}から。`;
    $("continue").textContent = state.rematchVotes?.[seat]
      ? "相手を待っています…"
      : "もういちどあそぶ";
    $("continue").disabled = !!state.rematchVotes?.[seat];
  }
}
function startLocal() {
  networkError = "";
  oldTotal = 0;
  uiKey = "";
  if (game) dispose(game);
  game = createGame({ seed: seed(), starter: round % 2, round: ++round });
  setState(view(game), 0);
  acc = 0;
}
$("start").onclick = startLocal;
function cleanup() {
  epoch++;
  online?.close();
  online = null;
  if (game) dispose(game);
  game = null;
  worker?.terminate();
  worker = null;
  state = null;
  round = 0;
  cpuKey = "";
  draftKey = "";
  uiKey = "";
  connecting = false;
  networkError = "";
  controls.reset();
  acc = 0;
  document.body.classList.remove("playing");
  $("setup").hidden = false;
  $("match").hidden = true;
  $("pause").hidden = true;
  $("waiting").hidden = true;
  $("connection-note").textContent = "";
  for (const id of ["create-room", "join-room", "room-input"]) $(id).disabled = false;
}
$("home").onclick = cleanup;
$("cancel-room").onclick = cleanup;
for (const b of document.querySelectorAll("[data-mode]"))
  b.onclick = () => {
    cleanup();
    mode = b.dataset.mode;
    for (const button of document.querySelectorAll("[data-mode]"))
      button.setAttribute("aria-pressed", String(button === b));
    $("local-options").hidden = mode === "online";
    $("online-options").hidden = mode !== "online";
    $("start-note").textContent =
      mode === "cpu" ? "あなたはたくハム、CPUはめぐハム。" : "たくハムとめぐハム、交代で積もう。";
  };
function requestPause() {
  if (!state || state.phase === "finished" || state.paused) return;
  if (mode === "online") online?.request("pause");
  else {
    game.paused = true;
    setState(view(game));
  }
  acc = 0;
}
$("pause").onclick = requestPause;
$("continue").onclick = () => {
  if (!state) return;
  if (mode === "online") {
    online?.request(state.phase === "finished" ? "rematch" : "resume");
    return;
  }
  if (state.phase === "finished") startLocal();
  else {
    game.paused = false;
    setState(view(game));
    acc = 0;
  }
};
$("help").onclick = () => {
  requestPause();
  $("guide").showModal();
};
$("close-guide").onclick = () => $("guide").close();
window.addEventListener("takumegu-menu", (e) => {
  if (e.detail.open) requestPause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) requestPause();
  last = 0;
  acc = 0;
});
window.addEventListener("blur", () => {
  controls.reset();
  requestPause();
});
window.addEventListener("pagehide", () => {
  online?.close();
  worker?.terminate();
});
function move(x = draft.x, angle = draft.angle) {
  if (!controllable()) return;
  draft = legalAim(state.current, x, angle);
  if (mode === "online") {
    if (performance.now() - lastAim > 85) {
      lastAim = performance.now();
      online?.request("aim", draft);
    }
  } else aim(game, game.turn, draft.x, draft.angle);
}
$("rotate-left").onclick = () => move(draft.x, draft.angle - TURN_ANGLE);
$("rotate-right").onclick = () => move(draft.x, draft.angle + TURN_ANGLE);
function release() {
  if (!controllable()) return;
  if (mode === "online") {
    if (online?.request("drop", draft)) $("drop").disabled = true;
  } else if (drop(game, game.turn, draft.x, draft.angle)) setState(view(game));
}
$("drop").onclick = release;
const controls = createControls({
  board: $("board"),
  move,
  read: () =>
    state && {
      enabled: controllable(),
      map: frameMap,
      x: draft.x,
      angle: draft.angle,
      type: state.current,
      y: frameMap ? previewY(state, frameMap) : state.spawnY,
    },
});
$("board").addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("keydown", (e) => {
  if (!state || $("guide").open || document.documentElement.classList.contains("site-menu-open"))
    return;
  if (e.key === "Escape") {
    e.preventDefault();
    requestPause();
    return;
  }
  if (e.target.matches("input")) return;
  if (e.target.matches("button") && [" ", "Enter"].includes(e.key)) return;
  const k = e.key.toLowerCase();
  if (!["arrowleft", "arrowright", "arrowup", "a", "d", "q", "e", " ", "enter"].includes(k)) return;
  e.preventDefault();
  if (["a", "arrowleft"].includes(k)) move(draft.x - 9);
  else if (["d", "arrowright"].includes(k)) move(draft.x + 9);
  else if (k === "q") move(draft.x, draft.angle - TURN_ANGLE);
  else if (["e", "arrowup"].includes(k)) move(draft.x, draft.angle + TURN_ANGLE);
  else if (!e.repeat) release();
});
async function connect(role) {
  if (connecting) return;
  if (!isOnlineConfigured()) {
    $("connection-note").textContent = "通信の設定が見つかりません。";
    return;
  }
  const code = role === "host" ? generateRoomCode() : normalizeRoomCode($("room-input").value);
  if (!/^HAMU-[A-Z2-9]{6}$/.test(code)) {
    $("connection-note").textContent = "相手の合言葉を入れてね。";
    return;
  }
  const id = ++epoch;
  connecting = true;
  $("waiting").hidden = false;
  $("room-code").textContent = code;
  for (const key of ["create-room", "join-room", "room-input"]) $(key).disabled = true;
  $("connection-note").textContent =
    role === "host" ? "合言葉を相手に教えてね。" : "へやを探しています…";
  try {
    const match = await createMatch({
      role,
      roomCode: code,
      onState(v, p) {
        if (epoch !== id) return;
        setState(v, p);
      },
      onStatus(s) {
        if (epoch === id)
          $("connection-note").textContent =
            s === "waiting" ? "相手を待っています…" : "つながりました。";
      },
      onError(e) {
        if (epoch !== id) return;
        if (state) {
          networkError = e.message;
          updateUI();
        } else {
          connecting = false;
          $("connection-note").textContent = e.message;
          for (const key of ["create-room", "join-room", "room-input"]) $(key).disabled = false;
        }
      },
    });
    if (epoch !== id) {
      match.close();
      return;
    }
    online = match;
  } catch (e) {
    if (epoch === id) {
      connecting = false;
      $("connection-note").textContent = e.message;
      for (const key of ["create-room", "join-room", "room-input"]) $(key).disabled = false;
    }
  }
}
$("create-room").onclick = () => connect("host");
$("join-room").onclick = () => connect("guest");
$("copy-room").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("room-code").textContent);
    $("connection-note").textContent = "コピーしたよ。相手に送ってね。";
  } catch {
    $("connection-note").textContent = "合言葉を選んでコピーしてね。";
  }
};
function runCPU() {
  if (mode !== "cpu" || !game || game.paused || game.phase !== "aim" || game.turn !== 1) return;
  const id = `${epoch}:${game.round}:${game.move}`;
  if (cpuKey === id) return;
  cpuKey = id;
  const started = performance.now();
  let answered = false;
  const timeout = setTimeout(() => receive({ x: 215 + Math.random() * 50, angle: 0 }), 2500);
  const receive = (choice) => {
    if (answered) return;
    answered = true;
    clearTimeout(timeout);
    setTimeout(
      () => {
        if (cpuKey !== id || !game || game.round !== state.round || game.move !== state.move)
          return;
        if (game.paused) {
          cpuKey = "";
          return;
        }
        if (game.turn === 1 && game.phase === "aim") {
          draft = choice;
          aim(game, 1, choice.x, choice.angle);
          setState(view(game));
          setTimeout(() => {
            if (cpuKey === id && game && !game.paused && game.turn === 1 && game.phase === "aim") {
              drop(game, 1, choice.x, choice.angle);
              setState(view(game));
            } else if (cpuKey === id) cpuKey = "";
          }, 380);
        }
      },
      Math.max(0, 650 - (performance.now() - started)),
    );
  };
  try {
    worker ??= new Worker(new URL("./cpu-worker.js?v=20261027-gyoza3", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e) => {
      if (e.data.id === id) receive(e.data.move);
    };
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      receive({ x: 215 + Math.random() * 50, angle: 0 });
    };
    worker.postMessage({ id, view: view(game) });
  } catch {
    receive({ x: 215 + Math.random() * 50, angle: 0 });
  }
}
const hero = {
  phase: "finished",
  spawnY: 80,
  fallen: null,
  bodies: [
    { id: 0, type: 1, x: 240, y: PLATE_Y - 20 * GYOZA_SCALE, angle: 0 },
    { id: 1, type: 0, x: 240 - 22 * GYOZA_SCALE, y: PLATE_Y - 58 * GYOZA_SCALE, angle: -0.15 },
    { id: 2, type: 2, x: 240 + 18 * GYOZA_SCALE, y: PLATE_Y - 102 * GYOZA_SCALE, angle: 0.18 },
    { id: 3, type: 4, x: 240 - 15 * GYOZA_SCALE, y: PLATE_Y - 158 * GYOZA_SCALE, angle: -0.2 },
  ],
};
function frame(time) {
  const delta = last ? Math.min(80, time - last) : 0;
  last = time;
  if (state) {
    acc += delta;
    while (acc >= STEP_MS) {
      if (mode === "online") online?.advance();
      else if (game) step(game);
      acc -= STEP_MS;
    }
    if (mode !== "online" && game) setState(view(game));
    let drawing = state;
    if (
      mode === "online" &&
      seat === 1 &&
      state.phase === "falling" &&
      previousFrame?.round === state.round &&
      previousFrame.move === state.move &&
      previousFrame.bodies.length === state.bodies.length
    ) {
      const t = Math.min(1, (time - receivedAt) / 80);
      drawing = {
        ...state,
        bodies: state.bodies.map((b, i) => {
          const p = previousFrame.bodies[i];
          return {
            ...b,
            x: p.x + (b.x - p.x) * t,
            y: p.y + (b.y - p.y) * t,
            angle: p.angle + (b.angle - p.angle) * t,
          };
        }),
      };
    }
    controls.tick();
    frameMap = render($("board"), drawing, {
      preview: controllable() ? draft : null,
      active: controllable(),
      friends: true,
      time,
      reduced,
    });
    const tools = $("piece-tools");
    tools.hidden = !controllable();
    if (!tools.hidden) {
      const pos = pieceControlsPosition(
        $("board").clientWidth,
        {
          map: frameMap,
          type: state.current,
          x: draft.x,
          y: previewY(state, frameMap),
        },
        tools.offsetWidth,
      );
      tools.style.left = `${pos.x}px`;
      tools.style.top = `${pos.y}px`;
    }
    updateUI();
    runCPU();
  } else render($("hero"), hero, { time, reduced });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
