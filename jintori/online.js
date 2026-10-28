import {
  createOnlineSession,
  generateRoomCode,
  normalizeRoomCode,
} from "../src/online-game.js?v=poker-rooms-20260908";
import { createPeer } from "./online-peer.js?v=20261027-jintori7";
import { PROTOCOL, SEND_MS } from "./protocol.js?v=20261026-jintori6";
export { generateRoomCode, normalizeRoomCode };
export async function createOnline({
  role,
  roomCode,
  character,
  onChange,
  onError,
  sessionFactory = createOnlineSession,
  timers = globalThis,
  now = () => performance.now(),
}) {
  let transport,
    peer,
    interval,
    ready = false,
    stopped = false,
    seen = false,
    failure;
  const early = [];
  function close() {
    if (stopped) return;
    peer?.close();
    stopped = true;
    if (interval !== undefined) timers.clearInterval(interval);
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
  try {
    transport = await sessionFactory({
      role,
      roomCode,
      hostPlayer: 1,
      ruleMode: "jintori",
      supportedRules: ["jintori"],
      channelPrefix: "takumegu-jintori",
      protocolVersion: PROTOCOL,
      onReady() {
        ready = true;
        peer?.connect();
      },
      onMessage(m) {
        if (peer) peer.receive(m);
        else if (early.length < 8) early.push(m);
      },
      onPeerChange(connected, info = {}) {
        if (seen && (!connected || (info.previousPeerId && info.previousPeerId !== info.peerId)))
          fail(new Error("相手との通信が切れたよ。新しいへやでつなぎ直してね。"));
        if (connected) seen = true;
      },
      onError: fail,
    });
    if (stopped) {
      await transport.close();
      throw failure || new Error("接続を終了しました。");
    }
    peer = createPeer({
      role,
      character,
      matchId: role === "host" ? transport.clientId : null,
      now,
      send(m) {
        void transport.send(m).catch(fail);
      },
      onChange,
      onError(error) {
        failure = error;
        close();
        onError?.(error);
      },
    });
    if (ready) peer.connect();
    for (const m of early) peer.receive(m);
    if (stopped) throw failure;
    interval = timers.setInterval(() => peer.flush(), SEND_MS);
    return {
      close,
      request: (type) => peer.request(type),
      update: (...args) => peer.update(...args),
      info: () => peer.info(),
      renderGame: (dt) => peer.renderGame(dt),
    };
  } catch (error) {
    close();
    throw error;
  }
}
