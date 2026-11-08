import { createConnectionNotice } from "./connection-notice.js?v=20261108-recovery1";
export const CONNECTION_GRACE_MS = 60000;
const RETRIES = [1000, 2000, 5000, 10000];
const WIRE = "takumegu-recovery-1";

// One identity survives channel/socket replacement. Presence absence is not a
// departure: only an explicit leave or an exhausted grace period ends a match.
export async function createRecoverableSession({
  role, roomCode, hostPlayer, ruleMode, channelPrefix, protocolVersion,
  supportedRules, loadClient, url, key, signal,
  onReady = () => {}, onMessage = () => {}, onPeerChange = () => {},
  onConnectionChange = () => {}, onError = () => {},
  timers = globalThis, now = Date.now, events = globalThis.window,
  noticeFactory = createConnectionNotice,
}) {
  const clientId = globalThis.crypto?.randomUUID?.() ?? `client-${now()}-${Math.random()}`;
  const joinedAt = now();
  let client, createClient, channel, generation = 0, closed = false, tracked = false;
  let peerId = null, peer = null, ready = false, linked = false, phase = "connecting";
  let failureAt = now(), lastProof = now(), lastPing = -Infinity, lastTrack = -Infinity;
  let attempt = 0, retryAt = now(), attemptAt = 0, subscribedAt = 0, working = false, started = false;
  let nonce = 0, proofs = new Map(), timer, resolveStart, rejectStart;
  const startedPromise = new Promise((resolve, reject) => { resolveStart = resolve; rejectStart = reject; });
  const notice = noticeFactory(() => fail(new Error("接続をやめました。設定からつなぎ直せます。")));
  const presence = () => ({clientId, role, player: role === "host" ? hostPlayer : null,
    ruleMode, version: protocolVersion, recovery: WIRE, joinedAt, peerId});
  const valid = p => p && p.version === protocolVersion && p.recovery === WIRE && supportedRules.includes(p.ruleMode);
  function report(next) {
    if (closed) return;
    phase = next; onConnectionChange(next, {idleMs: ready ? Math.max(0, now()-lastProof-4000) : 0});
    if (next === "connected" || next === "waiting") notice.hide();
    else notice.show(next === "reconnecting"
      ? "通信を確認しています…\nこの画面のまま待ってね。つながると続きから再開するよ。（最大60秒）"
      : "部屋につないでいます…\nつながらないときは自動で再試行するよ。（最大60秒）");
  }
  function cleanup() {
    timers.clearInterval(timer);
    events?.removeEventListener?.("online", wake);
    events?.removeEventListener?.("offline", offline);
    globalThis.document?.removeEventListener("visibilitychange", visible);
    signal?.removeEventListener("abort", aborted);
    notice.dispose();
  }
  async function close(explicit = true) {
    if (closed) return;
    if (explicit && peerId && tracked) void control("leave");
    closed = true; generation++; cleanup();
    if (!started) rejectStart(new Error("接続を終了しました。"));
    const old = channel; channel = null; tracked = false;
    if (old && client) await client.removeChannel(old).catch(() => {});
    client?.realtime?.disconnect();
  }
  function fail(error) {
    if (closed) return;
    if (!started) { started = true; rejectStart(error); }
    void close(false); onError(error);
  }
  function lost() {
    if (closed) return;
    if (failureAt === null) failureAt = now() - (ready ? Math.max(0, now()-lastProof-4000) : 0);
    linked = false;
    if (phase !== (ready ? "reconnecting" : "connecting")) report(ready ? "reconnecting" : "connecting");
  }
  function retry() {
    if (closed) return;
    lost(); tracked = false;
    generation++; working = false;
    retryAt = now() + RETRIES[Math.min(attempt++, RETRIES.length - 1)];
    const old = channel, retired = client; channel = null; client = null; proofs.clear();
    // Supabase may reuse a channel by topic until unsubscribe finishes. A fresh
    // SDK instance isolates late close/send callbacks from the replacement.
    if (retired) {
      void Promise.resolve(retired.realtime?.disconnect()).catch(() => {});
      if (old) void retired.removeChannel(old).catch(() => {});
    }
  }
  async function control(kind, extra = {}, targetId = peerId) {
    if (closed || !channel || !tracked || !targetId) return false;
    try {
      return await channel.send({type:"broadcast",event:"connection-control",payload:{
        kind, wire:WIRE, senderId:clientId, targetId, ...extra,
      }}) === "ok";
    } catch { return false; }
  }
  function ping() {
    if (!peerId || !tracked) return;
    lastPing = now(); const id = ++nonce; proofs.set(id, now());
    for (const [n,t] of proofs) if (now()-t > 10000) proofs.delete(n);
    void control("ping", {nonce:id});
  }
  function confirm() {
    lastProof = now(); failureAt = null; attempt = 0;
    if (linked) return;
    linked = true;
    if (!ready) {
      ready = true;
      onPeerChange(true, {peerId, previousPeerId:null});
      const player = role === "host" ? hostPlayer : 3-peer.player;
      onReady({localPlayer:player,remotePlayer:3-player,ruleMode:peer.ruleMode});
    }
    report("connected");
  }
  function syncPresence() {
    if (closed || !tracked || !channel) return;
    const people = [...new Map(Object.values(channel.presenceState()).flat()
      .filter(p=>p && typeof p.clientId === "string").map(p=>[p.clientId,p])).values()]
      .sort((a,b)=>a.joinedAt-b.joinedAt || a.clientId.localeCompare(b.clientId));
    const sameRole = people.filter(p=>p.role===role);
    if (!peerId && sameRole.some(p=>p.clientId!==clientId && (p.joinedAt<joinedAt || (p.joinedAt===joinedAt && p.clientId<clientId)))) {
      fail(new Error(role==="host"?"同じキーワードの部屋があります。作り直してね。":"この部屋は、もう2人で遊んでいるみたい。")); return;
    }
    const others = people.filter(p=>p.role===(role==="host"?"guest":"host"));
    if (peerId) {
      if (!others.some(p=>p.clientId===peerId) && now()-subscribedAt>2000) lost();
      for (const p of others) if (p.clientId!==peerId) void control("occupied", {}, p.clientId);
    } else if (others.length) {
      const p=others[0];
      if (!valid(p)) { fail(new Error("ゲームの版がちがうみたい。ふたりともページを読み込み直してね。")); return; }
      if (p.peerId && p.peerId !== clientId) { fail(new Error("この部屋は、もう2人で遊んでいるみたい。")); return; }
      if (role==="guest" && ![1,2].includes(p.player)) { fail(new Error("部屋の設定を確認できませんでした。")); return; }
      peerId=p.clientId; peer=p; failureAt=now(); lastProof=now(); ping();
    }
  }
  function receiveControl(m) {
    if (closed || !tracked || m?.wire!==WIRE || m.targetId!==clientId) return;
    if (m.kind==="occupied" && m.senderId===peerId) { fail(new Error("この部屋は、もう2人で遊んでいるみたい。")); return; }
    if (m.senderId!==peerId) return;
    if (m.kind==="leave") { fail(new Error("相手が部屋を出ました。新しい部屋でつなぎ直してね。")); return; }
    if (m.kind==="ping" && Number.isSafeInteger(m.nonce)) void control("pong", {nonce:m.nonce});
    if (m.kind==="pong" && proofs.has(m.nonce)) { proofs.delete(m.nonce); confirm(); }
  }
  async function connect() {
    if (closed || working) return;
    working=true; attemptAt=now(); const gen=++generation;
    const current = () => !closed && gen===generation;
    try {
      if (!createClient) createClient=await loadClient(attempt);
      if (!current()) return;
      client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:`takumegu-${clientId}-${gen}`},
        realtime:{worker:true}});
      const ch=client.channel(`${channelPrefix}:${roomCode}`,{config:{private:false,broadcast:{ack:true,self:false},presence:{key:clientId}}});
      channel=ch;
      ch.on("presence",{event:"sync"},()=>{if(current())syncPresence();})
        .on("broadcast",{event:"connection-control"},({payload})=>{if(current())receiveControl(payload);})
        .on("broadcast",{event:"game-event"},({payload})=>{
          if(current() && tracked && ready && payload?.senderId===peerId){pump();if(!closed)onMessage(payload);}
        });
      ch.subscribe(async status=>{
        if (!current()) return;
        if (status==="SUBSCRIBED") {
          // Re-track on every successful SDK rejoin. Bound presence traffic.
          if (now()-lastTrack < 6000) { retry(); return; }
          lastTrack=now();
          try {
            const result=await ch.track(presence());
            if (!current()) return;
            if (result!=="ok") { retry(); return; }
            tracked=true; working=false; subscribedAt=now();
            if (!started) { started=true; resolveStart(session); }
            if (!ready && role==="host" && !peerId) { failureAt=null; report("waiting"); }
            syncPresence(); ping();
          } catch { if(current())retry(); }
        } else if (["TIMED_OUT","CHANNEL_ERROR","CLOSED"].includes(status)) retry();
      });
    } catch { if(current())retry(); }
  }
  function pump() {
    if (closed) return;
    if (failureAt!==null && now()-failureAt >= CONNECTION_GRACE_MS) {
      fail(new Error(ready?"60秒待ちましたが通信が戻りませんでした。新しい部屋でつなぎ直してね。":"部屋につながりませんでした。キーワードと回線を確認してね。")); return;
    }
    if (ready && linked && now()-lastProof > 4000) lost();
    if (working && now()-attemptAt >= 12000) retry();
    if (!working && !tracked && now()>=retryAt && globalThis.navigator?.onLine!==false) void connect();
    if (!ready && role === "guest" && tracked && !peerId && now()-subscribedAt>=12000) retry();
    if (tracked && peerId && now()-lastPing>=2000) ping();
    // A silent/stale socket must also be replaced; presence alone is not proof.
    if (ready && !linked && tracked && now()-Math.max(lastProof,subscribedAt)>10000) retry();
  }
  function wake() { if(closed)return; if(!tracked){retryAt=now();pump();}else ping(); }
  function offline() { retry(); }
  function visible() { if(!globalThis.document?.hidden){pump();wake();} }
  function aborted() { fail(new Error("接続を終了しました。")); }
  const session = {clientId,role,roomCode,check:pump,
    get connected(){return linked && !closed;},
    async send(message) {
      if (closed || !tracked || !peerId) return false;
      const sendingChannel=channel, gen=generation;
      try {
        const result=await sendingChannel.send({type:"broadcast",event:"game-event",payload:{...message,senderId:clientId,senderRole:role}});
        if (result!=="ok" && gen===generation) lost();
        return result==="ok";
      } catch { if(gen===generation)lost();return false; }
    },close,
  };
  if(signal?.aborted){started=true;rejectStart(new Error("接続を終了しました。"));closed=true;return startedPromise;}
  events?.addEventListener?.("online",wake); events?.addEventListener?.("offline",offline);
  globalThis.document?.addEventListener("visibilitychange",visible);
  signal?.addEventListener("abort",aborted,{once:true});
  report("connecting"); timer=timers.setInterval(pump,500); void connect();
  return startedPromise;
}
