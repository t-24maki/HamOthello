import test from "node:test";
import assert from "node:assert/strict";
import {createOnlineSession} from "../src/online-game.js";
import {recoveryNetwork,quietNotice} from "./helpers/recovery-network.mjs";
async function pair(extra={}){
 const n=recoveryNetwork(), ends=[n.endpoint(),n.endpoint()], sessions=[], errors=[[],[]], ready=[[],[]], status=[[],[]], messages=[[],[]];
 for(let i=0;i<2;i++)sessions.push(await createOnlineSession({role:i?"guest":"host",roomCode:"HAMU-ABC234",hostPlayer:2,ruleMode:i?"classic":"cards",clientFactory:ends[i].factory,timers:n.timers,now:n.now,events:ends[i].events,noticeFactory:quietNotice,
 onError:e=>errors[i].push(e.message),onReady:v=>ready[i].push(v),onConnectionChange:v=>status[i].push(v),onMessage:m=>messages[i].push(m),...extra}));
 await n.tick(2000);
 return {...n,ends,sessions,errors,ready,status,messages,close:()=>Promise.all(sessions.map(s=>s.close()))};
}
test("presence negotiates rules/color, isolates channels, and only accepts the pinned opponent",async()=>{
 const p=await pair();assert.deepEqual(p.ready[1],[{localPlayer:1,remotePlayer:2,ruleMode:"cards"}]);
 assert.equal(p.ends[0].channels[0].name,"punitto-othello:HAMU-ABC234");
 await p.sessions[0].send({type:"state"});await p.turns();assert.equal(p.messages[1].at(-1).senderId,p.sessions[0].clientId);
 p.ends[1].channels[0].handlers.get("broadcast:game-event")({payload:{senderId:"stranger",type:"state"}});
 assert.equal(p.messages[1].length,1);await p.close();assert.equal(p.jobs.size,0);
});
test("channel errors and missing presence pause, retry and retain identities without notifying a departure",async()=>{
 const p=await pair(),id=p.sessions[1].clientId;p.ends[1].down();await p.tick(9000);
 assert.deepEqual(p.errors,[[],[]]);assert.equal(p.status[0].at(-1),"reconnecting");assert.equal(p.status[1].at(-1),"reconnecting");
 p.ends[1].upAgain();await p.tick(15000);
 assert.equal(p.sessions[1].clientId,id);assert.ok(p.sessions.every(s=>s.connected));assert.deepEqual(p.ready.map(a=>a.length),[1,1]);
 await p.sessions[1].send({type:"continued"});await p.turns();assert.equal(p.messages[0].at(-1).type,"continued");await p.close();
});
test("silent and one-way loss is detected by round-trip heartbeats and recovers",async()=>{
 const p=await pair();p.ends[0].silent=true;await p.tick(7000);assert.ok(p.status.every(s=>s.at(-1)==="reconnecting"));
 p.ends[0].silent=false;await p.tick(12000);assert.ok(p.sessions.every(s=>s.connected));assert.deepEqual(p.errors,[[],[]]);await p.close();
});
test("initial subscription and track failures retry within the same room",async()=>{
 const n=recoveryNetwork(),e=n.endpoint();e.failJoins=2;e.failTracks=1;const changes=[];
 const promise=createOnlineSession({role:"host",roomCode:"HAMU-ABC234",hostPlayer:1,clientFactory:e.factory,timers:n.timers,now:n.now,events:e.events,noticeFactory:quietNotice,onConnectionChange:s=>changes.push(s)});
 await n.tick(25000);const s=await promise;assert.equal(changes.at(-1),"waiting");assert.ok(e.channels.length>=4);assert.ok(e.channels.every(c=>c.name.endsWith("HAMU-ABC234")));await s.close();assert.equal(n.jobs.size,0);
});
test("60 seconds of failed recovery ends once and removes channels/timers",async()=>{
 const p=await pair();p.ends[1].down();await p.tick(65000);assert.deepEqual(p.errors.map(a=>a.length),[1,1]);assert.match(p.errors[0][0],/60秒/);assert.equal(p.jobs.size,0);
 p.ends[1].upAgain();await p.tick(10000);assert.deepEqual(p.errors.map(a=>a.length),[1,1]);await p.close();
});
test("explicit leave ends promptly and a new guest cannot replace a disconnected opponent",async()=>{
 const p=await pair();p.ends[1].down();await p.tick(1000);
 const third=p.endpoint(),errors=[];
 const s=await createOnlineSession({role:"guest",roomCode:"HAMU-ABC234",hostPlayer:1,clientFactory:third.factory,timers:p.timers,now:p.now,events:third.events,noticeFactory:quietNotice,onError:e=>errors.push(e.message)});
 await p.tick(2500);assert.equal(errors.length,1);assert.match(errors[0],/2人/);assert.equal(p.ready[0].length,1);
 p.ends[1].upAgain();await p.tick(12000);await p.sessions[1].close();await p.turns();assert.match(p.errors[0][0],/部屋を出/);await s.close();await p.close();
});
test("old protocol is rejected rather than mixing reconnect support",async()=>{
 const n=recoveryNetwork(),e=n.endpoint();const c=e.factory().channel("punitto-othello:HAMU-ABC234");await c.track({clientId:"old",role:"host",player:1,joinedAt:0,version:"old",ruleMode:"classic"});const errors=[];
 const guest=n.endpoint();const s=await createOnlineSession({role:"guest",roomCode:"HAMU-ABC234",hostPlayer:1,clientFactory:guest.factory,timers:n.timers,now:n.now,events:guest.events,noticeFactory:quietNotice,onError:e=>errors.push(e.message)});
 await n.turns();assert.match(errors[0],/読み込み直して/);await s.close();assert.equal(n.jobs.size,0);
});
test("aborting an in-flight connection prevents late subscribe/track from reviving it",async()=>{
 const n=recoveryNetwork(),e=n.endpoint(),abort=new AbortController();e.failJoins=10;
 const promise=createOnlineSession({role:"host",roomCode:"HAMU-ABC234",hostPlayer:1,clientFactory:e.factory,timers:n.timers,now:n.now,events:e.events,noticeFactory:quietNotice,signal:abort.signal});
 const rejected=assert.rejects(promise,/終了/);await n.tick(500);abort.abort();await rejected;const count=e.channels.length;
 await n.tick(20000);assert.equal(e.channels.length,count);assert.equal(n.jobs.size,0);
});

test("a late send failure from a retired socket cannot interrupt the restored connection",async()=>{
 const p=await pair(),channel=p.ends[0].channels.at(-1),send=channel.send;let complete;
 channel.send=m=>m.event==="game-event"?new Promise(r=>{complete=r;}):send(m);
 const late=p.sessions[0].send({type:"late"});p.ends[0].down();await p.tick(9000);p.ends[0].upAgain();await p.tick(13000);
 assert.ok(p.sessions.every(s=>s.connected));complete("timed out");await late;await p.turns();
 assert.ok(p.sessions.every(s=>s.connected));assert.deepEqual(p.errors,[[],[]]);await p.close();
});
test("a guest keeps retrying presence lookup and joins a host that arrives later",async()=>{
 const n=recoveryNetwork(),guest=n.endpoint(),host=n.endpoint(),ready=[];
 const common={roomCode:"HAMU-ABC234",hostPlayer:1,timers:n.timers,now:n.now,noticeFactory:quietNotice,onReady:()=>ready.push(true)};
 const g=await createOnlineSession({...common,role:"guest",clientFactory:guest.factory,events:guest.events});await n.tick(17000);
 assert.ok(guest.channels.length>1);const h=await createOnlineSession({...common,role:"host",clientFactory:host.factory,events:host.events});await n.tick(6000);
 assert.equal(ready.length,2);await g.close();await h.close();assert.equal(n.jobs.size,0);
});
