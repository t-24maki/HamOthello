import test from "node:test";
import assert from "node:assert/strict";
import {createGame,applyRoll,applyMove,applyChallenge,act,cpuAction,GOAL} from "../sugoroku/rules.js";
import {roundSeedHistory,raceChart} from "../sugoroku/history.js";
const rng=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);

test("rounds sample everyone together, carry finished balances, and respect any first seat",()=>{
  for(let first=0;first<4;first++){
    const s=createGame({first}),seat=offset=>(first+offset)%4;
    const entries=[
      [0,11,null],[1,5,null],[2,6,null],[3,8,null],
      [0,23,1],[1,2,null],[2,10,null],[3,9,null],
      [1,10,2],[2,14,3],[3,15,null],
      [3,17,4],
    ];
    s.log=entries.map(([offset,seedAfter,finish])=>({seat:seat(offset),seedAfter,finish}));
    s.phase="finished";
    const rows=roundSeedHistory(s);
    assert.deepEqual(rows[seat(0)].values,[5,11,23,23,23]);
    assert.deepEqual(rows[seat(1)].values,[5,5,2,10,10]);
    assert.deepEqual(rows[seat(2)].values,[5,6,10,14,14]);
    assert.deepEqual(rows[seat(3)].values,[5,8,9,15,17]);
    assert.deepEqual([0,1,2,3].map(i=>rows[seat(i)].finishRound),[2,3,3,4]);
  }
});
test("an incomplete round waits for its last player's challenge to resolve",()=>{
  let s=createGame({first:1});
  for(let i=0;i<3;i++){
    s=applyMove(applyRoll(s,[1,2]),1);
    s=act(s,{seat:s.seat,type:"settled"});
  }
  assert.ok(roundSeedHistory(s).every(r=>r.values.length===1));
  s=applyMove(applyRoll(s,[4,2]),4);
  assert.equal(s.phase,"challenge");
  assert.ok(roundSeedHistory(s).every(r=>r.values.length===1));
  for(const die of [1,2]){
    const done=applyChallenge(s,die),rows=roundSeedHistory(done);
    assert.equal(done.log.length,4);
    assert.deepEqual(rows[0].values,[5,die===1?11:2]);
    assert.ok(rows.slice(1).every(r=>r.values.join(',')==='5,5'));
  }
});
test("500 races produce synchronized lines through all rounds and actual final totals",()=>{
  for(let seed=1;seed<=500;seed++){
    const random=rng(seed);let s=createGame({first:seed%4}),events=0;
    while(s.phase!=="finished"){
      s=act(s,cpuAction(s,random),random);assert.ok(++events<=GOAL*4*4);
    }
    const turns=s.players.map((_,seat)=>s.log.filter(m=>m.seat===seat));
    const rounds=Math.max(...turns.map(t=>t.length));
    const rows=roundSeedHistory(s);assert.equal(rows.length,4);
    rows.forEach(r=>{
      assert.equal(r.values.length,rounds+1);
      assert.equal(r.values[0],5);
      for(let n=1;n<=rounds;n++)assert.equal(r.values[n],turns[r.seat][Math.min(n,turns[r.seat].length)-1].seedAfter);
      assert.equal(r.values.at(-1),s.players[r.seat].seeds);
      assert.equal(r.finishRound,turns[r.seat].length);
    });
    const chart=raceChart(s);assert.equal((chart.match(/class="chart-series"/g)||[]).length,4);
    const goals=[...chart.matchAll(/class="chart-finish" data-seat="(\d+)" data-round="(\d+)"/g)];
    assert.equal(goals.length,4);
    goals.forEach(([,seat,round])=>assert.equal(Number(round),turns[Number(seat)].length));
    assert.doesNotMatch(chart,/NaN|undefined|Infinity|周目|周回/);
    assert.match(chart,new RegExp(rounds+'巡目'));
  }
});
test("axis labels show every round through twelve and uniform whole-number intervals for longer races",()=>{
  for(const [rounds,expected] of [[12,Array.from({length:13},(_,i)=>i)],[13,[0,2,4,6,8,10,12,14]],[27,[0,5,10,15,20,25,30]]]){
    const s=createGame();
    s.log=Array.from({length:rounds},()=>s.players.map((_,seat)=>({seat,seedAfter:5,finish:null}))).flat();
    const chart=raceChart(s);
    const ticks=[...chart.matchAll(/class="chart-round"[^>]*>(\d+)<\/text>/g)].map(m=>Number(m[1]));
    assert.deepEqual(ticks,expected);
  }
});
