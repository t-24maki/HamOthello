/* Actual rules, including doubles. Timing is an estimate, not a human playtest. */
import {GOAL,createGame,activeSeat,act,cpuAction,rankPlayers} from "../sugoroku/rules.js";
const count=Number(process.argv[2]||1000);
if(!Number.isSafeInteger(count)||count<1)throw Error("Expected positive match count");
const rng=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
let moves=0,doubles=0,choices=0,smaller=0,firstWins=0,auto=0,clicks=0,afterFirst=0;
for(let seed=1;seed<=count;seed++){
 const random=rng(seed);let s=createGame({first:seed%4}),steps=0;
 while(s.phase!=="finished"){
  const seat=activeSeat(s),p=s.players[seat],quick=s.players.filter(q=>q.finish===null).every(q=>!q.human),human=p.human&&p.finish===null,ph=s.phase;
  const a=cpuAction(s,random),n=act(s,a,random);
  if(ph!=="double"){
   if(human)clicks++;else auto+=quick?.08:({roll:1,choose:1.6,challenge:1,settled:1.8})[ph];
  }
  if(ph==="roll")auto+=quick?.14:1.05;
  if(ph==="challenge")auto+=2.85;
  if(ph==="choose"||ph==="double"){
   const m=n.lastMove;auto+=(quick?.045:.22)*(m.gain+1+(m.bonus?1:0));
   if(ph==="double"){doubles++;auto+=1.4;}else{choices++;if(a.value===Math.min(...s.dice))smaller++;}
   if(s.finishOrder.length)afterFirst++;
  }
  s=n;if(++steps>GOAL*4*4)throw Error('Nonterminating race');
 }
 moves+=s.log.length;firstWins+=rankPlayers(s)[0].seat===s.finishOrder[0];
}
const round=n=>+n.toFixed(2);
console.log(JSON.stringify({games:count,meanTurns:round(moves/count),meanDoubles:round(doubles/count),smallerDiePercent:round(100*smaller/choices),firstFinisherWinsPercent:round(100*firstWins/count),meanMovesAfterFirstFinish:round(afterFirst/count),autoSeconds:round(auto/count),humanActions:round(clicks/count),estimatedMinutesAt2to5SecondsPerAction:[2,5].map(n=>round((auto+clicks*n)/count/60))},null,2));
