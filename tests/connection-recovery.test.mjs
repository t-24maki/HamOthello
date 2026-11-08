import test from "node:test";
import assert from "node:assert/strict";
import {createOnlineSession} from "../src/online-game.js";
import {createConnectionGuard} from "../src/connection-guard.js";
import {recoveryNetwork,quietNotice} from "./helpers/recovery-network.mjs";
import {createPokerMatch} from "../poker/online.js";
import {createRouletteMatch} from "../roulette/online.js";
import {createMahjongMatch} from "../mahjong/online.js";
import {createShogiMatch} from "../shogi/online.js";
import {createBlocksMatch} from "../blocks/online.js";
import {createBilliardsMatch} from "../billiards/online.js";
import {createShiritoriMatch} from "../shiritori/online.js";
import {createMatch as createGyozaMatch} from "../gyoza/online.js";
import {createSugorokuMatch} from "../sugoroku/online.js";
import {createBattleOnline} from "../battle/online.js";
import {createOnline as createJintoriOnline} from "../jintori/online.js";
const factories={poker:createPokerMatch,roulette:createRouletteMatch,mahjong:createMahjongMatch,shogi:createShogiMatch,blocks:createBlocksMatch,billiards:createBilliardsMatch,shiritori:createShiritoriMatch,gyoza:createGyozaMatch,sugoroku:createSugorokuMatch,battle:createBattleOnline,jintori:createJintoriOnline};
async function matchPair(name){
 const n=recoveryNetwork(),ends=[n.endpoint(),n.endpoint()],handles=[],views=[[],[]],errors=[[],[]],status=[[],[]];let draws=0;
 for(let i=0;i<2;i++)handles.push(await factories[name]({role:i?"guest":"host",roomCode:"HAMU-ABC234",character:["sugoroku","jintori"].includes(name)?i:i?"meg":"tak",stageId:"hill",playerCount:4,
  now:n.now,timers:n.timers,random:()=>{draws++;return .05;},
  onError:e=>errors[i].push(e.message),onStatus:s=>status[i].push(s),
  onView:s=>views[i].push(structuredClone(s)),onState:s=>views[i].push(structuredClone(s)),onChange:s=>{if(s.game)views[i].push(structuredClone(s));},
  sessionFactory:opts=>createOnlineSession({...opts,clientFactory:ends[i].factory,timers:n.timers,now:n.now,events:ends[i].events,noticeFactory:quietNotice}),
 }));
 await n.tick(2200);
 return {...n,ends,handles,views,errors,status,draws:()=>draws,latest:i=>views[i].at(-1),close:()=>handles.forEach(h=>h.close())};
}
function core(v){
 if(v.game)return {matchId:v.matchId,roundId:v.roundId,generation:v.generation,round:v.round,game:v.game};
 const {hands,allowed,player,opponents,...rest}=v;return rest;
}
for(const name of Object.keys(factories))for(const down of [0,1])test(`${name}: ${down?"guest":"host"} reconnects after 35 seconds with the same game`,async()=>{
 const p=await matchPair(name);assert.ok(p.latest(0),"host initialized");assert.ok(p.latest(1),"guest initialized");
 const initial=p.latest(0),draws=p.draws();
 p.ends[down].down();await p.turns();await p.tick(35000);
 assert.deepEqual(p.errors,[[],[]]);assert.equal(p.draws(),draws,"reconnection never redeals or rerolls");
 if(name==="sugoroku")assert.equal(p.handles[0].submit({seat:0,type:"roll"}),false);
 else if(["battle","jintori","gyoza"].includes(name))assert.equal(p.handles[0].request(name==="gyoza"?"drop":"ready"),false);
 else assert.equal(p.handles[0].submit("rematch"),false);
 p.ends[down].upAgain();await p.tick(10000);
 assert.deepEqual(p.errors,[[],[]]);assert.equal(p.draws(),draws);
 if(!["battle","jintori"].includes(name))assert.deepEqual(core(p.latest(0)),core(initial));
 else {assert.equal(p.latest(0).round,initial.round);assert.equal(p.latest(1).round,initial.round);assert.equal(p.latest(0).game.phase,"paused");}
 if(name==="sugoroku"){assert.equal(p.handles[0].submit({seat:0,type:"roll"}),true);await p.turns();assert.deepEqual(p.latest(0),p.latest(1));}
 if(name==="poker"){assert.equal(p.handles[1].submit("exchange",[0]),true);await p.tick(1200);assert.equal(p.latest(1).exchanges[1],1);}
 p.close();await p.turns();assert.equal(p.jobs.size,0,"all game and transport timers cleaned");
});
test("pending dice roll and host reply lost across a disconnect never roll twice",async()=>{
 const p=await matchPair("sugoroku");p.handles[0].submit({seat:0,type:"roll"});await p.turns();p.handles[0].automatic();await p.turns();p.handles[0].submit({seat:0,type:"settled"});await p.turns();
 assert.equal(p.latest(0).phase,"roll");p.ends[0].drops.push("view");p.handles[1].submit({seat:1,type:"roll"});await p.turns();const draws=p.draws(),committed=p.latest(0);
 p.ends[1].down();await p.tick(30000);p.ends[1].upAgain();await p.tick(12000);
 assert.deepEqual(p.errors,[[],[]]);assert.equal(p.draws(),draws);assert.deepEqual(p.latest(1),committed);p.close();
});
test("shiritori countdown freezes and resumes instead of timing out during a 40-second outage",async()=>{
 const p=await matchPair("shiritori");const left=p.handles[0].remainingMs();p.ends[1].down();await p.turns();await p.tick(40000);
 assert.equal(p.handles[0].remainingMs(),left);assert.equal(p.latest(0).winner,null);p.ends[1].upAgain();await p.tick(9000);
 assert.deepEqual(p.errors,[[],[]]);assert.equal(p.latest(0).winner,null);assert.ok(p.handles[0].remainingMs()>17000);assert.ok(Math.abs(p.handles[0].remainingMs()-p.handles[1].remainingMs())<1300);p.close();
});
for(const name of ["battle","jintori"])test(`${name}: no simulation, clock, CPU or held input advances while disconnected`,async()=>{
 const p=await matchPair(name);p.handles[0].request("ready");p.handles[1].request("ready");await p.tick(300);
 for(let i=0;i<210;i++){p.handles[0].update(1/60,()=>name==="battle"?{move:1}:{x:1,y:0});p.handles[1].update(1/60,()=>name==="battle"?{move:1}:{x:1,y:0});if(i%6===0)await p.tick(100);}
 p.ends[1].down();await p.turns();const snapshot=structuredClone(p.handles[0].info().game);
 for(let i=0;i<300;i++)p.handles[0].update(.1,()=>{throw Error("input must not be sampled");});
 await p.tick(35000);assert.deepEqual(p.handles[0].info().game,snapshot);p.ends[1].upAgain();await p.tick(10000);
 assert.deepEqual(p.errors,[[],[]]);assert.equal(p.handles[0].info().game.phase,"paused");assert.equal(p.handles[1].info().game.phase,"paused");
 p.handles[0].request("ready");p.handles[1].request("ready");await p.tick(300);assert.notEqual(p.handles[0].info().game.phase,"paused");p.close();
});
test("guard excludes all recovery waits from game time",()=>{let clock=50;const g=createConnectionGuard(()=>clock);g.change("reconnecting");clock+=45000;assert.equal(g.now(),50);g.change("connected");clock+=1200;assert.equal(g.now(),1250);});

test("a suspended page detects the silent gap before evaluating shiritori timeout",async()=>{
 const p=await matchPair("shiritori"),left=p.handles[0].remainingMs();
 // Neither interval runs during OS suspension. Check must run before game time.
 p.jump(40000);await p.tick(500);
 assert.deepEqual(p.errors,[[],[]]);assert.equal(p.latest(0).winner,null);
 assert.ok(p.handles[0].remainingMs()>left-5500,"sleep must not consume forty seconds");
 await p.tick(3000);assert.equal(p.latest(0).winner,null);p.close();
});
