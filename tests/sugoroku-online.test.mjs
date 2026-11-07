import test from "node:test";
import assert from "node:assert/strict";
import { createSugorokuMatch, PROTOCOL } from "../sugoroku/online.js";
import { activeSeat, cpuAction, rankPlayers, GOAL } from "../sugoroku/rules.js";

async function pair(chars=[0,3], random) {
  let draw=0;random??=()=>[.3,.2,.8,.7,.1][draw++%5];
  const ends=[], intervals=new Set(), packets=[], views=[[],[]], errors=[[],[]], statuses=[[],[]];
  let lost=null,time=10;
  function deliver(i,p){ends[1-i]?.onMessage(structuredClone(p));}
  async function factory(opts) {
    const i=ends.push(opts)-1;
    if(i===1)queueMicrotask(()=>ends.forEach((ep,n)=>{
      ep.onPeerChange(true,{peerId:"client"+(1-n)});ep.onReady();
    }));
    return {clientId:"client"+i,close:async()=>{},async send(p) {
      packets.push([i,structuredClone(p)]);
      if(lost===p.type){lost=null;return false;}
      deliver(i,p);return true;
    }};
  }
  const timers={setInterval(fn){intervals.add(fn);return fn;},clearInterval(fn){intervals.delete(fn);}};
  const handles=[];
  for(const i of [0,1]){
    handles.push(await createSugorokuMatch({
      role:i?"guest":"host",roomCode:"HAMU-ABC234",character:chars[i],random,
      timers,now:()=>time,sessionFactory:factory,onError:e=>errors[i].push(e.message),onStatus:s=>statuses[i].push(s),
      onView:(s,m)=>views[i].push({s,m})
    }));
  }
  const latest=(i=0)=>views[i].at(-1);
  return {ends,packets,views,errors,statuses,handles,latest,deliver,intervals,
    drop:type=>{lost=type;}, tick(ms=1200){time+=ms;[...intervals].forEach(f=>f());},
    close:()=>handles.forEach(h=>h.close())};
}
const pick=(p,type,value,seat=1)=>p.handles[seat].submit({seat,type,value});
const lastPacket=(p,type)=>p.packets.findLast(([,m])=>m.type===type)[1];

test("a sugoroku-only room has two humans, two unique CPUs and a consistent fallback for duplicate choices",async()=>{
  for(const chars of [[0,3],[2,2]]){
    const p=await pair(chars),{s}=p.latest();assert.deepEqual(s,p.latest(1).s);
    assert.equal(s.players[0].character,chars[0]);assert.equal(s.players[1].character,chars[0]===chars[1]?3:chars[1]);
    assert.deepEqual(s.players.map(v=>v.human),[true,true,false,false]);assert.equal(new Set(s.players.map(v=>v.character)).size,4);
    assert.equal(p.ends[0].channelPrefix,"takumegu-sugoroku");assert.deepEqual(p.ends[0].supportedRules,["sugoroku"]);p.close();
  }
});
test("guest cannot pick for host/CPUs, substitute dice, choose an unrolled distance or send another seat",async()=>{
  const p=await pair();assert.equal(activeSeat(p.latest().s),1);
  assert.equal(pick(p,"roll",undefined,0),false);assert.equal(p.handles[0].cpu(),false);assert.equal(p.handles[1].cpu(),false);
  assert.equal(pick(p,"roll",[6,6]),false);assert.equal(pick(p,"roll"),true);
  const s=p.latest().s;assert.deepEqual(s.dice,p.latest(1).s.dice);assert.equal(pick(p,"choose",6),false);
  p.deliver(1,{...lastPacket(p,"action"),revision:2,action:{seat:0,type:"choose",value:s.dice[0]}});
  assert.deepEqual(p.latest().s,s);p.close();
});
test("lost request and lost receipt recover without rerolling, moving, or finishing twice",async()=>{
  const p=await pair();p.drop("action");pick(p,"roll");assert.equal(p.latest().s.phase,"roll");
  assert.equal(pick(p,"roll"),false);p.tick();assert.deepEqual(p.latest(1).s.dice,p.latest().s.dice);
  p.drop("view");pick(p,"choose",p.latest().s.dice[0]);assert.equal(p.latest().s.phase,"settled");assert.equal(p.latest(1).s.phase,"choose");
  p.tick();assert.deepEqual(p.latest().s,p.latest(1).s);
  const m=lastPacket(p,"action"),{s}=p.latest();p.deliver(1,m);p.deliver(1,m);
  assert.equal(s.log.length,1);assert.deepEqual(p.latest().s,s);assert.deepEqual(p.latest(1).s,s);p.close();
});
test("dropping a host update is repaired by periodic guest sync",async()=>{
  const p=await pair();let s=p.latest().s;
  while(activeSeat(s)!==0){const i=activeSeat(s);s.phase==="double"?p.handles[0].automatic():i<2?p.handles[i].submit(cpuAction(s,()=>.3)):p.handles[0].cpu();s=p.latest().s;}
  p.drop("view");pick(p,"roll",undefined,0);assert.notDeepEqual(p.latest().s,p.latest(1).s);
  p.tick();assert.deepEqual(p.latest().s,p.latest(1).s);p.close();
});
test("malformed, rewritten, stale, or wrong-version histories cannot install a view",async()=>{
  const p=await pair(),start=lastPacket(p,"view");pick(p,"roll");
  const current=lastPacket(p,"view"),seen=p.views[1].length;
  for(const m of [start,{...current,protocol:"other"},{...current,room:"other"},
    {...current,events:[[6,5],5]}, {...current,events:[...current.events,9]},
    {...current,year:2},{...current,events:Array(GOAL*4*4+1).fill(null)},
    {...current,votes:[false,true]},{...current,setup:[1,2,0]}])p.deliver(0,m);
  assert.equal(p.views[1].length,seen);assert.deepEqual(p.latest().s,p.latest(1).s);p.close();
});
test("all four finishes, seed rewards, chance outcomes and seed rankings agree; replay needs both votes and rejects old-year commands",async()=>{
  const p=await pair();let moves=0;
  while(p.latest().s.phase!=="finished"){
    const s=p.latest().s,i=activeSeat(s);
    assert.ok(s.phase==="double"?p.handles[0].automatic():i<2?p.handles[i].submit(cpuAction(s,()=>.3)):p.handles[0].cpu());
    assert.deepEqual(p.latest().s,p.latest(1).s);assert.ok(++moves<=GOAL*4*4);
  }
  assert.equal(p.latest().s.players.filter(q=>q.distance===GOAL).length,4);assert.deepEqual(rankPlayers(p.latest().s),rankPlayers(p.latest(1).s));
  const stale=lastPacket(p,"action"),oldFirst=p.latest().s.first,oldView=lastPacket(p,"view");
  assert.ok(p.handles[0].rematch());assert.equal(p.latest(1).s.phase,"finished");assert.equal(p.handles[0].rematch(),false);
  p.drop("view");assert.ok(p.handles[1].rematch());p.tick();
  assert.equal(p.latest(1).m.year,2);assert.equal(p.latest().s.first,(oldFirst+1)%4);assert.deepEqual(p.latest().s.log,[]);
  p.deliver(1,stale);p.deliver(0,oldView);assert.deepEqual(p.latest().s,p.latest(1).s);p.close();
});
test("fixed rewards and exact-goal bonuses replay identically, even after a dropped finish update",async()=>{
  let draw=0;
  const q=await pair([0,3],()=>[.1,.2,.9][draw++%3]);
  // Run through legal commands; choose the smaller die when it earns a bonus.
  let n=0,recoveredExact=0;
  while(q.latest().s.phase!=="finished"){
    const s=q.latest().s,i=activeSeat(s);
    const moving=["choose","double"].includes(s.phase);
    if(moving)q.drop("view");
    assert.ok(s.phase==="double"?q.handles[0].automatic():i<2?q.handles[i].submit(cpuAction(s,()=>.3)):q.handles[0].cpu());
    if(moving){assert.notDeepEqual(q.latest().s,q.latest(1).s);if(q.latest().s.lastMove.exactBonus===5)recoveredExact++;}
    q.tick();assert.deepEqual(q.latest().s,q.latest(1).s);assert.ok(++n<=GOAL*4*4);
  }
  const s=q.latest().s;
  assert.ok(s.log.some(m=>m.type==='seed'&&m.seedDelta>0));
  assert.ok(recoveredExact>0);
  for(const m of s.log.filter(m=>m.finish))assert.equal(m.seedDelta,m.finishBonus+m.exactBonus);
  q.close();
});
test("leaving or replacing a peer freezes play and cancels retry timers",async()=>{
  const p=await pair();
  p.ends[0].onPeerChange(false,{previousPeerId:"client1"});
  p.ends[1].onPeerChange(true,{previousPeerId:"client0",peerId:"unexpected"});
  assert.deepEqual(p.errors.map(es=>es.length),[1,1]);assert.equal(p.intervals.size,0);assert.equal(pick(p,"roll"),false);
});
test("an unacknowledged request expires and cannot affect the next room",async()=>{
  const p=await pair();p.drop("action");pick(p,"roll");p.tick(16000);
  assert.equal(p.errors[1].length,1);assert.equal(pick(p,"roll"),false);p.close();
});

test("only the host automatically resolves doubles, and neither player may select half the pair",async()=>{
  const p=await pair([0,3],()=>.3);pick(p,"roll");
  assert.equal(p.latest().s.phase,"double");assert.deepEqual(p.latest().s.dice,[2,2]);
  assert.equal(pick(p,"choose",2),false);assert.equal(pick(p,"double"),false);assert.equal(p.handles[1].automatic(),false);
  const before=lastPacket(p,"view");p.deliver(0,{...before,events:[...before.events,2]});assert.equal(p.latest(1).s.phase,"double");
  assert.ok(p.handles[0].automatic());assert.equal(p.latest().s.lastMove.die,4);assert.equal(p.latest().s.players[1].distance,4);
  assert.deepEqual(p.latest().s,p.latest(1).s);assert.equal(p.latest().s.players[1].seeds,5);assert.equal(p.latest().s.phase,"challenge");
  assert.ok(pick(p,"challenge"));assert.equal(p.latest().s.lastMove.challengeDie,2);assert.equal(p.latest().s.players[1].seeds,2);p.close();
});
test("a player must request the challenge; lost requests/replies and forged outcomes never reroll the host die",async()=>{
  for(const lost of ['action','view']){
    let calls=0;const seq=[.3,.1,.6,.4];const p=await pair([0,3],()=>{calls++;return seq.shift()??.2;});
    pick(p,'roll');assert.deepEqual(p.latest().s.dice,[1,4]);
    pick(p,'choose',4);assert.equal(p.latest().s.phase,'challenge');assert.equal(calls,3);
    assert.equal(p.latest().s.players[1].seeds,5);assert.equal(pick(p,'challenge',undefined,0),false);
    assert.equal(pick(p,'challenge',6),false);assert.equal(p.handles[0].automatic(),false);
    const waiting=lastPacket(p,'view'),seen=p.views[1].length;
    for(const bad of [0,7,[4,1]])p.deliver(0,{...waiting,events:[...waiting.events,bad]});
    assert.equal(p.views[1].length,seen);
    p.drop(lost);assert.ok(p.handles[1].submit({seat:1,type:'challenge',challengeDie:6}));
    if(lost==='action')assert.equal(calls,3);else assert.equal(p.latest(1).s.phase,'challenge');
    p.tick();assert.equal(calls,4);assert.deepEqual(p.latest().s,p.latest(1).s);
    const s=p.latest().s;assert.equal(s.lastMove.challengeDie,3);assert.equal(s.players[1].seeds,11);
    assert.equal(s.players[1].distance,4);assert.equal(s.log.length,1);
    const request=lastPacket(p,'action');p.deliver(1,request);p.tick();assert.equal(calls,4);
    const current=lastPacket(p,'view');p.deliver(0,{...current,events:[...current.events.slice(0,-1),2]});
    assert.deepEqual(p.latest(1).s,s);assert.equal(pick(p,'challenge'),false);p.close();
  }
});
