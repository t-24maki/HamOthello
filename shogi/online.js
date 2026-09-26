import {
  createOnlineSession,
  generateRoomCode,
  normalizeRoomCode,
  isOnlineConfigured,
} from "../src/online-game.js?v=poker-rooms-20260908";
import {
  PROTOCOL,
  createRound,
  applyAction,
  roundView,
  validateRound,
  ownerForPlayer,
} from "./online-rules.js";
export { generateRoomCode, normalizeRoomCode, isOnlineConfigured };

export async function createShogiMatch({
  role,
  roomCode,
  onState = () => {},
  onStatus = () => {},
  onError = () => {},
  onReject = () => {},
  sessionFactory = createOnlineSession,
  timers = globalThis,
  now = () => Date.now(),
  random = Math.random,
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
    serial = 0,
    failure = null;
  const handled = new Map();
  function close() {
    if (stopped) return;
    stopped = true;
    pending = null;
    if (interval !== null) timers.clearInterval(interval);
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
    void transport.send({ ...message, protocol: PROTOCOL }).catch(fail);
  }
  function deliver(next) {
    if (view && next.roundId === view.roundId && next.revision === view.revision) return;
    view = next;
    onState(next, ownerForPlayer(next, player));
  }
  function publish(ack) {
    deliver(state);
    send({ type: "state", state: roundView(state), ack });
  }
  function announce() {
    if (!ready || !transport || stopped) return;
    onStatus("connected");
    if (role === "host") {
      state ??= createRound(transport.clientId, 1, random);
      publish();
    } else send({ type: "sync" });
  }
  function receive(message) {
    if (stopped || message?.protocol !== PROTOCOL) return;
    if (role === "host") {
      if (!state) return;
      if (message.type === "sync") {
        send({ type: "state", state: roundView(state) });
        return;
      }
      if (message.type !== "action" || typeof message.id !== "string" || message.id.length > 160)
        return;
      if (handled.has(message.id)) {
        publish(handled.get(message.id));
        return;
      }
      const result = applyAction(state, 1, message.action, random);
      const ack = { id: message.id, error: result.ok ? "" : result.message };
      handled.set(message.id, ack);
      if (handled.size > 64) handled.delete(handled.keys().next().value);
      if (result.ok) state = result.state;
      publish(ack);
    } else if (message.type === "state") {
      const incoming = message.state;
      if (
        view &&
        (!incoming ||
          incoming.matchId !== view.matchId ||
          incoming.roundId < view.roundId ||
          (incoming.roundId === view.roundId && incoming.revision < view.revision))
      )
        return;
      const next = validateRound(incoming);
      if (!next) return;
      const ownAck = pending && message.ack?.id === pending.id;
      if (
        ownAck ||
        (pending &&
          (next.roundId > pending.action.roundId ||
            (next.game.status === "won" && pending.action.type !== "rematch")))
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
      ruleMode: "shogi",
      channelPrefix: "takumegu-shogi",
      protocolVersion: PROTOCOL,
      supportedRules: ["shogi"],
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
  interval = timers.setInterval(() => {
    if (pending) {
      if (now() - pending.since > 15000) {
        fail(new Error("返事が届かないみたい。へやを出て、つなぎ直してね。"));
        return;
      }
      send({ type: "action", id: pending.id, action: pending.action });
    } else if (role === "guest") send({ type: "sync" });
  }, 1200);
  return {
    close,
    submit(type, move) {
      if (stopped || !ready || !view || pending) return false;
      const action = {
        type,
        action: move,
        matchId: view.matchId,
        roundId: view.roundId,
        revision: view.revision,
      };
      const result = applyAction(view, player, action, random);
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
