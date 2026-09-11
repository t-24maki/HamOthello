import {
  createOnlineSession,
  generateRoomCode,
  normalizeRoomCode,
  isOnlineConfigured,
} from "../src/online-game.js?v=poker-rooms-20260908";
import {
  createGame,
  playWord,
  giveUp,
  timeOut,
  TURN_LIMIT_MS,
  validateGame,
  DICTIONARY_VERSION,
  FOODS,
} from "./rules.js?v=20260909-1000words";
export { generateRoomCode, normalizeRoomCode, isOnlineConfigured };
export const PROTOCOL = `food-shiritori-2:${DICTIONARY_VERSION}`;
export function createRound(matchId, roundId = 1, now = Date.now()) {
  return {
    ...createGame((roundId - 1) % 2),
    matchId,
    roundId,
    revision: 0,
    rematch: [false, false],
    protocol: PROTOCOL,
    turnEndsAt: now + TURN_LIMIT_MS,
  };
}
export function expireRound(state, now = Date.now()) {
  if (state.winner !== null || now < state.turnEndsAt) return state;
  return { ...timeOut(state), revision: state.revision + 1 };
}
export function applyAction(state, player, action, now = Date.now()) {
  if (
    ![0, 1].includes(player) ||
    !action ||
    action.matchId !== state.matchId ||
    action.roundId !== state.roundId
  )
    return { ok: false, message: "前のしりとりの操作みたい。もう一度試してね。" };
  const expired = expireRound(state, now);
  if (expired !== state) return { ok: true, state: expired, expired: true };
  if (action.type === "rematch") {
    if (state.winner === null || state.rematch[player])
      return { ok: false, message: "相手の返事を待ってね。" };
    const rematch = [...state.rematch];
    rematch[player] = true;
    return {
      ok: true,
      state: rematch.every(Boolean)
        ? createRound(state.matchId, state.roundId + 1, now)
        : { ...state, rematch, revision: state.revision + 1 },
    };
  }
  if (action.revision !== state.revision)
    return { ok: false, message: "手番が変わったよ。画面を確認してね。" };
  let result;
  if (action.type === "word") result = playWord(state, player, action.word);
  else if (action.type === "giveup") {
    const next = giveUp(state, player);
    result = next ? { ok: true, state: next } : { ok: false, message: "自分の番に押してね。" };
  } else return { ok: false, message: "その操作はできないよ。" };
  if (!result.ok) return result;
  return {
    ok: true,
    state: {
      ...result.state,
      revision: state.revision + 1,
      turnEndsAt: result.state.winner === null ? now + TURN_LIMIT_MS : state.turnEndsAt,
    },
  };
}
export function validateRound(view) {
  if (
    !view ||
    view.protocol !== PROTOCOL ||
    typeof view.matchId !== "string" ||
    !view.matchId ||
    view.matchId.length > 120 ||
    !Number.isSafeInteger(view.roundId) ||
    view.roundId < 1 ||
    !Number.isInteger(view.revision) ||
    view.revision < 0 ||
    view.revision > FOODS.length + 3 ||
    !Number.isSafeInteger(view.turnEndsAt) ||
    view.turnEndsAt <= 0 ||
    !Array.isArray(view.rematch) ||
    view.rematch.length !== 2 ||
    view.rematch.some((x) => typeof x !== "boolean") ||
    view.rematch.every(Boolean)
  )
    return null;
  const game = validateGame(view);
  if (
    !game ||
    game.starter !== (view.roundId - 1) % 2 ||
    (game.winner === null && view.rematch.some(Boolean))
  )
    return null;
  if (
    view.revision !==
    game.history.length + (game.winner !== null ? 1 : 0) + view.rematch.filter(Boolean).length
  )
    return null;
  return {
    ...game,
    protocol: PROTOCOL,
    matchId: view.matchId,
    roundId: view.roundId,
    revision: view.revision,
    rematch: [...view.rematch],
    turnEndsAt: view.turnEndsAt,
  };
}
export async function createShiritoriMatch({
  role,
  roomCode,
  onState = () => {},
  onStatus = () => {},
  onError = () => {},
  onReject = () => {},
  sessionFactory = createOnlineSession,
  timers = globalThis,
  now = () => Date.now(),
}) {
  const player = role === "host" ? 0 : 1;
  let transport = null,
    ready = false,
    stopped = false,
    seen = false,
    state = null,
    view = null,
    pending = null,
    interval = null,
    clockInterval = null,
    clockAnchor = null,
    serial = 0,
    failure = null;
  const handled = new Map();
  function close() {
    if (stopped) return;
    stopped = true;
    pending = null;
    if (interval !== null) timers.clearInterval(interval);
    if (clockInterval !== null) timers.clearInterval(clockInterval);
    void transport?.close().catch(() => {});
  }
  function fail(error) {
    if (stopped) return;
    failure = error instanceof Error ? error : new Error(String(error));
    close();
    onError(failure);
  }
  function send(message) {
    if (stopped || !ready || !transport) return;
    void transport
      .send({ ...message, protocol: PROTOCOL, ...(role === "host" ? { sentAt: now() } : {}) })
      .catch(fail);
  }
  function deliver(next) {
    if (view && next.roundId === view.roundId && next.revision === view.revision) return;
    view = next;
    onState(next, player);
  }
  function publish(ack) {
    deliver(state);
    send({ type: "state", state, ack });
  }
  function hostNow() {
    if (role === "host" || !clockAnchor) return now();
    return clockAnchor.host + Math.max(0, now() - clockAnchor.local);
  }
  function settleTimeout() {
    if (stopped || role !== "host" || !state) return;
    const next = expireRound(state, now());
    if (next !== state) {
      state = next;
      publish();
    }
  }
  function announce() {
    if (!ready || !transport || stopped) return;
    onStatus("connected");
    if (role === "host") {
      state ??= createRound(transport.clientId, 1, now());
      publish();
    } else send({ type: "sync" });
  }
  function receive(message) {
    if (stopped || message?.protocol !== PROTOCOL) return;
    if (role === "host") {
      if (!state) return;
      settleTimeout();
      if (message.type === "sync") {
        send({ type: "state", state });
        return;
      }
      if (message.type !== "action" || typeof message.id !== "string" || message.id.length > 160)
        return;
      if (handled.has(message.id)) {
        publish(handled.get(message.id));
        return;
      }
      const result = applyAction(state, 1, message.action, now());
      const ack = { id: message.id, error: result.ok ? "" : result.message };
      handled.set(message.id, ack);
      if (handled.size > 32) handled.delete(handled.keys().next().value);
      if (result.ok) state = result.state;
      publish(ack);
    } else if (message.type === "state") {
      const next = validateRound(message.state);
      if (
        !next ||
        !Number.isSafeInteger(message.sentAt) ||
        message.sentAt <= 0 ||
        next.turnEndsAt > message.sentAt + TURN_LIMIT_MS ||
        (next.reason === "timeout" && message.sentAt < next.turnEndsAt) ||
        (view &&
          (next.matchId !== view.matchId ||
            next.roundId < view.roundId ||
            (next.roundId === view.roundId && next.revision < view.revision)))
      )
        return;
      clockAnchor = {
        host: clockAnchor ? Math.max(hostNow(), message.sentAt) : message.sentAt,
        local: now(),
      };
      const ownAck = pending && message.ack?.id === pending.id;
      if (
        ownAck ||
        (pending &&
          (next.roundId > pending.action.roundId ||
            (next.winner !== null && pending.action.type !== "rematch")))
      ) {
        pending = null;
        onStatus("connected");
      }
      deliver(next);
      if (ownAck && typeof message.ack.error === "string" && message.ack.error)
        onReject(message.ack.error.slice(0, 160));
    }
  }
  try {
    transport = await sessionFactory({
      role,
      roomCode,
      hostPlayer: 1,
      ruleMode: "shiritori",
      channelPrefix: "takumegu-food-shiritori",
      protocolVersion: PROTOCOL,
      supportedRules: ["shiritori"],
      onReady() {
        ready = true;
        announce();
      },
      onMessage: receive,
      onPeerChange(connected, info = {}) {
        if (seen && (!connected || (info.previousPeerId && info.previousPeerId !== info.peerId)))
          fail(new Error("相手との通信が切れたみたい。へやを出て、つなぎ直してね。"));
        if (connected) seen = true;
      },
      onError: fail,
    });
  } catch (error) {
    close();
    throw error;
  }
  if (stopped) {
    await transport.close();
    throw failure ?? new Error("接続を終了しました。");
  }
  announce();
  if (role === "host") clockInterval = timers.setInterval(settleTimeout, 100);
  interval = timers.setInterval(() => {
    if (pending) {
      if (now() - pending.since > 15000) {
        fail(new Error("返事が届かないみたい。へやをつくり直してね。"));
        return;
      }
      send({ type: "action", id: pending.id, action: pending.action });
    } else if (role === "guest") send({ type: "sync" });
  }, 1200);
  return {
    close,
    remainingMs() {
      return stopped || !view || view.winner !== null
        ? 0
        : Math.max(0, Math.min(TURN_LIMIT_MS, view.turnEndsAt - hostNow()));
    },
    submit(type, word) {
      settleTimeout();
      if (stopped || !ready || !view || pending) return false;
      const action = {
        type,
        word,
        matchId: view.matchId,
        roundId: view.roundId,
        revision: view.revision,
      };
      const result = applyAction(view, player, action, hostNow());
      if (!result.ok) {
        onReject(result.message);
        return false;
      }
      if (role === "host") {
        state = result.state;
        publish();
      } else {
        pending = { id: `${transport.clientId}:${++serial}`, action, since: now() };
        onStatus("sending");
        send({ type: "action", id: pending.id, action });
      }
      return true;
    },
  };
}
