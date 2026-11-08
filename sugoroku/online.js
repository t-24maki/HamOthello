import { createConnectionGuard } from "../src/connection-guard.js?v=20261108-recovery1";
import { createOnlineSession, generateRoomCode, normalizeRoomCode } from "../src/online-game.js?v=20261108-recovery1";
import { createGame, activeSeat, act, applyRoll, applyMove, applyChallenge, validMove, cpuAction, GOAL } from "./rules.js?v=20261107-roundgraph1";
export { generateRoomCode, normalizeRoomCode };
export const PROTOCOL = "sugoroku-challenge-20261107-1";
const seatNumber = n => Number.isInteger(n) && n >= 0 && n < 4;
// Every move advances at least one square, including automatic doubles.
const maxEvents = GOAL * 4 * 4; // roll, move, optional challenge, next turn
function initial([host,guest,first]) {
  const s = createGame({humans:2,firstCharacter:host,first});
  const second = guest === host ? (host+1)%4 : guest;
  const order = [host,second,...[0,1,2,3].filter(i=>i!==host && i!==second)];
  s.players.forEach((p,i)=>{p.character=order[i];});
  return s;
}
// Only compact choices and actual dice cross the wire. Positions, balances,
// log text and rankings are derived locally by the same rules on both devices.
function replayOne(s, token) {
  if(s.phase === "finished")return s;
  if(s.phase === "roll")return applyRoll(s,token);
  if(s.phase === "choose" || s.phase === "double")return applyMove(s,token);
  if(s.phase === "challenge")return applyChallenge(s,token);
  return token===null?act(s,{seat:activeSeat(s),type:s.phase}):s;
}

const same = (a,b) => a===b || (Array.isArray(a)&&Array.isArray(b)&&b.length===2&&a[0]===b[0]&&a[1]===b[1]);
function legalInput(s,seat,a) {
  if(!s || !a || a.seat!==seat || s.phase==="finished" || activeSeat(s)!==seat || a.type!==s.phase)return false;
  if(s.phase==="roll" || s.phase==="settled" || s.phase==="double" || s.phase==="challenge")return a.value==null;
  return validMove(s,a.value);
}

export async function createSugorokuMatch({
  signal, role, roomCode, character, onView=()=>{}, onStatus=()=>{}, onError=()=>{},
  sessionFactory=createOnlineSession, random=Math.random, timers=globalThis, now=Date.now,
}) {
  const recovery = createConnectionGuard(now); now = recovery.now;
  if(!["host","guest"].includes(role) || !seatNumber(character))throw new Error("部屋の設定を確認してね。");
  const host=role==="host", seat=host?0:1;
  let transport, interval, closed=false, ready=false, peer, room="", year=0, setup=null;
  let state=null, events=[], votes=[false,false], pending=null, sentAt=0, lastContact=0, failure=null;
  function close() {
    if(closed)return;
    closed=true;pending=null;
    if(interval!=null)timers.clearInterval(interval);
    void transport?.close();
  }
  function fail(e) {
    if(closed)return;
    failure=e instanceof Error?e:new Error(String(e));
    close();onError(failure);
  }
  function send(packet) {
    if(!closed && ready && transport)void transport.send({...packet,protocol:PROTOCOL}).catch(fail);
  }
  const view=()=>onView(state,{seat,year,revision:events.length,votes:[...votes]});
  const broadcast=()=>send({type:"view",room,year,setup,events,votes});
  function publish(){view();broadcast();}
  function newYear(first) {
    year++;setup=[...setup.slice(0,2),first];state=initial(setup);events=[];votes=[false,false];publish();
  }
  function commit(actor,action) {
    if(!legalInput(state,actor,action))return false;
    const next=act(state,action,random);
    if(next===state)return false;
    const token=state.phase==="roll"?next.dice:state.phase==="settled"?null:state.phase==="challenge"?next.lastMove.challengeDie:next.lastMove.die;
    state=next;events=[...events,token];publish();return true;
  }

  function vote(actor) {
    if(state?.phase!=="finished" || votes[actor])return false;
    votes=[...votes];votes[actor]=true;
    if(votes.every(Boolean))newYear((setup[2]+1)%4);else publish();
    return true;
  }
  function acceptView(m) {
    if(typeof m.room!=="string" || !m.room || m.room.length>100 || (room && m.room!==room) ||
      !Number.isSafeInteger(m.year) || m.year<1 || m.year<year || m.year>year+1 ||
      !Array.isArray(m.setup) || m.setup.length!==3 || !m.setup.every(seatNumber) || m.setup[1]!==character ||
      !Array.isArray(m.events) || m.events.length>maxEvents ||
      !Array.isArray(m.votes) || m.votes.length!==2 || !m.votes.every(v=>typeof v==="boolean"))return;
    const continuation=m.year===year;
    if(continuation && (!m.setup.every((v,i)=>v===setup[i]) || m.events.length<events.length ||
        !events.every((e,i)=>same(e,m.events[i])) || votes.some((v,i)=>v&&!m.votes[i])))return;
    if(!continuation && year && (state.phase!=="finished" || (!votes[seat] && pending?.type!=="rematch") ||
       m.setup[0]!==setup[0] || m.setup[2]!==((setup[2]+1)%4)))return;
    if(continuation && m.events.length===events.length && votes.every((v,i)=>v===m.votes[i])){view();return;}
    let n=continuation?state:initial(m.setup);
    for(let i=continuation?events.length:0;i<m.events.length;i++){
      const next=replayOne(n,m.events[i]);if(next===n)return;n=next;
    }
    if(m.votes.some(Boolean)&&n.phase!=="finished")return;
    room=m.room;year=m.year;setup=m.setup;state=n;events=m.events;votes=m.votes;
    if(pending && (pending.year!==year || (pending.type==="rematch"?votes[1]:pending.revision<events.length))){
      pending=null;onStatus("connected");
    }
    view();
  }
  function receive(m) {
    if(closed || !ready || m?.protocol!==PROTOCOL)return;
    if(host) {
      if(m.type==="sync" && seatNumber(m.character)){
        lastContact=now();
        if(!state){
          if(!transport)return;
          room=transport.clientId;setup=[character,m.character];newYear(Math.floor(random()*4));
        }else if(m.force || m.year!==year || m.revision!==events.length || m.votes!==votes.join(","))broadcast();
        else send({type:"pong",room});
        return;
      }
      if(!state || m.room!==room || !["action","rematch"].includes(m.type))return;
      lastContact=now();
      if(m.year===year && m.revision===events.length &&
         (m.type==="rematch"?vote(1):(state.phase!=="double"&&commit(1,m.action))))return;
      broadcast(); // stale/repeated request: repair lost reply, never apply it twice
    }else if(m.type==="view"){acceptView(m);lastContact=now();}
    else if(m.type==="pong" && m.room===room)lastContact=now();
  }
  function sync(force=false){
    if(!host)send({type:"sync",force,character,year,revision:events.length,votes:votes.join(",")});
  }
  try {
    transport=await sessionFactory({
      signal,role,roomCode,hostPlayer:1,
      onConnectionChange(status, detail){
        recovery.change(status, detail);
        onStatus(status === "connected" ? (pending ? "sending" : "connected") : "reconnecting");
        if(status === "connected"){if(host && state){view();broadcast();}else sync(true);}
      },ruleMode:"sugoroku",supportedRules:["sugoroku"],
      channelPrefix:"takumegu-sugoroku",protocolVersion:PROTOCOL,
      onReady(){ready=true;lastContact=now();sync();},onMessage:receive,
      onPeerChange(connected,info={}){
        if(peer && (!connected || info.peerId!==peer))fail(new Error("相手が部屋を出たか、通信が切れました。新しい部屋でつなぎ直してね。"));
        if(connected)peer=info.peerId;
      },onError:fail,
    });
  }catch(e){close();throw e;}
  if(closed){await transport.close();throw failure??new Error("部屋を閉じました。");}
  sync();
  interval=timers.setInterval(()=>{
    transport?.check?.();
    if(recovery.paused || !ready || closed)return;
    if(now()-lastContact>45000){fail(new Error("相手の返事がありません。部屋をつくり直してね。"));return;}
    if(pending && now()-sentAt>15000){fail(new Error("操作の返事が届きません。部屋をつくり直してね。"));return;}
    if(pending)send(pending);else sync();
  },1200);
  function request(type,action){
    if(recovery.paused || closed || !state || pending || (type==="action"&&state.phase==="double"))return false;
    if(type==="rematch"?state.phase!=="finished" || votes[seat]:!legalInput(state,seat,action))return false;
    if(host)return type==="rematch"?vote(0):commit(0,action);
    sentAt=now();pending={type,action,room,year,revision:events.length};onStatus("sending");send(pending);return true;
  }
  return {close,submit:action=>request("action",action),rematch:()=>request("rematch"),
    automatic(){
      if(recovery.paused||!host||closed||!state||!(state.phase==="double"||(state.phase==="settled"&&state.players[activeSeat(state)].finish!==null)))return false;
      return commit(activeSeat(state),{seat:activeSeat(state),type:state.phase});
    },
    cpu(){
      if(recovery.paused || !host || closed || !state || state.phase==="finished" || activeSeat(state)<2)return false;
      return commit(activeSeat(state),cpuAction(state,random));
    }};
}
