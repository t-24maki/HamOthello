import {
  createOnlineSession,
  generateRoomCode,
  normalizeRoomCode,
  isOnlineConfigured,
} from "../src/online-game.js?v=poker-rooms-20260908";
import {
  POKER_PROTOCOL,
  createOnlineRound,
  applyOnlineAction,
  playerView,
  validView,
} from "./online-rules.js?v=poker-online-20260908";
export { generateRoomCode, normalizeRoomCode, isOnlineConfigured };

export async function createPokerMatch({
  role,
  roomCode,
  onView = () => {},
  onStatus = () => {},
  onError = () => {},
  sessionFactory = createOnlineSession,
  random = Math.random,
  timers = globalThis,
}) {
  let transport = null,
    ready = false,
    stopped = false,
    state = null,
    view = null,
    pending = null,
    interval = null;
  const player = role === "host" ? 0 : 1;
  let seen = false,
    failure = null;
  const close = () => {
    if (stopped) return;
    stopped = true;
    if (interval !== null) timers.clearInterval(interval);
    pending = null;
    void transport?.close();
  };
  const fail = (error) => {
    if (stopped) return;
    failure = error instanceof Error ? error : new Error(String(error));
    close();
    onError(failure);
  };
  const send = (message) => {
    if (stopped || !transport || !ready) return;
    void transport.send({ ...message, protocol: POKER_PROTOCOL }).catch(fail);
  };
  function deliver(next) {
    if (
      view &&
      next.matchId === view.matchId &&
      next.roundId === view.roundId &&
      next.revision === view.revision
    )
      return;
    view = next;
    if (
      pending &&
      (next.roundId !== pending.roundId ||
        (pending.type === "exchange" && next.exchanges[player] !== null) ||
        (pending.type === "ready" && next.ready[player]) ||
        (pending.type === "rematch" && next.rematch[player]))
    ) {
      pending = null;
      onStatus("connected");
    }
    onView(next, player);
  }
  function publish() {
    if (!state || stopped) return;
    deliver(playerView(state, 0));
    send({ type: "view", view: playerView(state, 1) });
  }
  function announce() {
    if (!ready || !transport || stopped) return;
    onStatus("connected");
    if (role === "host") {
      if (!state) state = createOnlineRound(transport.clientId, 1, random);
      publish();
    } else send({ type: "sync" });
  }
  function receive(message) {
    if (stopped || message?.protocol !== POKER_PROTOCOL) return;
    if (role === "host") {
      if (!state) return;
      if (message.type === "action") {
        const next = applyOnlineAction(state, 1, message.action, random);
        if (next) state = next;
        publish(); // A retry receives the committed view without exchanging again.
      } else if (message.type === "sync") send({ type: "view", view: playerView(state, 1) });
    } else if (message.type === "view" && validView(message.view, 1)) {
      const next = message.view;
      if (
        view &&
        (next.matchId !== view.matchId ||
          next.roundId < view.roundId ||
          (next.roundId === view.roundId && next.revision <= view.revision))
      )
        return;
      deliver(next);
    }
  }
  try {
    transport = await sessionFactory({
      role,
      roomCode,
      hostPlayer: 1,
      ruleMode: "poker",
      channelPrefix: "takumegu-mini-poker",
      protocolVersion: POKER_PROTOCOL,
      supportedRules: ["poker"],
      onReady() {
        ready = true;
        announce();
      },
      onMessage: receive,
      onPeerChange(connected, info = {}) {
        if (seen && (!connected || (info.previousPeerId && info.previousPeerId !== info.peerId))) {
          fail(new Error("相手との通信が切れたみたい。へやを出て、もう一度つなごう。"));
        }
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
    throw failure ?? new Error("接続を終了しました。もう一度試してね。");
  }
  announce();
  // Sync repairs lost broadcasts. Repeating a pending action is safe because
  // each round allows one exchange, one reveal, and one rematch vote per seat.
  interval = timers.setInterval(() => {
    if (pending) {
      if (Date.now() - pending.since > 15000) {
        fail(new Error("通信の返事が届かないみたい。へやをつくり直してね。"));
        return;
      }
      send({ type: "action", action: pending });
    } else if (role === "guest") send({ type: "sync" });
  }, 1200);
  return {
    close,
    submit(type, indices) {
      if (stopped || !ready || !view || pending) return false;
      if (type === "exchange") {
        if (
          view.phase !== "choose" ||
          view.exchanges[player] !== null ||
          !Array.isArray(indices) ||
          indices.length > 3 ||
          new Set(indices).size !== indices.length ||
          indices.some((i) => !Number.isInteger(i) || i < 0 || i > 2)
        )
          return false;
      } else if (type === "ready") {
        if (view.phase !== "choose" || view.exchanges[player] === null || view.ready[player])
          return false;
      } else if (type === "rematch") {
        if (view.phase !== "result" || view.rematch[player]) return false;
      } else return false;
      const action = { type, indices, matchId: view.matchId, roundId: view.roundId };
      if (role === "host") {
        const next = applyOnlineAction(state, 0, action, random);
        if (!next) return false;
        state = next;
        publish();
      } else {
        pending = { ...action, since: Date.now() };
        onStatus("sending");
        send({ type: "action", action: pending });
      }
      return true;
    },
  };
}
