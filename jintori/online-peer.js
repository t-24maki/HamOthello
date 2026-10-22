import {
  createGame,
  tick,
  predictPlayer,
  pause,
  resume,
  STEP,
  EMPTY,
} from "./engine.js?v=20261022-jintori4";
import { createCPU, cpuInput } from "./cpu.js?v=20261022-jintori4";
import {
  PROTOCOL,
  validId,
  integer,
  validInput,
  validState,
  readGame,
  gameView,
} from "./protocol.js?v=20261022-jintori4";
const copy = (value) => structuredClone(value);
export function createPeer({
  role,
  matchId,
  send,
  now = () => performance.now(),
  random = Math.random,
  onChange = () => {},
  onError = () => {},
}) {
  const seat = role === "host" ? 0 : 1;
  let game = null,
    prediction = null,
    brains = [],
    round = 0,
    epoch = 0,
    serial = 0,
    received = 0;
  let ready = [false, false],
    rematch = [false, false],
    connected = false,
    stopped = false,
    hold = false;
  let held = EMPTY,
    remote = EMPTY,
    inputSeq = 0,
    remoteSeq = 0,
    localFrame = 0,
    ackFrame = 0;
  let requestSeq = 0,
    controlAck = 0,
    pending = null,
    accumulator = 0,
    history = [];
  let lastReceive = now(),
    lastInput = now(),
    snapshotAt = now(),
    previous = null,
    smoothing = { x: 0, y: 0 };
  function info() {
    return {
      game,
      seat,
      round,
      epoch,
      ready: [...ready],
      rematch: [...rematch],
      waiting: !!pending || hold,
      stopped,
    };
  }
  const notify = () => onChange(info());
  function reset() {
    held = EMPTY;
    remote = EMPTY;
    inputSeq = remoteSeq = localFrame = ackFrame = 0;
    accumulator = 0;
    history = [];
    prediction = game && copy(game);
    previous = null;
    smoothing = { x: 0, y: 0 };
  }
  function transmit(m) {
    if (connected && !stopped) send({ ...m, protocol: PROTOCOL });
  }
  function publish() {
    if (game)
      transmit({
        type: "state",
        matchId,
        round,
        epoch,
        serial: ++serial,
        ackFrame,
        controlAck,
        ready,
        rematch,
        game: gameView(game),
      });
  }
  function newRound() {
    round++;
    epoch++;
    game = createGame(Math.floor(random() * 2 ** 32));
    brains = game.players.map((_, i) => createCPU(game.seed + i * 1009));
    pause(game);
    ready = [false, false];
    rematch = [false, false];
    hold = false;
    pending = null;
    reset();
    notify();
  }
  function pauseBoth() {
    if (pause(game)) {
      epoch++;
      ready = [false, false];
      reset();
    }
    notify();
  }
  function fail(message) {
    if (stopped) return;
    pauseBoth();
    stopped = true;
    hold = true;
    pending = null;
    onError(new Error(message));
    notify();
  }
  function control(player, type) {
    if (!game) return;
    if (type === "pause") {
      ready[player] = false;
      pauseBoth();
    }
    if (type === "ready" && game.phase === "paused") {
      ready[player] = true;
      if (ready.every(Boolean)) {
        resume(game);
        epoch++;
        hold = false;
        reset();
      }
      notify();
    }
    if (type === "rematch" && game.phase === "finished") {
      rematch[player] = true;
      if (rematch.every(Boolean)) newRound();
      else notify();
    }
  }
  function request(type) {
    if (
      stopped ||
      !game ||
      !["pause", "ready", "rematch"].includes(type) ||
      (type === "ready" && game.phase !== "paused") ||
      (type === "rematch" && game.phase !== "finished") ||
      (type === "pause" && game.phase === "finished")
    )
      return false;
    if (role === "host") {
      control(0, type);
      publish();
      return true;
    }
    if (pending && type !== "pause") return false;
    if (type === "pause") {
      hold = true;
      held = EMPTY;
      history = [];
    }
    pending = { seq: ++requestSeq, type, round, epoch };
    flush();
    notify();
    return true;
  }
  function receive(m) {
    if (stopped || !m || m.protocol !== PROTOCOL) return;
    if (m.type === "leave" && validId(matchId) && m.matchId === matchId)
      return fail("相手がへやを出たよ。もう一度へやをつくってね。");
    if (role === "host" && m.type === "hello" && connected && !game) {
      lastReceive = now();
      newRound();
      publish();
      return;
    }
    if (role === "guest") {
      if (
        m.type !== "state" ||
        !validState(m) ||
        (matchId && m.matchId !== matchId) ||
        m.serial <= received ||
        m.round < round ||
        m.epoch < epoch ||
        (round && m.round > round + 1)
      )
        return;
      const next = readGame(m.game);
      if (
        !next ||
        (game &&
          m.round === round &&
          (next.fieldId !== game.fieldId || next.seed !== game.seed || next.frame < game.frame))
      )
        return;
      const changed = round !== m.round || epoch !== m.epoch;
      const oldView = renderGame(0);
      game = next;
      matchId = m.matchId;
      received = m.serial;
      round = m.round;
      epoch = m.epoch;
      ready = [...m.ready];
      rematch = [...m.rematch];
      lastReceive = now();
      if (pending && m.controlAck >= pending.seq) {
        pending = null;
        hold = false;
      }
      if (changed) reset();
      else {
        history = history.filter((h) => h.frame > m.ackFrame).slice(-18);
        prediction = copy(game);
        if (game.phase === "playing" && !hold)
          for (const h of history) predictPlayer(prediction, seat, h.input);
        const p = prediction.players[seat],
          old = oldView?.players[seat];
        smoothing =
          old && Math.hypot(old.x - p.x, old.y - p.y) < 1.5
            ? { x: old.x - p.x, y: old.y - p.y }
            : { x: 0, y: 0 };
      }
      previous = oldView?.players || null;
      snapshotAt = now();
      notify();
      return;
    }
    if (
      m.type !== "input" ||
      m.matchId !== matchId ||
      m.round !== round ||
      !integer(m.seq, 1) ||
      !integer(m.frame) ||
      !validInput(m.input)
    )
      return;
    lastReceive = now();
    const c = m.control;
    if (
      c &&
      integer(c.seq, 1) &&
      c.seq > controlAck &&
      ["pause", "ready", "rematch"].includes(c.type) &&
      c.round === round &&
      integer(c.epoch, 1)
    ) {
      controlAck = c.seq;
      if (c.type === "pause" || c.epoch === epoch) control(1, c.type);
    }
    if (m.epoch !== epoch || m.seq <= remoteSeq || game?.phase !== "playing") return;
    remoteSeq = m.seq;
    ackFrame = m.frame;
    lastInput = now();
    remote = { x: m.input.x, y: m.input.y };
  }
  function flush() {
    if (!connected || stopped) return;
    const silence = now() - lastReceive;
    if (silence > 8000) return fail("通信が途切れたよ。へやを出て、つなぎ直してね。");
    if (game && silence > 900 && ["playing", "countdown"].includes(game.phase)) {
      if (role === "host") pauseBoth();
      else if (!hold) request("pause");
    }
    if (role === "host") publish();
    else if (!game) transmit({ type: "hello" });
    else
      transmit({
        type: "input",
        matchId,
        round,
        epoch,
        seq: ++inputSeq,
        frame: localFrame,
        input: hold ? EMPTY : held,
        control: pending,
      });
  }
  function update(seconds, getInput) {
    if (
      stopped ||
      !game ||
      hold ||
      !["countdown", "playing"].includes(game.phase) ||
      !Number.isFinite(seconds) ||
      seconds <= 0
    )
      return;
    if (seconds > 0.25) {
      request("pause");
      return;
    }
    accumulator += seconds;
    while (accumulator + 1e-9 >= STEP) {
      accumulator -= STEP;
      const input = getInput();
      localFrame++;
      if (role === "host") {
        const before = game.phase;
        tick(game, [
          input,
          now() - lastInput > 350 ? EMPTY : remote,
          cpuInput(game, brains[2], 2),
          cpuInput(game, brains[3], 3),
        ]);
        if (before !== game.phase) {
          if (game.phase === "finished") {
            epoch++;
            reset();
            rematch = [false, false];
          }
          notify();
          publish();
        }
      } else if (game.phase === "playing") {
        held = { ...input };
        history.push({ frame: localFrame, input: held });
        if (history.length > 60) history.shift();
        predictPlayer(prediction, seat, held);
      }
      if (game.phase === "finished") break;
    }
  }
  function renderGame(dt = 0) {
    if (!game || role === "host") return game;
    const view = { ...game, players: copy(prediction?.players || game.players) };
    view.phase = hold && game.phase !== "finished" ? "paused" : game.phase;
    smoothing.x *= Math.exp(-Math.max(0, dt) * 20);
    smoothing.y *= Math.exp(-Math.max(0, dt) * 20);
    if (view.phase === "playing") {
      view.players[seat].x += smoothing.x;
      view.players[seat].y += smoothing.y;
      const blend = Math.min(1, (now() - snapshotAt) / 100);
      game.players.forEach((p, i) => {
        if (i === seat || !previous) return;
        view.players[i].x = previous[i].x + (p.x - previous[i].x) * blend;
        view.players[i].y = previous[i].y + (p.y - previous[i].y) * blend;
      });
    }
    return view;
  }
  return {
    info,
    receive,
    request,
    update,
    flush,
    renderGame,
    fail,
    connect() {
      if (connected || stopped) return;
      connected = true;
      lastReceive = now();
      flush();
    },
    close() {
      if (stopped) return;
      transmit({ type: "leave", matchId });
      stopped = true;
      hold = true;
      reset();
    },
  };
}
