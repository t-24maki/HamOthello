import { createConnectionGuard } from "../src/connection-guard.js?v=20261108-recovery1";
import { isCharacter, tableCharacters } from "../poker/characters.js?v=poker-dilemma-20261025";
import {
  createOnlineSession,
  generateRoomCode,
  normalizeRoomCode,
  isOnlineConfigured,
} from "../src/online-game.js?v=20261108-recovery1";
import {
  PROTOCOL,
  createRound,
  applyAction,
  playerView,
  validView,
  canSubmit,
} from "./rules.js?v=20261030-roulette7";
export { generateRoomCode, normalizeRoomCode, isOnlineConfigured };

export async function createRouletteMatch({
  signal,
  role,
  roomCode,
  character = role === "host" ? "tak" : "meg",
  onView = () => {},
  onStatus = () => {},
  onError = () => {},
  sessionFactory = createOnlineSession,
  random = Math.random,
  timers = globalThis,
  now = Date.now,
}) {
  const recovery = createConnectionGuard(now); now = recovery.now;
  if (!isCharacter(character)) throw new Error("キャラを選んでね。");
  let guestCharacter = null;
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
    void transport.send({ ...message, protocol: PROTOCOL }).catch(fail);
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
        (pending.type === "bet" && next.bets[player] !== null) ||
        (pending.type === "seen" && next.seen[player]) ||
        (["next", "rematch"].includes(pending.type) && next.proceed[player]))
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
      if (!state && guestCharacter)
        state = createRound(
          transport.clientId,
          1,
          random,
          null,
          tableCharacters(character, guestCharacter),
          2,
        );
      publish();
    } else send({ type: "sync", character });
  }
  function receive(message) {
    if (stopped || message?.protocol !== PROTOCOL) return;
    if (role === "host") {
      if (message.type === "sync" && isCharacter(message.character)) {
        if (!guestCharacter) guestCharacter = message.character;
        if (!state) announce();
        else send({ type: "view", view: playerView(state, 1) });
        return;
      }
      if (!state) return;
      if (message.type === "action") {
        const next = applyAction(state, 1, message.action, random);
        if (next) state = next;
        publish(); // A retry receives the committed view without settling twice.
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
      signal, role, roomCode,
      onConnectionChange(status, detail) {
        recovery.change(status, detail);
        if (status === "connected") announce();
        else if (status !== "waiting") onStatus("reconnecting");
      },
      hostPlayer: 1,
      ruleMode: "roulette",
      channelPrefix: "takumegu-mini-roulette",
      protocolVersion: PROTOCOL,
      supportedRules: ["roulette"],
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
  // Each round allows one bet, one animation acknowledgement, and one continuation vote per seat.
  interval = timers.setInterval(() => {
    transport?.check?.();
    if (recovery.paused) return;
    if (pending) {
      if (now() - pending.since > 15000) {
        fail(new Error("通信の返事が届かないみたい。へやをつくり直してね。"));
        return;
      }
      send({ type: "action", action: pending });
    } else if (role === "guest") send({ type: "sync", character });
  }, 1200);
  return {
    close,
    submit(type, bets) {
      if (recovery.paused) return false;
      if (stopped || !ready || !view || pending || !canSubmit(view, player, type, bets))
        return false;
      const action = { type, bets, matchId: view.matchId, roundId: view.roundId };
      if (role === "host") {
        const next = applyAction(state, 0, action, random);
        if (!next) return false;
        state = next;
        publish();
      } else {
        pending = { ...action, since: now() };
        onStatus("sending");
        send({ type: "action", action: pending });
      }
      return true;
    },
  };
}
