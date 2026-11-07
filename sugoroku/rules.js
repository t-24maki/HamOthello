export const CAST = [
  {id:"tak", name:"たくハム", short:"たく", color:"#8566a1"},
  {id:"meg", name:"めぐハム", short:"めぐ", color:"#a27128"},
  {id:"ham", name:"ノーマルハム", short:"ノーマル", color:"#9b6243"},
  {id:"tapi", name:"たぴ", short:"たぴ", color:"#ab6276"},
];
export const BOARD = ["home","plain","seed","plain","chance","plain","seed","plain",
  "bridge","plain","seed","plain","chance","plain","seed","plain"];
export const PLACES = {home:"ゴール",plain:"通常マス",seed:"たね",chance:"チャレンジ",bridge:"近道"};
export const LAPS=3, GOAL=BOARD.length*LAPS, FINISH_BONUS=[12,8,4,2], EXACT_BONUS=5;
export const SEED_REWARDS={2:1,6:2,10:3,14:4};
export const activeSeat=s=>s.seat;
export const remaining=p=>GOAL-p.distance;
export const cellAt=distance=>distance%BOARD.length;
export const effectOf=type=>type==="bridge"?3:0;
export const lapOf=p=>Math.min(LAPS,1+Math.floor(p.distance/BOARD.length));
export const isDouble=s=>s.dice.length===2&&s.dice[0]===s.dice[1];
export const nextBonus=s=>FINISH_BONUS[s.finishOrder.length]??0;

export function createGame({humans=1,firstCharacter=0,first=0}={}) {
  if(![1,2,3,4].includes(humans)||![0,1,2,3].includes(firstCharacter)||![0,1,2,3].includes(first))
    throw new RangeError("Invalid seats");
  return {turn:0,first,seat:first,phase:"roll",dice:[],lastMove:null,log:[],finishOrder:[],
    players:Array.from({length:4},(_,i)=>({character:(firstCharacter+i)%4,human:i<Math.min(humans,2),distance:0,seeds:5,finish:null,finishBonus:0,exactBonus:0}))};
}
export const rollDie=(rng=Math.random)=>1+Math.floor(rng()*6);
export const rollPair=(rng=Math.random)=>[rollDie(rng),rollDie(rng)];
export function applyRoll(s,dice) {
  if(s.phase!=="roll"||!Array.isArray(dice)||dice.length!==2||!dice.every(d=>Number.isInteger(d)&&d>=1&&d<=6))return s;
  return {...s,phase:dice[0]===dice[1]?"double":"choose",dice:[...dice]};
}
export function preview(s,die) {
  const from=s.players[activeSeat(s)].distance,land=Math.min(GOAL,from+die),cell=cellAt(land),type=BOARD[cell];
  const end=Math.min(GOAL,land+(land===GOAL?0:effectOf(type)));
  const finishBonus=end===GOAL?nextBonus(s):0;
  const exactBonus=from+die<=GOAL&&(from+die)%BOARD.length===0?EXACT_BONUS:0;
  const reward=finishBonus+exactBonus+(type==="seed"?SEED_REWARDS[cell]:0);
  return {from,die,land,type,cell,end,bonus:end-land,gain:end-from,reward,finishBonus,exactBonus};
}
export function validMove(s,steps) {
  return s.phase==="choose"?s.dice.includes(steps):s.phase==="double"?steps===s.dice[0]*2:false;
}
export function applyMove(s,steps) {
  if(!validMove(s,steps))return s;
  const seat=activeSeat(s),p=s.players[seat],m=preview(s,steps),chance=m.end<GOAL&&m.type==="chance";
  const delta=m.reward;
  const finish=m.end===GOAL?s.finishOrder.length+1:null;
  const players=[...s.players];players[seat]={...p,distance:m.end,seeds:p.seeds+delta,finish,finishBonus:m.finishBonus,exactBonus:m.exactBonus};
  const finishOrder=finish?[...s.finishOrder,seat]:s.finishOrder;
  const lastMove={...m,seat,luck:null,challengeDie:null,doubles:isDouble(s),dice:[...s.dice],seedBefore:p.seeds,seedAfter:p.seeds+delta,
    seedDelta:delta,finish};
  return {...s,players,finishOrder,lastMove,log:[...s.log,lastMove],phase:finishOrder.length===4?"finished":chance?"challenge":"settled"};
}
// The authority supplies one actual die after the player asks to challenge.
// Replaying or retrying a command never draws another die or moves the token.
export function applyChallenge(s,die) {
  if(s.phase!=="challenge"||!Number.isInteger(die)||die<1||die>6)return s;
  const seat=activeSeat(s),p=s.players[seat],luck=die%2,delta=Math.max(-p.seeds,luck?6:-3)||0;
  const players=[...s.players];players[seat]={...p,seeds:p.seeds+delta};
  const lastMove={...s.lastMove,challengeDie:die,luck,seedDelta:delta,seedAfter:p.seeds+delta};
  return {...s,players,lastMove,log:[...s.log.slice(0,-1),lastMove],phase:"settled"};
}
export function act(s,a,rng=Math.random) {
  if(!a||s.phase==="finished"||a.type!==s.phase||a.seat!==activeSeat(s))return s;
  if(s.phase==="roll")return a.value==null?applyRoll(s,rollPair(rng)):s;
  if(s.phase==="choose"||s.phase==="double"){
    if(s.phase==="double"&&a.value!=null)return s;
    const steps=s.phase==="double"?s.dice[0]*2:a.value;
    if(!validMove(s,steps))return s;
    return applyMove(s,steps);
  }
  if(s.phase==="challenge")return a.value==null?applyChallenge(s,rollDie(rng)):s;
  if(s.phase==="settled"&&a.value==null){
    let seat=activeSeat(s);do{seat=(seat+1)%4;}while(s.players[seat].finish!==null);
    return {...s,seat,turn:s.turn+1,phase:"roll",dice:[],lastMove:null};
  }
  return s;
}
export function rankPlayers(s) {
  const rows=s.players.map((p,seat)=>({seat,seeds:p.seeds,finish:p.finish,bonus:p.finishBonus,exactBonus:p.exactBonus}));
  rows.sort((a,b)=>b.seeds-a.seeds||(a.finish??5)-(b.finish??5)||a.seat-b.seat);
  return rows.map((r,i)=>({...r,rank:i+1}));
}
export function cpuAction(s,rng=Math.random) {
  const seat=activeSeat(s);
  if(s.phase!=="choose")return {seat,type:s.phase};
  const p=s.players[seat],others=s.players.filter((_,i)=>i!==seat),lead=p.seeds-Math.max(...others.map(q=>q.seeds));
  const rivalNear=others.some(q=>q.finish===null&&remaining(q)<=6),speed=[.8,.6,1.15,.9][p.character]+(rivalNear?.45:0)+(lead>3?.25:0);
  const finishedBest=Math.max(-1,...others.filter(q=>q.finish!==null).map(q=>q.seeds));
  const values=s.dice.map(d=>{
    const m=preview(s,d),chance=m.end<GOAL&&m.type==="chance";
    let score=m.reward+speed*m.gain;
    if(chance)score+=(6-Math.min(3,p.seeds))/2+(lead< -3?1:lead>3?-2:0);
    // A certain losing finish is less useful than a remaining chance to collect.
    if(m.end===GOAL&&p.seeds+m.reward<=finishedBest)score-=20;
    return score+.05*rng();
  });
  return {seat,type:"choose",value:s.dice[values[1]>values[0]?1:0]};
}
