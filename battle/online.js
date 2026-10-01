import {
  createOnlineSession,
  generateRoomCode,
  normalizeRoomCode,
} from "../src/online-game.js?v=poker-rooms-20260908";
import { createBattlePeer } from "./online-peer.js";
import { PROTOCOL, SEND_MS } from "./online-protocol.js";
export { generateRoomCode, normalizeRoomCode };
export async function createBattleOnline({
  role,
  roomCode,
  character,
  stageId,
  onChange,
  onError,
  sessionFactory = createOnlineSession,
  timers = globalThis,
  now = () => performance.now(),
}) {
  let transport = null,
    peer = null,
    ready = false,
    stopped = false,
    interval = null,
    failure = null,
    seen = false;
  const early = [];
  function close() {
    if (stopped) return;
    peer?.close();
    stopped = true;
    if (interval !== null) timers.clearInterval(interval);
    void transport?.close().catch(() => {});
  }
  function fail(error) {
    if (stopped) return;
    failure = error instanceof Error ? error : new Error(String(error));
    if (peer) peer.fail(failure.message);
    else {
      close();
      onError?.(failure);
    }
  }
  function begin() {
    if (ready && peer && !stopped) peer.connect();
  }
  try {
    transport = await sessionFactory({
      role,
      roomCode,
      hostPlayer: 1,
      ruleMode: "battle",
      supportedRules: ["battle"],
      channelPrefix: "takumegu-battle",
      protocolVersion: PROTOCOL,
      onReady() {
        ready = true;
        begin();
      },
      onMessage(m) {
        if (peer) peer.receive(m);
        else if (early.length < 8) early.push(m);
      },
      onPeerChange(connected, info = {}) {
        if (seen && (!connected || (info.previousPeerId && info.previousPeerId !== info.peerId)))
          fail(new Error("相手との通信が切れたよ。へやを出て、つなぎ直してね。"));
        if (connected) seen = true;
      },
      onError: fail,
    });
    if (stopped) {
      await transport.close();
      throw failure || new Error("接続を終了しました。");
    }
    peer = createBattlePeer({
      role,
      matchId: role === "host" ? transport.clientId : null,
      character,
      stageId,
      now,
      send(message) {
        void transport.send(message).catch(fail);
      },
      onChange,
      onError(error) {
        failure = error;
        close();
        onError?.(error);
      },
    });
    begin();
    for (const m of early) peer.receive(m);
    if (stopped) throw failure || new Error("接続を終了しました。");
    interval = timers.setInterval(() => peer.flush(), SEND_MS);
    return {
      close,
      update: (...args) => peer.update(...args),
      request: (type) => peer.request(type),
      renderGame: (dt) => peer.renderGame(dt),
      info: () => peer.info(),
    };
  } catch (error) {
    close();
    throw error;
  }
}
