import {
  createOnlineSession,
  generateRoomCode,
  normalizeRoomCode,
  isOnlineConfigured,
} from "../src/online-game.js?v=poker-rooms-20260908";
import {
  createGame,
  drop,
  aim,
  step,
  view,
  validateView,
  dispose,
  PROTOCOL,
} from "./engine.js?v=20261027-gyoza3";
export { generateRoomCode, normalizeRoomCode, isOnlineConfigured };
export async function createMatch({
  role,
  roomCode,
  onState = () => {},
  onStatus = () => {},
  onError = () => {},
  sessionFactory = createOnlineSession,
  timers = globalThis,
  now = () => Date.now(),
  random = Math.random,
}) {
  const player = role === "host" ? 0 : 1;
  let transport = null,
    ready = false,
    closed = false,
    seen = false,
    game = null,
    current = null,
    seq = 0,
    lastSeq = -1,
    serial = 0,
    matchId = null,
    pending = null,
    interval = null,
    lastSeen = now(),
    lastFrame = 0;
  let votes = [false, false],
    rematch = [false, false];
  const handled = new Set();
  function close() {
    if (closed) return;
    closed = true;
    pending = null;
    if (interval !== null) timers.clearInterval(interval);
    if (game) dispose(game);
    void transport?.close().catch(() => {});
  }
  function fail(error) {
    if (closed) return;
    close();
    onError(error instanceof Error ? error : new Error(String(error)));
  }
  function send(m) {
    if (!ready || closed || !transport) return;
    void transport.send({ ...m, protocol: PROTOCOL }).catch(fail);
  }
  function publish(ack = null) {
    if (!game || closed) return;
    current = { ...view(game), resumeVotes: [...votes], rematchVotes: [...rematch] };
    onState(current, player);
    send({ type: "state", matchId, seq: ++seq, state: current, ack });
  }
  function apply(who, a) {
    if (!game || !a || a.round !== game.round || a.move !== game.move) return false;
    if (a.type === "aim") return aim(game, who, a.x, a.angle);
    if (a.type === "drop") return drop(game, who, a.x, a.angle);
    if (a.type === "pause" && game.phase !== "finished") {
      game.paused = true;
      votes = [false, false];
      return true;
    }
    if (a.type === "resume" && game.paused) {
      votes[who] = true;
      if (votes.every(Boolean)) {
        game.paused = false;
        votes = [false, false];
      }
      return true;
    }
    if (a.type === "rematch" && game.phase === "finished") {
      rematch[who] = true;
      if (rematch.every(Boolean)) {
        const round = game.round + 1,
          starter = 1 - game.starter;
        dispose(game);
        game = createGame({ seed: Math.floor(random() * 4294967296), starter, round });
        rematch = [false, false];
        votes = [false, false];
      }
      return true;
    }
    return false;
  }
  function receive(m) {
    if (closed || m?.protocol !== PROTOCOL) return;
    lastSeen = now();
    if (role === "host") {
      if (m.type === "sync") {
        publish();
        return;
      }
      if (m.matchId !== matchId) return;
      if (m.type === "preview") {
        if (m.action?.type === "aim" && apply(1, m.action)) publish();
        return;
      }
      if (m.type !== "action" || typeof m.id !== "string" || m.id.length > 100) return;
      if (!handled.has(m.id)) {
        apply(1, m.action);
        handled.add(m.id);
        if (handled.size > 80) handled.delete(handled.values().next().value);
      }
      publish(m.id);
    } else if (m.type === "state") {
      if (
        typeof m.matchId !== "string" ||
        m.matchId.length > 120 ||
        !Number.isSafeInteger(m.seq) ||
        m.seq <= lastSeq ||
        (matchId && m.matchId !== matchId)
      )
        return;
      const v = validateView(m.state);
      if (!v) return;
      if (
        current &&
        (v.round < current.round ||
          (v.round === current.round && (v.move < current.move || v.tick < current.tick)))
      )
        return;
      if (
        ![m.state.resumeVotes, m.state.rematchVotes].every(
          (a) => Array.isArray(a) && a.length === 2 && a.every((b) => typeof b === "boolean"),
        )
      )
        return;
      matchId = m.matchId;
      lastSeq = m.seq;
      current = {
        ...v,
        resumeVotes: [...m.state.resumeVotes],
        rematchVotes: [...m.state.rematchVotes],
      };
      if (
        pending &&
        (m.ack === pending.id ||
          v.round > pending.action.round ||
          v.move > pending.action.move ||
          (v.phase === "finished" && pending.action.type !== "rematch"))
      ) {
        pending = null;
        onStatus("connected");
      }
      onState(current, player);
    }
  }
  function announce() {
    if (!ready || !transport || closed) return;
    lastSeen = now();
    onStatus("connected");
    if (role === "host") {
      matchId = transport.clientId;
      game ??= createGame({ seed: Math.floor(random() * 4294967296) });
      publish();
    } else send({ type: "sync" });
  }
  try {
    transport = await sessionFactory({
      role,
      roomCode,
      hostPlayer: 1,
      ruleMode: "gyoza",
      channelPrefix: "takumegu-gyoza",
      protocolVersion: PROTOCOL,
      supportedRules: ["gyoza"],
      onReady() {
        ready = true;
        announce();
      },
      onMessage: receive,
      onPeerChange(connected, info = {}) {
        if (seen && (!connected || (info.previousPeerId && info.previousPeerId !== info.peerId)))
          fail(new Error("相手との通信が切れました。へやを作り直してね。"));
        if (connected) seen = true;
      },
      onError: fail,
    });
  } catch (e) {
    close();
    throw e;
  }
  if (closed) {
    void transport.close();
    throw new Error("接続できませんでした。");
  }
  if (ready) announce();
  else onStatus("waiting");
  interval = timers.setInterval(() => {
    if (!ready || closed) return;
    if (now() - lastSeen > 15000) {
      fail(new Error("通信を確認できません。へやを作り直してね。"));
      return;
    }
    if (role === "host") publish();
    else {
      send({ type: "sync" });
      if (pending) send(pending);
    }
  }, 600);
  return {
    player,
    close,
    getState: () => current,
    request(type, data = {}) {
      if (closed || !ready || !current || pending) return false;
      const action = { ...data, type, round: current.round, move: current.move };
      if (role === "host") {
        const ok = apply(0, action);
        if (ok) publish();
        return ok;
      }
      if (
        ["drop", "aim"].includes(type) &&
        (current.turn !== player || current.phase !== "aim" || current.paused)
      )
        return false;
      if (type === "aim") {
        send({ type: "preview", matchId, action });
        return true;
      }
      pending = { type: "action", matchId, id: `${transport.clientId}:${++serial}`, action };
      send(pending);
      return true;
    },
    advance() {
      if (role !== "host" || closed || !game) return;
      const changed = step(game);
      if (changed || (game.phase === "falling" && now() - lastFrame >= 80)) {
        lastFrame = now();
        publish();
      }
    },
  };
}
