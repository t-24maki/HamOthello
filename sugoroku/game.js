import {createSugorokuMatch,generateRoomCode,normalizeRoomCode} from "./online.js?v=20261107-roundgraph1";
import {CAST,BOARD,GOAL,LAPS,createGame,activeSeat,cellAt,lapOf,preview,rankPlayers,act,cpuAction,FINISH_BONUS,SEED_REWARDS} from "./rules.js?v=20261107-roundgraph1";
import {icon,face,cube} from "./art.js?v=20261107-motion1";
import {raceChart} from "./history.js?v=20261107-roundgraph3";
const $=id=>document.getElementById(id);
let humans=1,character=0,state=null,timer=0,fast=false,travel=null,menu=false;
let mode="solo",roomRole="host",net=null,mySeat=0,generation=0,busy=false,sending=false,broken=false;
let roomCode="",subscribed=false,lastMeta=null;
const connectedMode=()=>mode==="online";
const myTurn=()=>state && !opening && !frames.length && state.players[activeSeat(state)].finish===null && state.players[activeSeat(state)].human &&
  (!connectedMode() || (activeSeat(state)===mySeat && !sending && !broken));
const hero = p=>CAST[p.character], tag=(p,i)=>!p.human?"CPU":connectedMode()?(i===mySeat?"あなた":"相手"):"P"+(i+1);
let beginAfterBrief=null,frames=[],opening=null,openingTimer=0;
const reducedMotion=()=>window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const playOrder=()=>Array.from({length:4},(_,i)=>(state.first+i)%4);
function setupUI(){
  const modes=[["solo","ひとり","CPU3匹"],["online","ふたり通信","CPU2匹"],["local","1台でふたり","CPU2匹"]];
  $("human-count").innerHTML=modes.map(([id,label,detail])=>'<button data-mode="'+id+'" aria-pressed="'+(id===mode)+'" '+(busy?"disabled":"")+'>'+label+'<small>'+detail+'</small></button>').join("");
  $("cast").innerHTML=CAST.map((c,i)=>'<button aria-label="'+c.name+'" data-cast="'+i+'" aria-pressed="'+(character===i)+'" '+(busy?"disabled":"")+'>'+face(i)+c.short+'</button>').join("");
  $("room-tools").hidden=!connectedMode();
  for(const b of document.querySelectorAll("[data-room]")){b.disabled=busy;b.setAttribute("aria-pressed",String(b.dataset.room===roomRole));}
  $("join-code").hidden=roomRole!=="guest";$("room-input").disabled=busy;
  $("share-code").hidden=!(busy&&subscribed&&roomRole==="host");$("room-code").textContent=roomCode;
  $("start").disabled=busy;$("cancel-room").hidden=!busy;
  $("start").textContent=busy?"通信中…":connectedMode()?(roomRole==="host"?"部屋をつくって待つ":"キーワードで参加する"):"町へ出発する →";
  $("setup-note").textContent=(mode==="solo"?"ひとり ＋ CPU3匹":mode==="local"?"1台でふたり ＋ CPU2匹":"別々の端末でふたり ＋ CPU2匹")+"　·　3周・たね集め／約5〜10分";
}
function clearRoom(){
  closeOpening();
  frames=[];generation++;net?.close();net=null;lastMeta=null;sending=false;broken=false;busy=false;subscribed=false;roomCode="";
  $("room-status").textContent="";$("wire-error").textContent="";$("wire-alert").hidden=true;
}
$("human-count").onclick=e=>{const b=e.target.closest("[data-mode]");if(b&&!busy){clearRoom();mode=b.dataset.mode;humans=mode==="solo"?1:2;$("room-status").textContent="";setupUI();}};
$("cast").onclick=e=>{const b=e.target.closest("[data-cast]");if(b&&!busy){character=Number(b.dataset.cast);setupUI();}};
$("room-tools").addEventListener("click",e=>{const b=e.target.closest("[data-room]");if(b&&!busy){roomRole=b.dataset.room;$("room-status").textContent="";setupUI();}});
$("copy-room").onclick=async()=>{try{await navigator.clipboard.writeText(roomCode);$("room-status").textContent="コピーしました。相手に教えてね。";}catch{$("room-status").textContent="キーワードを長押ししてコピーしてね。";}};
$("cancel-room").onclick=()=>{clearRoom();setupUI();};
$("room-input").addEventListener("keydown",e=>{if(e.key==="Enter"&&!busy)$("start").click();});
$("exit-room").onclick=()=>toSetup();
$("cover-friends").innerHTML=CAST.map((_,i)=>face(i)).join("");setupUI();
function gridPos(i){
  if(i<5)return [1,i+1];
  if(i<9)return [i-3,5];
  if(i<13)return [5,13-i];
  return [17-i,1];
}
const middle='<div class="middle"><img src="./town.svg" alt=""><div class="race-tray"><strong id="roll-caption"></strong><div class="throw-box" id="throw-box"></div><small id="dice-hint"></small><div id="challenge-stage" hidden></div></div></div>';
const signed=v=>v>=0?"＋"+v:"−"+Math.abs(v);
$("map").innerHTML=middle+BOARD.map((type,i)=>{
  const [r,c]=gridPos(i),sign=type!=="plain"?icon(type)+'<span class="place"></span>':"";
  return '<div class="cell '+type+'" id="cell-'+i+'" style="grid-row:'+r+';grid-column:'+c+'">'+sign+'<div class="pins"></div><span class="target-value" hidden></span></div>';
}).join("");
const moving=()=>travel?.move??(travel?.kind==="walk"?state.lastMove:null);
const challengeMotion=()=>travel?.kind==="challenge-roll"||travel?.kind==="challenge-result";
const challenging=()=>challengeMotion()||(!travel&&(state.phase==="challenge"||state.lastMove?.challengeDie!=null));
function visualDistance(p,i){const m=moving();return m?.seat===i?(travel.kind==="walk"?travel.at:challenging()?m.end:m.from):p.distance;}
function paintMap(){
  const choices=state.phase==="choose"&&!travel?state.dice:[],targets=choices.map(v=>cellAt(preview(state,v).land));
  BOARD.forEach((type,i)=>{
    const cell=$("cell-"+i),seats=state.players.map((p,k)=>cellAt(visualDistance(p,k))===i?k:-1).filter(k=>k>=0);
    const label=type==="seed"?"たね "+signed(SEED_REWARDS[i]):type==="bridge"?"近道 ＋3マス":type==="chance"?"たね＋6／−3":type==="home"?"⚑ ゴール":"";
    if(type!=="plain")cell.querySelector(".place").textContent=label;
    cell.classList.toggle("occupied",!!seats.length);cell.classList.toggle("target",targets.includes(i));
    const pins=cell.querySelector(".pins"),key=seats.map(k=>state.players[k].character+":"+(k===activeSeat(state))).join(",");
    if(pins.dataset.key!==key){pins.dataset.key=key;pins.innerHTML=seats.map(k=>'<span class="pin '+(k===activeSeat(state)?"current":"")+'" style="--token:'+hero(state.players[k]).color+'">'+face(state.players[k].character)+'</span>').join("");}
    const badge=cell.querySelector(".target-value");badge.hidden=!targets.includes(i);badge.textContent=choices[targets.indexOf(i)]??"";
    cell.setAttribute("aria-label",i+"番 "+(label||"通常マス")+(seats.length?"："+seats.map(k=>hero(state.players[k]).name).join("、"):""));
  });
}
function destination(m){
  if(m.end===GOAL)return "ゴール ＋"+m.reward+"個";
  if(m.exactBonus)return "ぴったり ＋5個";
  if(m.type==="seed")return "たね ＋"+m.reward+"個";
  if(m.type==="chance")return "たね ＋6／−3個";
  return m.bonus?"近道 ＋3マス":"空マス";
}
function paintDice(){
  const box=$("throw-box"),values=state.dice.length?state.dice:[1,6],rolling=travel?.kind==="roll",choosing=state.phase==="choose"&&!travel;
  const key=values.join(",")+":"+rolling;
  if(box.dataset.key!==key){box.dataset.key=key;box.innerHTML=values.map((v,i)=>'<button class="table-die" data-index="'+i+'">'+cube(v)+'<span class="dice-note"></span></button>').join("");}
  box.classList.toggle("tossing",rolling);box.classList.toggle("choosing",choosing&&myTurn());
  const actionable=myTurn()&&!travel&&["roll","choose"].includes(state.phase);
  for(const [i,b] of [...box.children].entries()){
    b.disabled=!actionable;b.classList.toggle("picked",!!state.lastMove&&(state.lastMove.doubles||state.lastMove.die===values[i]));
    const m=choosing?preview(state,values[i]):null,detail=m?destination(m):"";
    b.querySelector(".dice-note").innerHTML=m?'<b>'+detail+'</b><small>'+(m.end===GOAL?(m.exactBonus?"ぴったり＋5個込み":"到着ボーナス"):'あと'+(GOAL-m.end)+'マス')+'</small>':"";
    b.setAttribute("aria-label",state.phase==="roll"?"サイコロを振る（"+(i?"右":"左")+"）":'出目'+values[i]+'を選ぶ'+(m?'、'+detail+(m.exactBonus?'、ぴったりボーナス5個':'')+'、あと'+(GOAL-m.end)+'マス':""));
  }
  $("roll-caption").textContent=rolling?"ころころ…":travel?.kind==="double"?"ゾロ目！ 合計"+state.lastMove.die+"マス":state.phase==="roll"?"サイコロを振ろう":state.phase==="double"?"ゾロ目！":choosing?(myTurn()?"サイコロをタップ":hero(state.players[activeSeat(state)]).short+"が選んでいるよ"):"進む数："+state.lastMove.die;
  $("dice-hint").textContent=rolling?"ころころ…":choosing?(myTurn()?"好きな方にタッチ！":"出目と行き先を見てみよう"):state.phase==="roll"?(myTurn()?"どちらに触れても振れるよ":"サイコロの出番"):"";
}
function paintChallenge(){
  const panel=$("challenge-stage"),active=challenging();panel.hidden=!active;
  panel.parentElement.classList.toggle("challenge-active",active);
  if(!active){panel.dataset.key="";return;}
  const m=state.lastMove,ready=state.phase==="challenge",rolling=travel?.kind==="challenge-roll";
  const actionable=ready&&myTurn()&&!travel,key=state.turn+":"+(ready?"ready":rolling?"rolling":"result")+":"+actionable;
  if(panel.dataset.key===key)return;
  panel.dataset.key=key;panel.className=ready?"ready":rolling?"drawing":"revealed";
  const result=!ready&&!rolling,title=ready?(actionable?"サイコロをタップ！":hero(state.players[m.seat]).short+"が挑戦するよ"):rolling?"ころころ…":'出目'+m.challengeDie+'・'+(m.luck?'奇数で成功！':'偶数…');
  panel.innerHTML='<strong class="challenge-title">★ たねチャレンジ</strong><b class="challenge-status">'+title+'</b><div class="challenge-play"><span class="challenge-odds '+(result&&m.luck?'chosen':'')+'">奇数<b>＋6個</b></span><div class="challenge-die '+(rolling?'tossing':'')+'"><button class="table-die '+(ready?'unrolled':'')+'" data-challenge aria-label="チャレンジのサイコロを振る" '+(actionable?'':'disabled')+'>'+cube(m.challengeDie??1)+'</button></div><span class="challenge-odds '+(result&&!m.luck?'chosen':'')+'">偶数<b>−3個</b></span></div><small class="challenge-total">'+(result?'持ちたね '+m.seedBefore+' → '+m.seedAfter+'個':ready?'1個振って、たねを増やそう！':'奇数ならたね＋6、偶数なら−3')+'</small>';
}
function paintInfo(){
  const seat=activeSeat(state),p=state.players[seat],m=moving();
  $("round").textContent="3周でゴール";
  const count=state.finishOrder.length-(m?.finish?1:0);
  $("finish-prizes").innerHTML=FINISH_BONUS.map((n,i)=>'<span class="'+(i<count?'taken':'')+'">'+(i+1)+'着 <b>＋'+n+'</b></span>').join("");
  $("roster").innerHTML=playOrder().map((i,order)=>{
    const q=state.players[i];
    const distance=visualDistance(q,i),inMotion=m?.seat===i&&travel.kind!=="challenge-result",seeds=inMotion?m.seedBefore:q.seeds,finish=inMotion?null:q.finish;
    return '<article class="'+(i===seat?"active":"")+(finish?' arrived':'')+'" style="--token:'+hero(q).color+'" aria-label="'+(order+1)+'番目：'+hero(q).name+'"><span class="who">'+'①②③④'[order]+' '+tag(q,i)+'</span><strong>'+hero(q).short+'</strong><span class="score">たね '+seeds+'個</span><small>'+(finish?finish+'着・＋'+(q.finishBonus+q.exactBonus)+'個獲得':lapOf({distance})+'周目')+'</small><progress max="'+GOAL+'" value="'+distance+'" aria-label="進んだ距離"></progress></article>';
  }).join("");
  $("turn-label").textContent=tag(p,seat)+"　"+hero(p).name+"の番";$("turn-label").style.setProperty("--token",hero(p).color);
  $("phase").textContent=lapOf({distance:visualDistance(p,seat)})+"周目／全"+LAPS+"周";
  $("speed").textContent="早送り："+(fast?"入":"切");$("speed").setAttribute("aria-pressed",String(fast));
}
function outcome(m){
  if(m.finish)return m.finish+"着でたね＋"+m.finishBonus+"個！ "+(m.exactBonus?"ぴったりゴールでさらに＋5個！ ":"")+"合計"+m.seedAfter+"個。";
  if(m.exactBonus)return (m.end/BOARD.length)+"周目ぴったり！ たね＋5個。 あと"+(GOAL-m.end)+"マス。";
  if(m.type==="chance"&&m.challengeDie===null)return "★に到着！ サイコロを1個振ってチャレンジしよう。";
  const detail=m.type==="seed"?"たね＋"+m.seedDelta+"個。":m.type==="chance"?"出目"+m.challengeDie+(m.luck?"（奇数）で成功！ ":"（偶数）… ")+"たね"+signed(m.seedDelta)+"個。":m.bonus?"近道でさらに3マス！":m.die+"マス進んだよ。";
  return detail+" あと"+(GOAL-m.end)+"マス。";
}
function actionButton(title){return '<button class="act solo" data-action="'+state.phase+'">'+title+'</button>';}
function paintConsole(){
  const p=state.players[activeSeat(state)],name=hero(p).short,ph=state.phase;
  let msg="",actions="";
  if(travel?.kind==="roll")msg=name+"がサイコロを振った！";
  else if(travel?.kind==="double")msg="ゾロ目なので倍進めるよ！ "+state.dice.join("＋")+"＝"+state.lastMove.die+"マス！";
  else if(travel?.kind==="walk")msg=travel.leg==="effect"?"近道！ さらに3マス進むよ。":name+"は "+state.lastMove.die+" マス進むよ。";
  else if(travel?.kind==="challenge-roll")msg=name+"がチャレンジ！ 奇数ならたね＋6個、偶数なら−3個。";
  else if(travel?.kind==="challenge-result")msg=outcome(state.lastMove);
  else if(ph==="roll"){msg="たねを集める？ ゴールを急ぐ？";actions=actionButton("サイコロを振る");}
  else if(ph==="choose"){msg="進みたいサイコロをタップしてね。";actions='<div class="choice-guide">↑ サイコロの下に行き先が出ているよ</div>';}
  else if(ph==="double")msg="ゾロ目！ 2個の合計で進むよ。";
  else if(ph==="challenge"){msg="1個振って挑戦！ 奇数ならたね＋6個、偶数なら−3個。";actions=actionButton("チャレンジのサイコロを振る");}
  else if(ph==="settled"){msg=outcome(state.lastMove);actions=actionButton("次の手番へ");}
  if(travel||!myTurn()||ph==="double"){
    if(!travel&&ph==="choose")msg=name+"の出目は "+state.dice.join(" と ")+"。";
    const waiting=broken?"通信が切れました":sending?"送信中…":travel?.kind==="double"?"このあと自動で進むよ":travel?.kind==="roll"?"出目が決まるよ…":challengeMotion()?(travel.kind==="challenge-roll"?"チャレンジ中…":"結果を確認してね"):travel?"移動中…":ph==="double"?"自動で進むよ":p.finish!==null?"みんなのゴールを待とう":ph==="settled"?"到着！":p.human?"相手の操作を待っています":name+"が考え中…";
    actions='<div class="waiting">'+waiting+'</div>';
  }
  $("prompt").textContent=msg;$("actions").innerHTML=actions;
}
function render(){paintMap();paintDice();paintChallenge();paintInfo();paintConsole();}
function paused(){return menu||$("dialog").open||$("briefing").open||document.hidden;}
const quick=()=>fast||state.players.filter(p=>p.finish===null).every(p=>!p.human)||frames.length>1;
function finishMotion(){
  if(travel?.kind==="double"){
    travel={kind:"walk",leg:"die",move:state.lastMove,seat:state.lastMove.seat,at:state.lastMove.from};render();schedule();return;
  }
  if(travel?.kind==="challenge-roll"){
    travel={kind:"challenge-result",move:state.lastMove};render();schedule();return;
  }
  travel=null;
  if(frames.length){present(frames.shift(),true);return;}
  if(state.phase==="finished"){showResult();return;}
  render();schedule();
}
function schedule(){
  clearTimeout(timer);
  if(!state||opening||broken||(!connectedMode()&&paused()))return;
  if(travel?.kind==="roll"){
    const ms=reducedMotion()?140:quick()?480:1450;
    $("throw-box").style.setProperty("--roll-ms",(ms-50)+"ms");
    timer=setTimeout(finishMotion,ms);return;
  }
  if(travel?.kind==="double"){timer=setTimeout(finishMotion,1400);return;}
  // Both clients reveal the confirmed result; the visual draw never rolls again.
  if(challengeMotion()){timer=setTimeout(finishMotion,travel.kind==="challenge-roll"?(reducedMotion()?140:1450):1800);return;}
  if(travel?.kind==="walk"){
    const m=state.lastMove;
    timer=setTimeout(()=>{
      if(travel.leg==="die"&&travel.at===m.land&&m.bonus){travel.leg="effect";paintConsole();schedule();return;}
      const target=travel.leg==="die"?m.land:m.end;
      if(travel.at===target){finishMotion();return;}
      travel.at+=Math.sign(target-travel.at);paintMap();paintInfo();schedule();
    },quick()?45:220);return;
  }
  if(frames.length){present(frames.shift(),true);return;}
  if(state.phase==="finished"||(connectedMode()&&mySeat!==0))return;
  const automatic=state.phase==="double"||(state.phase==="settled"&&state.players[activeSeat(state)].finish!==null);
  if(!automatic&&state.players[activeSeat(state)].human)return;
  const snapshot=state,ms={roll:1000,choose:1600,double:0,challenge:1000,settled:1800}[state.phase];
  timer=setTimeout(()=>{
    if(state!==snapshot)return;
    if(connectedMode()){if(automatic)net?.automatic();else net?.cpu();}
    else if(!paused())dispatch(cpuAction(state));
  },state.phase==="double"?0:quick()?80:ms);
}
function present(next,animate){
  const prev=state;clearTimeout(timer);state=next;travel=null;
  if(animate&&prev?.phase==="roll"&&["choose","double"].includes(next.phase))travel={kind:"roll"};
  if(animate&&["choose","double"].includes(prev?.phase)&&next.lastMove){
    travel=next.lastMove.doubles?{kind:"double",move:next.lastMove}:{kind:"walk",leg:"die",move:next.lastMove,seat:next.lastMove.seat,at:next.lastMove.from};
  }
  if(animate&&prev?.phase==="challenge"&&next.phase==="settled")travel={kind:"challenge-roll",move:next.lastMove};
  if(!travel&&frames.length){present(frames.shift(),true);return;}
  if(!travel&&next.phase==="finished"){showResult();return;}
  render();schedule();
}
function dispatch(action){
  if(paused()||opening||travel||!state||state.phase!==action.type||action.seat!==activeSeat(state))return;
  if(connectedMode()){if(myTurn())net?.submit(action);return;}
  const n=act(state,action);if(n!==state)present(n,true);
}
$("actions").onclick=e=>{const b=e.target.closest("[data-action]");if(b&&!b.disabled&&myTurn())dispatch({seat:activeSeat(state),type:b.dataset.action});};
$("throw-box").onclick=e=>{
  const b=e.target.closest("[data-index]");if(!b||b.disabled||!myTurn())return;
  dispatch({seat:activeSeat(state),type:state.phase,value:state.phase==="choose"?state.dice[Number(b.dataset.index)]:undefined});
};
$("challenge-stage").onclick=e=>{
  const b=e.target.closest("[data-challenge]");
  if(b&&!b.disabled&&myTurn())dispatch({seat:activeSeat(state),type:"challenge"});
};
function enterTrack(){
  $("setup").hidden=true;$("result").hidden=true;$("game").hidden=false;window.scrollTo(0,0);
}
function closeOpening(){
  clearTimeout(openingTimer);opening=null;
  if($("start-order").open)$("start-order").close();
}
function revealOpening(){
  if(!opening)return;
  clearTimeout(openingTimer);opening.ready=true;
  $("start-order").className="revealed";
  $("order-caption").textContent=hero(state.players[state.first]).name+"からスタート！";
  $("order-start").disabled=false;$("order-start").textContent="この順でスタート！";
}
function beginRace(next){
  closeOpening();opening={ready:false,next:null};frames=[];enterTrack();present(next,false);
  const angle=1440+state.first*90,dialog=$("start-order");
  // Seats increase counterclockwise: top, left, bottom, right. The host's
  // confirmed first seat determines the stop; this animation never draws again.
  dialog.style.setProperty("--stop",angle+"deg");dialog.style.setProperty("--counter",-angle+"deg");
  $("order-wheel").innerHTML=state.players.map((p,i)=>'<div class="wheel-slot slot-'+i+'"><div class="wheel-face">'+face(p.character)+'<b>'+hero(p).short+'</b></div></div>').join("");
  $("order-route").innerHTML=playOrder().map((i,n)=>'<li><span class="order-number">'+(n+1)+'</span>'+face(state.players[i].character)+'<b>'+hero(state.players[i]).short+'</b><small>'+tag(state.players[i],i)+'</small></li>').join("");
  $("order-caption").textContent="くるくる… 最初の人は？";
  $("order-start").disabled=true;$("order-start").textContent="順番を決めています…";
  dialog.className="spinning";dialog.showModal();
  // A timer also covers reduced motion and browsers that omit animationend.
  openingTimer=setTimeout(revealOpening,reducedMotion()?100:3300);
}
$("order-wheel").addEventListener("animationend",e=>{if(e.target===$("order-wheel"))revealOpening();});
$("start-order").addEventListener("cancel",e=>e.preventDefault());
$("order-start").onclick=()=>{
  if(!opening?.ready)return;
  const next=opening.next;closeOpening();
  // A guest may still be reading the order while the host has already started.
  if(next)present(next,false);else{render();schedule();}
};
function startGame(){
  beginRace(createGame({humans,firstCharacter:character,first:Math.floor(Math.random()*4)}));
}
function toSetup(){clearRoom();clearTimeout(timer);travel=null;state=null;$("result").hidden=true;$("game").hidden=true;$("setup").hidden=false;setupUI();window.scrollTo(0,0);}
function acceptOnline(next,meta){
  const fresh=lastMeta?.year!==meta.year;
  const animate=!fresh && lastMeta.revision+1===meta.revision && !document.hidden;
  mySeat=meta.seat;lastMeta=meta;busy=false;
  if(fresh){beginRace(next);return;}
  if(opening){opening.next=next;return;}
  if(animate&&(travel||frames.length)){frames.push(next);return;}
  if(!animate)frames=[];
  present(next,animate);
}
async function connectRoom(){
  if(!connectedMode()||busy)return;
  const code=roomRole==="host"?generateRoomCode():normalizeRoomCode($("room-input").value);
  if(!/^HAMU-[A-Z2-9]{6}$/.test(code)){$("room-status").textContent="相手のキーワードを6文字で入力してね（例：HAMU-ABC234）。";return;}
  clearRoom();const attempt=generation;roomCode=code;busy=true;mySeat=roomRole==="host"?0:1;
  $("room-status").textContent="部屋につないでいるよ…";setupUI();
  const failed=e=>{
    if(generation!==attempt)return;
    generation++;busy=false;subscribed=false;sending=false;broken=true;clearTimeout(timer);travel=null;
    if(opening?.next)state=opening.next;closeOpening();
    const message=/[ぁ-んァ-ン一-龯]/.test(e.message)?e.message:"通信サーバーにつながりませんでした。回線を確認して、もう一度試してね。";
    if(!state){$("room-status").textContent=message;setupUI();}
    else{$("wire-error").textContent=message;$("wire-alert").hidden=false;if(state.phase==="finished"&&!travel&&!frames.length)showResult();else render();}
  };
  try{
    const match=await createSugorokuMatch({role:roomRole,roomCode:code,character,
      onView(next,meta){if(attempt===generation)acceptOnline(next,meta);},
      onStatus(status){if(attempt!==generation)return;sending=status==="sending";if(state){if(state.phase==="finished"&&!travel&&!frames.length)showResult();else render();}},
      onError:failed});
    if(attempt!==generation){match.close();return;}
    net=match;subscribed=true;
    if(!state){$("room-status").textContent=roomRole==="host"?"相手が入るのを待っているよ。":"部屋を探しているよ…";setupUI();}
    else schedule();
  }catch(e){failed(e);}
}
function showResult(){
  $("game").hidden=true;$("result").hidden=false;
  const voted=connectedMode() && lastMeta?.votes[mySeat];
  $("rematch").disabled=Boolean(connectedMode()&&(voted||sending||broken));
  $("rematch").textContent=voted?"再戦の返事を待っています":sending?"送信中…":connectedMode()&&lastMeta?.votes[1-mySeat]?"相手ともう一度あそぶ":"もう一度あそぶ";
  const ranks=rankPlayers(state),winner=state.players[ranks[0].seat];
  $("winner").textContent=hero(winner).name+"が、たね"+winner.seeds+"個で優勝！";
  $("ranking").innerHTML=ranks.map(r=>{const p=state.players[r.seat];return '<div class="rank"><b>'+r.rank+'位</b>'+face(p.character)+'<div><b>'+hero(p).name+'</b><small>'+tag(p,r.seat)+'・ゴール'+p.finish+'着（＋'+p.finishBonus+'個）'+(p.exactBonus?'<br>ゴールぴったり ＋5個':'')+'</small></div><strong>たね '+p.seeds+'個</strong></div>';}).join("");
  window.scrollTo(0,0);
}
function openDialog(title,markup){$("dialog").classList.remove("chart-dialog");if(!connectedMode())clearTimeout(timer);$("dialog-title").textContent=title;$("dialog-body").innerHTML=markup;$("dialog").showModal();}
function journal(){
  if(!state)return;
  if(state.phase==="finished"){openDialog("レース記録",raceChart(state));$("dialog").classList.add("chart-dialog");return;}
  const entries=state.log.slice().reverse().map(m=>'<div class="journal-entry"><b>'+hero(state.players[m.seat]).name+' ／ '+(m.doubles?'ゾロ目 '+m.dice.join('＋')+'＝':'出目 ')+m.die+'</b>'+outcome(m)+'</div>').join("");
  openDialog("レース記録",entries||"<p>スタートしたばかり。最初のサイコロを振ろう。</p>");
}
function brief(next){
  if($("briefing").open)return;
  beginAfterBrief=next;$("briefing").showModal();
}
$("brief-back").onclick=()=>$("briefing").close();
$("briefing").addEventListener("close",()=>{beginAfterBrief=null;});
$("brief-ok").onclick=()=>{const next=beginAfterBrief;beginAfterBrief=null;$("briefing").close();next?.();};
$("rules-open").onclick=()=>openDialog("あそびかた",'<p><b>全員が3周（48マス）してゴールしたら、たねが最多の人が優勝！</b> 同数なら先にゴールした人が上位。</p><p>最初の人はルーレットで決定。その人からルーレット上を左回りに交代するよ。対戦中の一覧も①〜④の手番順です（コマは盤面を時計回りに進みます）。通信の再戦は前回の次の人が最初になります。</p><ol class="rules-list"><li>たね5個で出発。サイコロを2個振り、好きなサイコロをタップ。その目だけ時計回りに進む。ゾロ目は合計の数だけ自動で進むよ（4と4なら8マス）。</li><li>たねマスは＋1・＋2・＋3・＋4個。マスに書かれた数を、止まるたびにもらえるよ。誰が先に着いても変わらない。</li><li>★では自分でサイコロを1個振ってチャレンジ！ 奇数（1・3・5）ならたね＋6個、偶数（2・4・6）ならたね−3個。移動はせず、たねだけが増減するよ。0個より少なくはならない。</li><li>近道はさらに3マス。移動先の効果は追加されないよ。空マスは何も起こらない。</li><li>毎周、ゴールマスにぴったり止まるとたね＋5個（1・2周目も対象）。通り過ぎるだけなら加算なし。3周目はさらに到着順で12・8・4・2個。大きい目で越えてもゴールできるよ。</li></ol><p>ひとりはCPU3匹、ふたりはCPU2匹。通信はキーワードで合流し、再戦はふたりの同意で始まります。</p>');
$("journal-open").onclick=journal;$("result-journal").onclick=journal;
$("leave").onclick=()=>{openDialog("最初に戻る？","<p>このレースはここで終了します。</p><button id='end-match' class='primary'>対局を終えて戻る</button>");$("end-match").onclick=()=>{toSetup();$("dialog").close();};};
$("start").onclick=()=>{
  if(busy)return;
  if(connectedMode() && roomRole==="guest" && !/^HAMU-[A-Z2-9]{6}$/.test(normalizeRoomCode($("room-input").value))){
    $("room-status").textContent="相手のキーワードを入力してね。";return;
  }
  brief(()=>connectedMode()?connectRoom():startGame());
};
$("rematch").onclick=()=>brief(()=>connectedMode()?net?.rematch():startGame());$("setup-again").onclick=toSetup;
$("close").onclick=()=>$("dialog").close();$("dialog").addEventListener("close",schedule);
$("speed").onclick=()=>{fast=!fast;paintInfo();schedule();};
window.addEventListener("takumegu-menu",e=>{menu=e.detail.open;schedule();});document.addEventListener("visibilitychange",schedule);

window.addEventListener("pagehide",()=>{if(connectedMode())toSetup();});
