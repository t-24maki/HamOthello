import test from "node:test";
import assert from "node:assert/strict";
import {BOARD,GOAL,FINISH_BONUS,activeSeat,createGame,rollPair,applyRoll,applyMove,applyChallenge,preview,act,remaining,rankPlayers,cpuAction} from "../sugoroku/rules.js";
const rng=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
function ready(from,dice,seat=0){const s=createGame({first:seat});s.players[seat].distance=from;return applyRoll(s,dice);}
const move=(s,d,r=()=>.25)=>act(s,{seat:activeSeat(s),type:s.phase,value:s.phase==="double"?undefined:d},r);
test("four unique characters start with five seeds, 48 squares and at most two humans",()=>{
  for(let n=1;n<=4;n++)for(let c=0;c<4;c++){
    const s=createGame({humans:n,firstCharacter:c});assert.equal(s.phase,"roll");
    assert.equal(s.players.filter(p=>p.human).length,Math.min(2,n));assert.equal(new Set(s.players.map(p=>p.character)).size,4);
    assert.ok(s.players.every(p=>remaining(p)===48&&p.seeds===5&&p.finish===null&&p.exactBonus===0));
  }
});
test("two independent dice cover 36 ordered outcomes, including all six doubles",()=>{
  const pairs=new Set();let doubles=0;
  for(let a=0;a<6;a++)for(let b=0;b<6;b++){
    const seq=[(a+.5)/6,(b+.5)/6],d=rollPair(()=>seq.shift());pairs.add(d.join(','));
    const n=applyRoll(createGame(),d);assert.equal(n.phase,a===b?'double':'choose');if(a===b)doubles++;
  }
  assert.equal(pairs.size,36);assert.equal(doubles,6);
  const s=createGame();for(const dice of [[0,2],[7,3],[1],[1,2,3],null,[2,NaN]])assert.equal(applyRoll(s,dice),s);
});
test("4 and 4 forces eight steps, with a separate double phase and no selectable half",()=>{
  const s=ready(1,[4,4]);assert.equal(s.players[0].distance,1);assert.equal(s.phase,'double');
  assert.equal(act(s,{seat:0,type:'choose',value:4}),s);assert.equal(act(s,{seat:0,type:'double',value:4}),s);
  assert.equal(applyMove(s,4,null),s);
  const n=move(s);assert.equal(n.players[0].distance,9);assert.equal(n.lastMove.die,8);assert.equal(n.lastMove.doubles,true);
  for(let d=1;d<=6;d++)assert.equal(move(ready(0,[d,d])).lastMove.land,2*d);
});
test("four seed squares always award 1, 2, 3, 4 to every seat on every lap; repeated actions cannot collect twice",()=>{
  for(const [cell,reward] of [[2,1],[6,2],[10,3],[14,4]])for(let lap=0;lap<3;lap++)for(let seat=0;seat<4;seat++){
    const s=ready(lap*16+cell-1,[1,5],seat),n=move(s,1);
    assert.equal(preview(s,1).reward,reward);assert.equal(n.players[seat].seeds,5+reward);
    assert.equal(n.lastMove.seedDelta,reward);assert.equal(move(n,1),n);assert.equal(s.players[seat].seeds,5);
  }
  let s=move(ready(0,[2,5]),2);s=act(s,{seat:0,type:'settled'});s=move(applyRoll(s,[2,6]),2);
  assert.deepEqual(s.players.slice(0,2).map(p=>p.seeds),[6,6]);
});
test("challenge waits for its player, then uses all six faces: odd plus six, even minus three, once without moving",()=>{
  const start=ready(0,[4,5]),s=move(start,4,()=>{throw Error("No draw before the challenge click");});
  assert.equal(s.phase,'challenge');assert.equal(s.players[0].seeds,5);assert.equal(s.players[0].distance,4);
  assert.equal(s.lastMove.challengeDie,null);assert.equal(s.log.length,1);
  for(let die=1;die<=6;die++){
    const n=act(s,{seat:0,type:'challenge'},()=>((die-.5)/6));
    assert.equal(n.players[0].seeds,die%2?11:2);assert.equal(n.lastMove.challengeDie,die);
    assert.equal(n.lastMove.luck,die%2);assert.equal(n.players[0].distance,4);assert.equal(n.log.length,1);
    assert.deepEqual(n.log[0],n.lastMove);assert.equal(n.phase,'settled');assert.equal(applyChallenge(n,die),n);
  }
  for(const value of [0,7,2.5,null,true,NaN])assert.equal(applyChallenge(s,value),s);
  assert.equal(applyChallenge(start,1),start);assert.equal(act(s,{seat:1,type:'challenge'}),s);
  assert.equal(act(s,{seat:0,type:'challenge',value:1}),s);assert.equal(act(s,{seat:0,type:'settled'}),s);
  for(let seeds=0;seeds<3;seeds++){
    const low=ready(0,[4,5]);low.players[0].seeds=seeds;
    const n=applyChallenge(move(low,4),6);assert.equal(n.players[0].seeds,0);assert.equal(n.lastMove.seedDelta,-seeds||0);
  }
});
test("shortcut moves three extra only once; blank cells have no reward and early home stops have only the exact bonus",()=>{
  const n=move(ready(2,[6,1]),6);assert.deepEqual([n.lastMove.land,n.lastMove.end,n.lastMove.bonus,n.players[0].seeds],[8,11,3,5]);
  assert.equal(BOARD[n.lastMove.end%16],'plain');
  const lap=move(ready(15,[1,6]),1);assert.equal(lap.phase,'settled');assert.equal(lap.players[0].finish,null);assert.equal(lap.players[0].seeds,10);assert.equal(lap.players[0].finishBonus,0);
});
test("all four must finish, awards follow arrival order, finished seats are skipped, overshooting is allowed",()=>{
  let s=createGame({first:2});s.players.forEach(p=>p.distance=47);
  for(let i=0;i<4;i++){
    const seat=activeSeat(s);s=move(applyRoll(s,[6,2]),6);
    assert.equal(s.players[seat].finish,i+1);assert.equal(s.players[seat].seeds,5+FINISH_BONUS[i]);
    assert.equal(s.phase,i===3?'finished':'settled');
    if(i<3){s=act(s,{seat,type:'settled'});assert.equal(s.players[activeSeat(s)].finish,null);}
  }
  assert.deepEqual(s.finishOrder,[2,3,0,1]);assert.ok(s.players.every(p=>p.distance===GOAL));
  assert.equal(act(s,{seat:activeSeat(s),type:'settled'}),s);
  const early=move(ready(47,[1,6]),1);let n=act(early,{seat:0,type:'settled'});
  for(let i=1;i<4;i++){n=move(applyRoll(n,[1,2]),1);n=act(n,{seat:i,type:'settled'});}
  assert.equal(activeSeat(n),1);
});
test("seed totals decide the winner; tied seeds use earlier arrival, not distance",()=>{
  const s=createGame();[10,20,20,14].forEach((v,i)=>{s.players[i].seeds=v;s.players[i].finish=i+1;s.players[i].distance=GOAL;});
  assert.deepEqual(rankPlayers(s).map(r=>r.seat),[1,2,3,0]);
});
test("exact home stops add five on every lap, including doubles; passing or overshooting does not",()=>{
  for(let place=0;place<4;place++)for(const [from,dice,steps,bonus] of [[44,[4,6],4,5],[44,[6,4],6,0],[40,[4,4],8,5],[41,[4,4],8,0],[15,[1,4],1,5],[31,[1,4],1,5],[8,[4,4],8,5],[24,[4,4],8,5],[15,[2,4],2,0],[31,[2,4],2,0],[9,[4,4],8,0],[25,[4,4],8,0]]){
    const s=ready(from,dice);s.finishOrder=[1,2,3].slice(0,place);
    const m=preview(s,steps),n=move(s,steps),finish=from+steps>=GOAL;
    assert.equal(m.exactBonus,bonus);assert.equal(n.players[0].exactBonus,bonus);
    assert.equal(n.players[0].finishBonus,finish?FINISH_BONUS[place]:0);
    assert.equal(n.players[0].seeds,5+(finish?FINISH_BONUS[place]:0)+bonus);
    assert.equal(n.lastMove.seedDelta,m.reward);assert.equal(move(n,steps),n);
  }
});
test("invalid and out-of-turn input cannot roll, move or add log entries",()=>{
  const s=ready(0,[2,6]);assert.equal(move(s,4),s);assert.equal(act(s,{seat:1,type:'choose',value:2}),s);
  const n=move(s,6);assert.equal(move(n,6),n);assert.equal(n.log.length,1);
  assert.equal(act(createGame(),{seat:0,type:'roll',value:[6,6]}).phase,'roll');
});
test("CPU choices use fixed rewards, exact goals and standings",()=>{
  assert.equal(cpuAction(ready(12,[2,3]),()=>.5).value,2); // Take four seeds instead of one extra step.
  assert.equal(cpuAction(ready(0,[2,5]),()=>.5).value,5); // One seed does not always outweigh three steps.
  assert.equal(cpuAction(ready(44,[4,6]),()=>.5).value,4);
  assert.equal(cpuAction(ready(12,[4,5]),()=>.5).value,4);
  assert.equal(cpuAction(ready(28,[4,5]),()=>.5).value,4); // Both reach the goal; only four earns the extra five.
  const near=ready(42,[4,6]);near.players[1].distance=GOAL;near.players[1].finish=1;near.players[1].seeds=30;near.finishOrder=[1];
  assert.equal(cpuAction(near,()=>.5).value,4); // A certain losing finish gives up the last collecting opportunity.
  near.players[0].seeds=35;assert.equal(cpuAction(near,()=>.5).value,6);
});
test("500 complete races preserve seeds, finish order and bounded forward progress including doubles",()=>{
  let doubles=0,chances=0,nonFirstWins=0;
  for(let seed=1;seed<=500;seed++){
    const r=rng(seed);let s=createGame({first:seed%4}),steps=0;
    while(s.phase!=='finished'){
      const n=act(s,cpuAction(s,r),r);assert.notEqual(n,s);s=n;assert.ok(++steps<=GOAL*4*4);
      assert.ok(s.players.every(p=>Number.isInteger(p.seeds)&&p.seeds>=0&&p.distance<=GOAL));
    }
    assert.equal(s.finishOrder.length,4);assert.equal(new Set(s.finishOrder).size,4);assert.equal(s.log.length,s.turn+1);
    s.players.forEach((p,i)=>assert.equal(p.seeds,5+s.log.filter(m=>m.seat===i).reduce((t,m)=>t+m.seedDelta,0)));
    doubles+=s.log.filter(m=>m.doubles).length;chances+=s.log.filter(m=>m.luck!==null).length;nonFirstWins+=rankPlayers(s)[0].seat!==s.finishOrder[0];
  }
  assert.ok(doubles>0&&chances>0&&nonFirstWins>0);
});
