import {
  createMatch,
  tick,
  predictMovement,
  pause,
  resume,
  STEP,
  EMPTY_INPUT,
  isCharacter,
} from "./engine.js?v=20261001-battle9";
import {
  PROTOCOL,
  ACTIONS,
  emptyEdges,
  validInput,
  validState,
  readGame,
  gameView,
} from "./online-protocol.js?v=20261001-battle9";

const copy = (value) => structuredClone(value);
const empty = () => ({ ...EMPTY_INPUT });
// The host alone runs collisions/results. Guest prediction is bounded and never awards damage/stocks.
export function createBattlePeer({
  role,
  matchId,
  character = "tak",
  stageId = "hill",
  now,
  send,
  onChange = () => {},
  onError = () => {},
}) {
  const seat = role === "host" ? 0 : 1;
  const selectedCharacter = isCharacter(character) ? character : "tak";
  let guestCharacter = null;
  let game = null,
    prediction = null,
    round = 0,
    epoch = 0,
    serial = 0,
    receivedSerial = 0;
  let ready = [false, false],
    rematch = [false, false],
    connected = false,
    stopped = false;
  let accumulator = 0,
    localFrame = 0,
    inputSeq = 0,
    remoteSeq = 0,
    ackFrame = 0;
  let localEdges = emptyEdges(),
    seenEdges = emptyEdges(),
    ackEdges = emptyEdges(),
    queued = emptyEdges();
  let held = empty(),
    remoteHeld = empty(),
    history = [],
    smoothing = { x: 0, y: 0 };
  let previousRemote = null,
    snapshotAt = now(),
    lastReceive = now(),
    lastInput = now();
  let requestSeq = 0,
    controlAck = 0,
    pending = null,
    localHold = false,
    echo = 0,
    latency = null;
  function notify() {
    onChange(info());
  }
  function info() {
    return {
      game,
      seat,
      round,
      epoch,
      ready: [...ready],
      rematch: [...rematch],
      waiting: !!pending || localHold,
      stopped,
      latency,
    };
  }
  function resetInputs() {
    accumulator = 0;
    localFrame = 0;
    inputSeq = 0;
    remoteSeq = 0;
    ackFrame = 0;
    localEdges = emptyEdges();
    seenEdges = emptyEdges();
    ackEdges = emptyEdges();
    queued = emptyEdges();
    held = empty();
    remoteHeld = empty();
    history = [];
    smoothing = { x: 0, y: 0 };
    prediction = game && copy(game);
    previousRemote = null;
  }
  function newRound() {
    round++;
    epoch++;
    game = createMatch(selectedCharacter, "normal", stageId, guestCharacter);
    pause(game);
    ready = [false, false];
    rematch = [false, false];
    resetInputs();
    localHold = false;
    pending = null;
    notify();
  }
  function pauseBoth() {
    if (!game || game.phase === "finished") return;
    if (pause(game)) {
      epoch++;
      ready = [false, false];
      resetInputs();
    }
    notify();
  }
  function fail(message) {
    if (stopped) return;
    pauseBoth();
    stopped = true;
    localHold = true;
    pending = null;
    onError(new Error(message));
    notify();
  }
  function transmit(message) {
    if (!connected || stopped) return;
    send({ ...message, protocol: PROTOCOL });
  }
  function publish() {
    if (!game) return;
    transmit({
      type: "state",
      matchId,
      round,
      epoch,
      serial: ++serial,
      game: gameView(game),
      ready,
      rematch,
      ackFrame,
      ackEdges,
      controlAck,
      echo,
    });
  }
  function applyControl(player, type) {
    if (!game) return;
    if (type === "pause") {
      ready[player] = false;
      pauseBoth();
      return;
    }
    if (type === "ready" && game.phase === "paused") {
      ready[player] = true;
      if (ready.every(Boolean)) {
        resume(game);
        epoch++;
        resetInputs();
        localHold = false;
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
    if (stopped || !game || !["pause", "ready", "rematch"].includes(type)) return false;
    if (type === "ready" && game.phase !== "paused") return false;
    if (type === "rematch" && game.phase !== "finished") return false;
    if (type === "pause" && game.phase === "finished") return false;
    if (role === "host") {
      applyControl(0, type);
      publish();
      return true;
    }
    if (pending && type !== "pause") return false;
    if (type === "pause") {
      localHold = true;
      held = empty();
      history = [];
    }
    pending = { seq: ++requestSeq, type, round, epoch };
    flush();
    notify();
    return true;
  }
  function reconcile(next, m) {
    const oldView = renderGame(0),
      changed = m.round !== round || m.epoch !== epoch;
    previousRemote = oldView ? copy(oldView.fighters[0]) : null;
    game = next;
    round = m.round;
    epoch = m.epoch;
    ready = [...m.ready];
    rematch = [...m.rematch];
    if (pending && m.controlAck >= pending.seq) {
      pending = null;
      localHold = false;
    }
    if (changed) {
      // Pause/resume/new-round generations invalidate every old held key and prediction.
      resetInputs();
    } else {
      history = history.filter((h) => h.frame > m.ackFrame).slice(-120);
      prediction = copy(game);
      const replay = history.slice(-30);
      for (const h of replay) {
        const input = { ...h.input };
        for (const action of ACTIONS)
          input[action] = input[action] && h.edges[action] > m.ackEdges[action];
        predictMovement(prediction, seat, input);
      }
      const f = prediction.fighters[seat],
        old = oldView?.fighters[seat];
      smoothing =
        old &&
        old.stocks === f.stocks &&
        old.respawn === 0 &&
        f.respawn === 0 &&
        Math.hypot(old.x - f.x, old.y - f.y) < 100
          ? { x: old.x - f.x, y: old.y - f.y }
          : { x: 0, y: 0 };
    }
    snapshotAt = now();
    if (m.echo > 0 && m.echo <= now()) latency = Math.round(now() - m.echo);
    notify();
  }
  function receive(m) {
    if (stopped || !m || m.protocol !== PROTOCOL) return;
    if (m.type === "leave" && m.matchId === matchId) {
      fail("相手がへやを出たよ。もう一度へやをつくってね。");
      return;
    }
    // The guest repeats its selection until the host acknowledges it with a match.
    // Lock both selections for this room so delayed hellos cannot change a rematch.
    if (role === "host" && m.type === "hello") {
      if (!connected || game || !isCharacter(m.character)) return;
      guestCharacter = m.character;
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
        m.serial <= receivedSerial ||
        m.round < round ||
        m.epoch < epoch ||
        (round && m.round > round + 1)
      )
        return;
      const next = readGame(m.game);
      if (
        !next ||
        next.fighters[seat].character !== selectedCharacter ||
        (game && next.fighters[0].character !== game.fighters[0].character)
      )
        return;
      matchId = m.matchId;
      receivedSerial = m.serial;
      lastReceive = now();
      reconcile(next, m);
      return;
    }
    if (
      m.type !== "input" ||
      m.matchId !== matchId ||
      m.round !== round ||
      !Number.isFinite(m.sentAt) ||
      m.sentAt < 0 ||
      !validInput(m.input)
    )
      return;
    lastReceive = now();
    echo = m.sentAt;
    const c = m.control;
    if (
      c &&
      Number.isSafeInteger(c.seq) &&
      c.seq > controlAck &&
      c.seq <= 1000000 &&
      ["pause", "ready", "rematch"].includes(c.type) &&
      c.round === round
    ) {
      controlAck = c.seq;
      if (c.type === "pause" || c.epoch === epoch) applyControl(1, c.type);
    }
    if (m.epoch !== epoch || m.input.seq <= remoteSeq || game.phase !== "playing") return;
    const i = m.input;
    if (ACTIONS.some((k) => i.edges[k] < seenEdges[k] || i.edges[k] - seenEdges[k] > 8)) return;
    remoteSeq = i.seq;
    ackFrame = i.frame;
    lastInput = now();
    remoteHeld = { ...empty(), move: i.move, guard: i.guard };
    for (const k of ACTIONS) {
      queued[k] = Math.min(8, queued[k] + i.edges[k] - seenEdges[k]);
      seenEdges[k] = i.edges[k];
    }
  }
  function flush() {
    if (stopped || !connected) return;
    const silence = now() - lastReceive;
    if (silence > 8000) {
      fail("相手から返事が届かないよ。へやを出て、つなぎ直してね。");
      return;
    }
    if (game && silence > 900 && ["playing", "countdown"].includes(game.phase)) {
      if (role === "host") pauseBoth();
      else if (!localHold) {
        localHold = true;
        pending = { seq: ++requestSeq, type: "pause", round, epoch };
        notify();
      }
    }
    if (role === "host") publish();
    else if (game)
      transmit({
        type: "input",
        matchId,
        round,
        epoch,
        sentAt: now(),
        control: pending,
        input: {
          seq: ++inputSeq,
          frame: localFrame,
          move: localHold ? 0 : held.move,
          guard: !localHold && held.guard,
          edges: { ...localEdges },
        },
      });
    else transmit({ type: "hello", character: selectedCharacter });
  }
  function update(seconds, getInput) {
    if (stopped || !game || localHold || game.phase === "paused" || game.phase === "finished")
      return;
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    if (seconds > 0.25) {
      request("pause");
      return;
    }
    accumulator += Math.min(0.1, seconds);
    while (accumulator + 1e-9 >= STEP) {
      accumulator -= STEP;
      const raw = getInput(),
        input = { ...empty(), ...raw };
      localFrame++;
      if (role === "host") {
        const remote = { ...remoteHeld };
        if (now() - lastInput > 350) {
          remote.move = 0;
          remote.guard = false;
        }
        for (const k of ACTIONS) {
          remote[k] = queued[k] > 0;
          if (remote[k]) {
            queued[k]--;
            ackEdges[k]++;
          }
        }
        const before = game.phase;
        tick(game, [input, remote]);
        if (before !== game.phase) {
          if (game.phase === "finished") {
            epoch++;
            resetInputs();
            rematch = [false, false];
          }
          notify();
        }
      } else if (game.phase === "playing") {
        held = { ...input };
        for (const k of ACTIONS) if (input[k]) localEdges[k]++;
        history.push({ frame: localFrame, input: { ...input }, edges: { ...localEdges } });
        if (history.length > 120) history.shift();
        predictMovement(prediction, seat, input);
      }
      if (game.phase === "finished") {
        accumulator = 0;
        break;
      }
    }
  }
  function renderGame(seconds = 0) {
    if (!game) return null;
    if (role === "host") return game;
    const view = copy(prediction || game);
    // HUD/result and authoritative events never come from a speculative simulation.
    const effectTime = Math.max(0, (now() - snapshotAt) / 1000);
    view.effects = game.effects
      .map((e) => ({ ...e, age: e.age + effectTime, life: e.life - effectTime }))
      .filter((e) => e.life > 0);
    view.events = game.events;
    view.eventId = game.eventId;
    view.remaining = game.remaining;
    view.phase = localHold && game.phase !== "finished" ? "paused" : game.phase;
    smoothing.x *= Math.exp(-Math.max(0, seconds) * 18);
    smoothing.y *= Math.exp(-Math.max(0, seconds) * 18);
    view.fighters[seat].x += smoothing.x;
    if (!view.fighters[seat].grounded) view.fighters[seat].y += smoothing.y;
    const target = game.fighters[0];
    if (
      previousRemote &&
      target.stocks === previousRemote.stocks &&
      !target.respawn &&
      game.phase === "playing" &&
      Math.hypot(target.x - previousRemote.x, target.y - previousRemote.y) < 180
    ) {
      const t = Math.min(1, (now() - snapshotAt) / 100);
      view.fighters[0].x = previousRemote.x + (target.x - previousRemote.x) * t;
      view.fighters[0].y = previousRemote.y + (target.y - previousRemote.y) * t;
    }
    return view;
  }
  return {
    connect() {
      if (connected || stopped) return;
      connected = true;
      lastReceive = now();
      flush();
    },
    receive,
    flush,
    update,
    request,
    renderGame,
    info,
    close() {
      if (stopped) return;
      transmit({ type: "leave", matchId });
      stopped = true;
      localHold = true;
      resetInputs();
    },
    fail,
  };
}
