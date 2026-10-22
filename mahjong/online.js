import {
  createOnlineSession,
  generateRoomCode,
  normalizeRoomCode,
  isOnlineConfigured,
} from "../src/online-game.js?v=poker-rooms-20260908";
import {
  PROTOCOL,
  createMatch,
  applyAction,
  matchView,
  validateView,
  canAct,
} from "./online-rules.js?v=20261022-mahjong7";
export { generateRoomCode, normalizeRoomCode, isOnlineConfigured };
export async function createMahjongMatch({
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
    if (!stopped && ready && transport)
      void transport.send({ ...message, protocol: PROTOCOL }).catch(fail);
  }
  function deliver(next) {
    if (view && next.generation === view.generation && next.revision === view.revision) return;
    view = next;
    onState(next, player);
  }
  function publish(ack) {
    deliver(matchView(state, 0));
    send({ type: "state", state: matchView(state, 1), ack });
  }
  function announce() {
    if (!ready || !transport || stopped) return;
    onStatus("connected");
    if (role === "host") {
      state ??= createMatch(transport.clientId, 1, random);
      publish();
    } else send({ type: "sync" });
  }
  function receive(message) {
    if (stopped || message?.protocol !== PROTOCOL) return;
    if (role === "host") {
      if (!state) return;
      if (message.type === "sync") {
        send({ type: "state", state: matchView(state, 1) });
        return;
      }
      if (
        message.type !== "action" ||
        typeof message.id !== "string" ||
        !message.id ||
        message.id.length > 160
      )
        return;
      if (handled.has(message.id)) {
        publish(handled.get(message.id));
        return;
      }
      const next = applyAction(state, 1, message.action, random);
      const ack = {
        id: message.id,
        error: next ? "" : "手番が進んだみたい。画面を確認して、もう一度操作してね。",
      };
      handled.set(message.id, ack);
      if (handled.size > 64) handled.delete(handled.keys().next().value);
      if (next) state = next;
      publish(ack);
    } else if (message.type === "state") {
      const next = validateView(message.state, player);
      if (
        !next ||
        (view &&
          (next.matchId !== view.matchId ||
            next.generation < view.generation ||
            (next.generation === view.generation && next.revision < view.revision)))
      )
        return;
      const ownAck = pending && message.ack?.id === pending.id;
      if (
        ownAck ||
        (pending &&
          (next.generation > pending.action.generation || next.game.round > pending.action.round))
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
      ruleMode: "mahjong",
      channelPrefix: "takumegu-mini-mahjong",
      protocolVersion: PROTOCOL,
      supportedRules: ["mahjong"],
      onReady() {
        ready = true;
        announce();
      },
      onMessage: receive,
      onPeerChange(connected, info = {}) {
        if (seen && (!connected || (info.previousPeerId && info.previousPeerId !== info.peerId)))
          fail(new Error("相手との通信が切れたみたい。設定にもどって、つなぎ直してね。"));
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
        fail(new Error("返事が届かないみたい。設定にもどって、つなぎ直してね。"));
        return;
      }
      send({ type: "action", id: pending.id, action: pending.action });
    } else if (role === "guest") send({ type: "sync" });
  }, 1200);
  return {
    close,
    submit(type, tile) {
      if (stopped || !ready || !view || pending || !canAct(view, player, type, tile)) return false;
      const action = {
        type,
        tile,
        matchId: view.matchId,
        generation: view.generation,
        revision: view.revision,
        round: view.game.round,
      };
      if (role === "host") {
        const next = applyAction(state, player, action, random);
        if (!next) return false;
        state = next;
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
