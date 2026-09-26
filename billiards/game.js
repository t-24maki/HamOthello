import {
  createGame,
  startGame,
  launch,
  advance,
  ballsLeft,
  cueBall,
  canPlaceCue,
  findCuePlacement,
  placeCue,
  PLAYERS,
  SIZE,
  CENTER,
  BALL_RADIUS,
  MAX_DRAG,
  MIN_DRAG,
  TURNS,
} from "./physics.js?v=20260926-5";
import {
  createBilliardsMatch,
  generateRoomCode,
  normalizeRoomCode,
  isOnlineConfigured,
} from "./online.js?v=20260926-online-1";
const $ = (id) => document.getElementById(id);
const table = $("table");
const NS = "http://www.w3.org/2000/svg";
const ART = [
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
let game = createGame(),
  aim = null,
  placement = null,
  frameId = null,
  lastFrame = 0,
  seenPots = 0,
  hudKey = "",
  effectTimers = new Set();
let mode = "local",
  roomAction = "create",
  roomCode = "",
  match = null,
  onlineRound = null,
  localOwner = 0,
  connecting = false,
  pending = false,
  networkError = "",
  connectionNote = "",
  epoch = 0;
const ballNodes = new Map();
function canControl() {
  return (
    mode === "local" ||
    !!(
      match &&
      onlineRound &&
      !pending &&
      !networkError &&
      onlineRound.game.phase !== "moving" &&
      onlineRound.game.turn === localOwner
    )
  );
}
function renderConnection() {
  $("mode-label").textContent = mode === "online" ? "通信でふたり" : "1台でふたり";
  $("match-setup").hidden = game.phase !== "ready" || !!onlineRound;
  $("online-setup").hidden = mode !== "online";
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
  $("room-waiting").hidden = !roomCode || roomAction !== "create";
  $("room-code").textContent = roomCode;
  $("online-status").textContent =
    connectionNote || "同じキーワードのへやに入ると、ゲームが始まるよ。";
  $("connect").hidden = connecting;
  $("connect").textContent = roomAction === "create" ? "へやをつくる →" : "へやに入る →";
  $("cancel-connect").hidden = !connecting && !networkError;
  $("match-toolbar").hidden = !onlineRound;
  $("match-info").textContent = `${roomCode} · あなたは${PLAYERS[localOwner]}`;
  $("connection-status").dataset.error = String(!!networkError);
  $("connection-status").textContent =
    networkError ||
    (pending
      ? "相手の画面へ届けているよ…"
      : onlineRound?.game.phase === "moving"
        ? game.phase === "moving"
          ? "ふたりの画面で、ころころ。"
          : "相手の画面が追いつくのを待っているよ。"
        : game.phase === "finished"
          ? "もう一度遊ぶときは、ふたりともボタンを押してね。"
          : canControl()
            ? "あなたの番だよ。白球を操作してね。"
            : "相手の番だよ。のんびり見守ろう。");
  $("restart").textContent = mode === "online" ? "へやを出る" : "最初からあそぶ";
  $("rematch-note").hidden = mode !== "online";
  $("rematch-note").textContent =
    networkError ||
    (onlineRound?.rematch[localOwner]
      ? "相手の準備を待っているよ。"
      : onlineRound?.rematch[1 - localOwner]
        ? "相手はもう一度あそびたいみたい！"
        : "ふたりの準備がそろうと始まるよ。");
  $("rematch").disabled =
    mode === "online" &&
    (!match || pending || !!networkError || !!onlineRound?.rematch[localOwner]);
  for (let p = 0; p < 2; p++)
    $("player-" + p).querySelector("h2 span").textContent =
      `${p === 0 ? "紫" : "クリーム"}の球${onlineRound ? (p === localOwner ? " · あなた" : " · 相手") : ""}`;
}
function closeOnline() {
  epoch++;
  match?.close();
  match = null;
  onlineRound = null;
  connecting = false;
  pending = false;
  networkError = "";
  connectionNote = "";
  roomCode = "";
}
function acceptOnline(next, owner) {
  const newRound = !onlineRound || next.roundId !== onlineRound.roundId;
  if (frameId !== null) cancelAnimationFrame(frameId);
  frameId = null;
  cancelAim();
  onlineRound = next;
  localOwner = owner;
  game = structuredClone(next.game);
  connecting = false;
  networkError = "";
  connectionNote = "";
  placement = null;
  hudKey = "";
  if (newRound) {
    for (const timer of effectTimers) clearTimeout(timer);
    effectTimers.clear();
    $("score-effects").replaceChildren();
    $("result").hidden = true;
    $("restart-dialog").close();
    seenPots = 0;
    makeTable();
  }
  renderPots();
  renderHUD();
  requestFrame();
}
async function connect() {
  if (connecting || onlineRound) return;
  if (!isOnlineConfigured()) {
    connectionNote = "通信の準備がまだできていないみたい。";
    renderConnection();
    return;
  }
  const code =
    roomAction === "create" ? generateRoomCode() : normalizeRoomCode($("room-input").value);
  if (!/^HAMU-[A-Z2-9]{6}$/.test(code)) {
    connectionNote = "HAMU-からはじまる6文字のキーワードを入れてね。";
    renderConnection();
    return;
  }
  closeOnline();
  const attempt = epoch;
  roomCode = code;
  connecting = true;
  connectionNote = roomAction === "create" ? "へやをつくっているよ…" : "へやを探しているよ…";
  renderHUD();
  function failed(error) {
    if (attempt !== epoch) return;
    connecting = false;
    pending = false;
    networkError = error.message;
    connectionNote = error.message;
    cancelAim();
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    hudKey = "";
    $("restart-dialog").close();
    renderHUD();
  }
  try {
    const opened = await createBilliardsMatch({
      role: roomAction === "create" ? "host" : "guest",
      roomCode,
      onState(next, owner) {
        if (attempt === epoch) acceptOnline(next, owner);
      },
      onStatus(status) {
        if (attempt === epoch) {
          pending = status === "sending";
          hudKey = "";
          renderHUD();
        }
      },
      onReject(message) {
        if (attempt === epoch) {
          hudKey = "";
          renderHUD();
          $("shot-notice").textContent = message;
        }
      },
      onError: failed,
    });
    if (attempt !== epoch) {
      opened.close();
      return;
    }
    match = opened;
    if (!onlineRound)
      connectionNote =
        roomAction === "create"
          ? "このキーワードを相手に教えてね。待っているよ。"
          : "相手とつないでいるよ…";
    hudKey = "";
    renderHUD();
  } catch (error) {
    failed(error);
  }
}
function leaveRoom() {
  closeOnline();
  reset(0);
  document.querySelector('[data-mode="online"]').focus();
}

const sign = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");
function svg(tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}
function makeTable() {
  $("pockets").replaceChildren();
  game.pockets.forEach((p) => {
    const g = svg("g", {
      class: p.points < 0 ? "pocket negative" : "pocket",
      "data-points": p.points,
    });
    g.append(svg("title", {}, `${p.id + 1}番の穴、${p.points}点`));
    g.append(
      svg("circle", {
        cx: p.x,
        cy: p.y,
        r: p.radius + 1,
        fill: "url(#hole)",
        class: "pocket-hole",
      }),
    );
    g.append(svg("circle", { cx: p.x, cy: p.y, r: p.radius + 3, class: "pocket-halo" }));
    const x = CENTER + Math.cos(p.angle) * 326,
      y = CENTER + Math.sin(p.angle) * 326;
    g.append(
      svg("rect", { x: x - 24, y: y - 18, width: 48, height: 36, rx: 13, class: "pocket-label" }),
    );
    g.append(svg("text", { x, y: y + 1, class: "pocket-value" }, sign(p.points)));
    $("pockets").append(g);
  });
  $("balls").replaceChildren();
  ballNodes.clear();
  const numbers = [0, 0, 0];
  game.balls.forEach((b) => {
    const cue = b.kind === "cue";
    const number = ++numbers[b.owner ?? 2];
    const g = svg("g", {
      class: "ball",
      "data-owner": b.owner ?? "cue",
      "data-ball": b.id,
      role: "button",
      tabindex: -1,
      "aria-label": cue ? "白球（ふたり共通の打つ球）" : `${PLAYERS[b.owner]}の球 ${number}`,
    });
    g.append(svg("circle", { r: BALL_RADIUS + 6, class: "selection-ring" }));
    g.append(svg("ellipse", { cx: 1, cy: 5, rx: 15, ry: 13, class: "ball-shadow" }));
    g.append(
      svg("circle", {
        r: BALL_RADIUS,
        class: "ball-body",
        fill: `url(#${cue ? "white" : b.owner === 0 ? "taku" : "megu"}-ball)`,
      }),
    );
    g.append(
      svg("ellipse", {
        cx: -5,
        cy: -7,
        rx: 4,
        ry: 2.7,
        transform: "rotate(-30 -5 -7)",
        class: "ball-glint",
      }),
    );
    const face = svg("g", { class: "ball-face" });
    if (b.owner === 0) {
      face.append(
        svg("circle", { cx: -5, cy: 0, r: 4 }),
        svg("circle", { cx: 5, cy: 0, r: 4 }),
        svg("path", { d: "M-1 0h2" }),
      );
    } else if (!cue) face.append(svg("path", { d: "M-4-9l-1 3M0-10l-1 3M4-9l-1 3" }));
    face.append(
      svg("circle", { cx: -5, cy: 0, r: 1.3, class: "eye" }),
      svg("circle", { cx: 5, cy: 0, r: 1.3, class: "eye" }),
      svg("path", { d: "M-2 5q2 3 4 0" }),
    );
    if (!cue) g.append(face);
    $("balls").append(g);
    ballNodes.set(b.id, g);
  });
  renderBalls();
}
function renderBalls() {
  for (const b of game.balls) {
    const g = ballNodes.get(b.id);
    g.setAttribute("transform", `translate(${b.x.toFixed(3)} ${b.y.toFixed(3)})`);
    g.setAttribute("visibility", b.active ? "visible" : "hidden");
    g.setAttribute("aria-hidden", String(!b.active));
    const selectable = canControl() && b.active && game.phase === "aiming" && b.kind === "cue";
    g.classList.toggle("selectable", selectable);
    g.classList.toggle("selected", aim?.id === b.id);
    g.setAttribute("tabindex", selectable ? 0 : -1);
    g.setAttribute("aria-disabled", String(!selectable));
    g.setAttribute("aria-pressed", String(aim?.id === b.id));
  }
}
function renderLog() {
  $("shot-log").replaceChildren();
  for (const shot of game.log) {
    const li = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = `log-dot ${shot.player === 1 ? "megu" : ""}`;
    const text = document.createElement("div");
    text.className = "log-text";
    const title = document.createElement("strong");
    title.textContent = `${PLAYERS[shot.player]} · ${shot.number}回目`;
    const detail = document.createElement("span");
    detail.textContent = shot.pots.length
      ? shot.pots
          .map((p) =>
            p.kind === "cue"
              ? "白球がころん · 得点なし"
              : `${PLAYERS[p.owner]} ${sign(p.points)}点`,
          )
          .join(" / ")
      : "つぎの一球に、期待しよう。";
    text.append(title, detail);
    li.append(dot, text);
    $("shot-log").append(li);
  }
  $("shot-log").scrollTop = $("shot-log").scrollHeight;
}
function showResult() {
  const draw = game.winner === "draw";
  $("result-title").textContent = draw ? "なかよく、ひきわけ！" : `${PLAYERS[game.winner]}のかち！`;
  $("result-score").textContent = `たくハム ${game.scores[0]}点 ／ めぐハム ${game.scores[1]}点`;
  for (let p = 0; p < 2; p++)
    $("result-" + (p === 0 ? "taku" : "megu")).src =
      ART[p][draw || game.winner === p ? "happy" : "sad"];
  $("result").hidden = false;
  $("result-title").focus({ preventScroll: true });
}
function renderHUD() {
  const key = [
    game.phase,
    game.turn,
    ...game.shots,
    ...game.scores,
    game.log.length,
    game.pots.length,
    mode,
    connecting,
    pending,
    networkError,
    canControl(),
    onlineRound?.revision,
  ].join(":");
  if (key === hudKey) return;
  hudKey = key;
  renderConnection();
  const waitingForAnimation =
    mode === "online" && onlineRound?.game.phase === "moving" && game.phase !== "moving";
  const ready = game.phase === "ready",
    finished = game.phase === "finished" && !waitingForAnimation,
    moving = game.phase === "moving",
    placing = game.phase === "placing";
  $("turn-banner").dataset.owner = game.turn;
  $("turn-title").textContent = ready
    ? "まあるい台で、あそぼう。"
    : finished
      ? "ふたりの勝負、おしまい！"
      : moving
        ? "ころころ、どこへいく？"
        : placing
          ? `${PLAYERS[game.turn]}、白球を置こう。`
          : `${PLAYERS[game.turn]}の番だよ。`;
  $("turn-hint").textContent = ready
    ? "白球をぶつけて、自分の色をころん。"
    : finished
      ? "得点の多い子が、きょうの勝ち。"
      : moving
        ? "球が全部止まったら、交代するよ。"
        : placing
          ? "空いている場所をタップしてね。"
          : game.turn === 0
            ? "白球を打って、紫の球をねらおう。"
            : "白球を打って、クリームの球をねらおう。";
  $("round-label").textContent = ready
    ? "各5回"
    : finished
      ? "おしまい"
      : `${Math.min(TURNS, game.shots[game.turn] + (moving ? 0 : 1))} / ${TURNS}回`;
  if (mode === "online" && !ready) {
    if (networkError) {
      $("turn-title").textContent = "通信が切れたみたい。";
      $("turn-hint").textContent = "「へやを出る」から、つなぎ直してね。";
    } else if (waitingForAnimation) {
      $("turn-title").textContent = "台の情報をそろえているよ。";
      $("turn-hint").textContent = "ふたりの球が止まったら、交代するよ。";
    } else if (!moving && !finished)
      $("turn-hint").textContent = pending
        ? "ショットを届けているよ…"
        : canControl()
          ? placing
            ? "空いている場所をタップしてね。"
            : "あなたの番だよ。白球を引っぱってね。"
          : "相手がえらんでいるよ。少し待ってね。";
  }
  $("ready-controls").hidden = !ready || mode === "online";
  $("play-controls").hidden = ready || (placing && canControl());
  $("placement-controls").hidden = !placing || !canControl();
  $("aim-help").textContent = placing
    ? "場所をえらんで「ここに置く」。置くだけでは回数は減らないよ。"
    : "白球を引っぱって、離そう。引いた向きと逆に飛ぶよ。";
  $("restart").hidden = ready;
  $("show-result").hidden = !finished;
  $("cancel-aim").hidden = finished;
  $("cancel-aim").disabled = !aim || !canControl();
  $("power").value = 0;
  $("power-label").textContent = "0%";
  for (let p = 0; p < 2; p++) {
    $("score-" + p).textContent = game.scores[p];
    $("balls-left-" + p).textContent = `のこり${ballsLeft(game, p)}球`;
    $("player-" + p).classList.toggle("active", !ready && !finished && p === game.turn);
    const image =
      ART[p][finished ? (game.winner === "draw" || game.winner === p ? "happy" : "sad") : "idle"];
    if ($("portrait-" + p).getAttribute("src") !== image) $("portrait-" + p).src = image;
    const dots = $("shots-" + p);
    dots.replaceChildren();
    dots.setAttribute("aria-label", `${game.shots[p]}回 / ${TURNS}回`);
    for (let i = 0; i < TURNS; i++) {
      const dot = document.createElement("i");
      dot.className = i < game.shots[p] ? "used" : "";
      dot.setAttribute("aria-hidden", "true");
      dots.append(dot);
    }
  }
  const recent = game.pots.at(-1),
    last = game.log.at(-1);
  $("shot-notice").textContent = ready
    ? "穴の数字が、そのまま得点になるよ。"
    : finished
      ? "おつかれさま！ もう一度遊ぶと、穴の得点も変わるよ。"
      : moving && recent && game.currentShot.pots.length
        ? recent.kind === "cue"
          ? "白球もころん。全部止まったら、次の人が置き直すよ。"
          : `${PLAYERS[recent.owner]}に ${sign(recent.points)}点！ ${recent.points < 0 ? "あっ、マイナスの穴だった…" : "ころん、と入ったよ。"}`
        : moving
          ? "球が転がっているよ。どの穴に入るかな？"
          : placing
            ? "白球が落ちたので、好きな場所へ置けるよ。ほかの球と穴の近くは避けてね。"
            : last
              ? `${PLAYERS[game.turn]}に交代だよ。白球を引っぱってね。`
              : "白球をぶつけて、自分の色の球を穴に入れよう。";
  if (placing && !placement) placement = findCuePlacement(game);
  if (!placing) placement = null;
  renderPlacement();
  renderLog();
  renderBalls();
  if (finished) showResult();
}
function renderAim() {
  const b = aim && game.balls.find((b) => b.id === aim.id);
  if (!b || game.phase !== "aiming") {
    $("aim-guide").setAttribute("visibility", "hidden");
    $("power").value = 0;
    $("power-label").textContent = "0%";
    return;
  }
  const pull = Math.hypot(aim.dx, aim.dy),
    n = pull > 0 ? { x: aim.dx / pull, y: aim.dy / pull } : { x: 0, y: -1 };
  const strength = Math.min(1, pull / MAX_DRAG);
  $("power").value = Math.round(strength * 100);
  $("power-label").textContent = `${Math.round(strength * 100)}%`;
  const ring = $("aim-ring");
  ring.setAttribute("cx", b.x);
  ring.setAttribute("cy", b.y);
  const direction = $("shot-direction");
  direction.setAttribute("display", pull >= MIN_DRAG ? "inline" : "none");
  direction.setAttribute(
    "transform",
    `translate(${b.x} ${b.y}) rotate(${(Math.atan2(n.y, n.x) * 180) / Math.PI})`,
  );
  const cue = $("cue-stick"),
    gap = 27 + strength * 35;
  cue.setAttribute("x1", b.x - n.x * gap);
  cue.setAttribute("y1", b.y - n.y * gap);
  cue.setAttribute("x2", b.x - n.x * (gap + 70));
  cue.setAttribute("y2", b.y - n.y * (gap + 70));
  $("aim-guide").setAttribute("visibility", "visible");
  $("cancel-aim").disabled = false;
  renderBalls();
}
function renderPlacement() {
  const ghost = $("placement-preview");
  const visible = canControl() && game.phase === "placing" && placement;
  ghost.setAttribute("visibility", visible ? "visible" : "hidden");
  ghost.setAttribute("aria-hidden", String(!visible));
  ghost.setAttribute("tabindex", visible ? 0 : -1);
  if (!visible) return;
  const valid = canPlaceCue(game, placement.x, placement.y);
  ghost.setAttribute("transform", `translate(${placement.x} ${placement.y})`);
  ghost.classList.toggle("invalid", !valid);
  ghost.setAttribute(
    "aria-label",
    valid
      ? "白球を置く位置。矢印キーで移動、Enterで確定"
      : "ここには置けないよ。矢印キーで移動してね",
  );
  $("place-cue").disabled = !valid;
  $("placement-status").textContent = valid ? "ここに白球を置く？" : "球や穴から離してね。";
}
function confirmPlacement() {
  if (!canControl() || !placement) return;
  if (mode === "online") {
    match.submit("place", placement);
    return;
  }
  if (!placement || !placeCue(game, placement.x, placement.y)) return;
  placement = null;
  renderHUD();
  ballNodes.get(cueBall(game).id).focus({ preventScroll: true });
}
function cancelAim() {
  if (aim?.pointerId !== undefined && table.hasPointerCapture(aim.pointerId))
    table.releasePointerCapture(aim.pointerId);
  aim = null;
  renderAim();
  renderBalls();
  $("cancel-aim").disabled = true;
}
function point(event) {
  const rect = table.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) * SIZE) / rect.width,
    y: ((event.clientY - rect.top) * SIZE) / rect.height,
  };
}
function requestFrame() {
  if (
    frameId === null &&
    game.phase === "moving" &&
    !document.hidden &&
    !networkError &&
    (mode === "online" || !$("restart-dialog").open)
  ) {
    lastFrame = performance.now();
    frameId = requestAnimationFrame(frame);
  }
}
function frame(now) {
  frameId = null;
  if (document.hidden || networkError) return;
  advance(game, Math.min((now - lastFrame) / 1000, 0.05));
  lastFrame = now;
  renderBalls();
  renderPots();
  renderHUD();
  if (game.phase === "moving") frameId = requestAnimationFrame(frame);
  else if (mode === "online") match?.settled();
}
function renderPots() {
  while (seenPots < game.pots.length) {
    const pot = game.pots[seenPots++],
      p = game.pockets[pot.pocket];
    const g = svg("g", {
      class: `pot-effect ${pot.kind === "cue" ? "scratch" : pot.points < 0 ? "negative" : ""}`,
      transform: `translate(${p.x} ${p.y})`,
    });
    g.append(
      svg("circle", { r: p.radius + 6 }),
      svg("text", { y: -p.radius - 8 }, pot.kind === "cue" ? "白球がころん" : sign(pot.points)),
    );
    $("score-effects").append(g);
    const timer = setTimeout(() => {
      g.remove();
      effectTimers.delete(timer);
    }, 1000);
    effectTimers.add(timer);
  }
}
function shootAim() {
  if (!aim || !canControl()) return;
  const { id, dx, dy } = aim;
  cancelAim();
  if (mode === "online") {
    if (Math.hypot(dx, dy) >= MIN_DRAG) match.submit("shot", { dx, dy });
    return;
  }
  if (launch(game, id, dx, dy)) {
    renderHUD();
    requestFrame();
  }
}
table.addEventListener("pointerdown", (event) => {
  if (!canControl()) return;
  if (game.phase === "placing" && event.button === 0 && event.isPrimary) {
    event.preventDefault();
    placement = point(event);
    renderPlacement();
    return;
  }
  if (
    game.phase !== "aiming" ||
    event.button !== 0 ||
    !event.isPrimary ||
    aim?.pointerId !== undefined
  )
    return;
  event.preventDefault();
  const p = point(event),
    radius = Math.max(BALL_RADIUS + 9, (18 * SIZE) / table.getBoundingClientRect().width);
  const nearest = game.balls
    .filter((b) => b.active)
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  if (!nearest || Math.hypot(nearest.x - p.x, nearest.y - p.y) > radius) return;
  if (nearest.kind !== "cue") {
    $("shot-notice").textContent = "打つのは白球だよ。白球をぶつけて、色の球を動かそう。";
    return;
  }
  cancelAim();
  aim = { id: nearest.id, pointerId: event.pointerId, start: p, dx: 0, dy: 0 };
  table.setPointerCapture(event.pointerId);
  renderAim();
});
table.addEventListener("pointermove", (event) => {
  if (!aim || event.pointerId !== aim.pointerId) return;
  event.preventDefault();
  const p = point(event);
  aim.dx = aim.start.x - p.x;
  aim.dy = aim.start.y - p.y;
  renderAim();
});
table.addEventListener("pointerup", (event) => {
  if (!aim || event.pointerId !== aim.pointerId) return;
  event.preventDefault();
  const p = point(event);
  aim.dx = aim.start.x - p.x;
  aim.dy = aim.start.y - p.y;
  shootAim();
});
table.addEventListener("pointercancel", cancelAim);
table.addEventListener("lostpointercapture", () => {
  if (aim?.pointerId !== undefined) cancelAim();
});
table.addEventListener("contextmenu", (event) => event.preventDefault());
table.addEventListener("dragstart", (event) => event.preventDefault());
table.addEventListener("keydown", (event) => {
  if (!canControl()) return;
  if (game.phase === "placing" && placement) {
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      confirmPlacement();
    } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      const step = event.shiftKey ? 4 : 12;
      placement.x = Math.max(
        0,
        Math.min(
          SIZE,
          placement.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
        ),
      );
      placement.y = Math.max(
        0,
        Math.min(
          SIZE,
          placement.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0),
        ),
      );
      renderPlacement();
    }
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    cancelAim();
    return;
  }
  const node = event.target.closest("[data-ball]");
  const b = node && game.balls.find((b) => b.id === Number(node.dataset.ball));
  if (game.phase !== "aiming" || !b?.active || b.kind !== "cue") return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (aim?.id === b.id && aim.keyboard) shootAim();
    else {
      cancelAim();
      aim = { id: b.id, dx: 0, dy: -MAX_DRAG * 0.45, keyboard: true };
      renderAim();
    }
    return;
  }
  if (
    !aim?.keyboard ||
    aim.id !== b.id ||
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
  )
    return;
  event.preventDefault();
  let angle = Math.atan2(aim.dy, aim.dx),
    power = Math.hypot(aim.dx, aim.dy);
  if (event.key === "ArrowLeft") angle -= Math.PI / 36;
  if (event.key === "ArrowRight") angle += Math.PI / 36;
  if (event.key === "ArrowUp") power = Math.min(MAX_DRAG, power + MAX_DRAG * 0.05);
  if (event.key === "ArrowDown") power = Math.max(MIN_DRAG + 1, power - MAX_DRAG * 0.05);
  aim.dx = Math.cos(angle) * power;
  aim.dy = Math.sin(angle) * power;
  renderAim();
});
function reset(starter = game.starter) {
  if (frameId !== null) cancelAnimationFrame(frameId);
  frameId = null;
  cancelAim();
  for (const timer of effectTimers) clearTimeout(timer);
  effectTimers.clear();
  $("score-effects").replaceChildren();
  game = createGame(Math.random, starter);
  placement = null;
  seenPots = 0;
  hudKey = "";
  $("result").hidden = true;
  makeTable();
  renderHUD();
}
$("shuffle").addEventListener("click", () => reset());
$("start").addEventListener("click", () => {
  if (mode === "local" && startGame(game)) renderHUD();
});
$("cancel-aim").addEventListener("click", cancelAim);
$("place-cue").addEventListener("click", confirmPlacement);
$("view-table").addEventListener("click", () => {
  $("result").hidden = true;
  $("show-result").focus({ preventScroll: true });
});
$("show-result").addEventListener("click", showResult);
$("rematch").addEventListener("click", () => {
  if (mode === "online") {
    match?.submit("rematch");
    return;
  }
  reset(1 - game.starter);
  startGame(game);
  renderHUD();
});
$("restart").addEventListener("click", () => {
  cancelAim();
  if (mode === "local") {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
  }
  $("restart-title").textContent = mode === "online" ? "へやを出る？" : "最初からあそぶ？";
  $("restart-note").textContent =
    mode === "online"
      ? "ふたりの通信を終えるよ。また遊ぶときは、へやをつくってね。"
      : "今の得点をリセットして、新しく球を並べるよ。";
  $("confirm-restart").textContent = mode === "online" ? "へやを出る" : "最初から";
  $("restart-dialog").showModal();
});
$("keep-playing").addEventListener("click", () => {
  $("restart-dialog").close();
  requestFrame();
});
$("confirm-restart").addEventListener("click", () => {
  $("restart-dialog").close();
  if (mode === "online") leaveRoom();
  else reset(0);
});
$("restart-dialog").addEventListener("close", requestFrame);
window.addEventListener("blur", cancelAim);
window.addEventListener("resize", cancelAim);
document.addEventListener("visibilitychange", () => {
  cancelAim();
  if (document.hidden) {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
  } else requestFrame();
});
window.addEventListener("pagehide", () => {
  if (mode === "online") leaveRoom();
  cancelAim();
  if (frameId !== null) cancelAnimationFrame(frameId);
  frameId = null;
});
window.addEventListener("pageshow", requestFrame);
for (const button of document.querySelectorAll("[data-mode]"))
  button.addEventListener("click", () => {
    if (connecting || onlineRound || game.phase !== "ready") return;
    closeOnline();
    mode = button.dataset.mode;
    hudKey = "";
    renderHUD();
  });
for (const button of document.querySelectorAll("[data-room]"))
  button.addEventListener("click", () => {
    if (connecting) return;
    closeOnline();
    roomAction = button.dataset.room;
    renderConnection();
  });
$("connect").addEventListener("click", connect);
$("room-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void connect();
  }
});
$("cancel-connect").addEventListener("click", leaveRoom);
$("copy-room").addEventListener("click", async () => {
  const attempt = epoch;
  try {
    await navigator.clipboard.writeText(roomCode);
    if (attempt === epoch) connectionNote = "コピーしたよ！ 相手にキーワードを教えてね。";
  } catch {
    if (attempt === epoch) connectionNote = "キーワードを長押ししてコピーしてね。";
  }
  renderConnection();
});
makeTable();
renderHUD();
