import {CAST} from "./rules.js?v=20261107-roundgraph1";

// Sample all balances together after everyone still playing has had one turn.
// Track seats, not log length: finished players no longer receive turns.
export function roundSeedHistory(s){
  const rows=s.players.map((p,seat)=>({seat,character:p.character,values:[5],finishRound:null}));
  const balances=rows.map(()=>5),active=new Set(rows.map(r=>r.seat));
  let pending=new Set(active);
  for(let i=0;i<s.log.length;i++){
    if(s.phase==="challenge"&&i===s.log.length-1)break;
    const m=s.log[i];
    balances[m.seat]=m.seedAfter;
    if(m.finish!==null){
      active.delete(m.seat);
      rows[m.seat].finishRound=rows[m.seat].values.length;
    }
    pending.delete(m.seat);
    if(pending.size===0){
      rows.forEach(r=>r.values.push(balances[r.seat]));
      pending=new Set(active);
    }
  }
  return rows;
}
const dashes=["","8 4","2 4","9 3 2 3"];
// Chart-only colors: keep character artwork and the game board unchanged.
const colors=["#6841b0","#0072b2","#c44e00","#008060"];
function marker(character,x,y){
  if(character===1)return '<rect x="'+(x-3.5)+'" y="'+(y-3.5)+'" width="7" height="7"/>';
  if(character===2)return '<path d="M'+x+' '+(y-4.5)+'l4.5 8h-9z"/>';
  if(character===3)return '<path d="M'+x+' '+(y-4.5)+'l4.5 4.5-4.5 4.5-4.5-4.5z"/>';
  return '<circle cx="'+x+'" cy="'+y+'" r="3.8"/>';
}
export function raceChart(s){
  const rows=roundSeedHistory(s),rounds=rows[0].values.length-1;
  const labels=Array.from({length:rounds+1},(_,i)=>i?i+'巡目':'出発');
  const max=Math.max(10,...rows.flatMap(r=>r.values));
  const step=Math.max(5,Math.ceil(max/25)*5),top=Math.ceil(max/step)*step;
  // Use whole, uniform intervals. A typical race labels every single round.
  const tickStep=rounds<=12?1:rounds<=24?2:5;
  const axisEnd=Math.max(tickStep,Math.ceil(rounds/tickStep)*tickStep);
  const x=i=>42+i*288/axisEnd,y=v=>198-v/top*170;
  const ticks=Array.from({length:axisEnd/tickStep+1},(_,i)=>i*tickStep);
  const grid=Array.from({length:top/step+1},(_,i)=>i*step).map(v=>'<g class="chart-grid"><line x1="42" x2="330" y1="'+y(v)+'" y2="'+y(v)+'"/><text x="33" y="'+(y(v)+4)+'" text-anchor="end">'+v+'</text></g>').join("");
  const summary=rows.map(r=>CAST[r.character].name+'：'+r.values.map((v,i)=>labels[i]+' '+v+'個'+(i===r.finishRound?'（ゴール）':'')).join('、')).join('。');
  const lines=rows.map(r=>{
    const c=CAST[r.character],color=colors[r.character],points=r.values.map((v,i)=>({x:x(i),y:y(v),v,i}));
    return '<g class="chart-series" data-seat="'+r.seat+'" fill="'+color+'" stroke="'+color+'"><polyline fill="none" stroke-width="2.5" stroke-dasharray="'+dashes[r.character]+'" points="'+points.map(p=>p.x+','+p.y).join(' ')+'"/>'+points.filter(p=>p.i!==r.finishRound).map(p=>'<g stroke="#fffaf1" stroke-width="1"><title>'+c.name+'・'+labels[p.i]+'：'+p.v+'個</title>'+marker(r.character,p.x,p.y)+'</g>').join('')+'</g>';
  }).join("");
  // Paint the enlarged goal markers last so another line cannot cover them.
  const finishes=rows.filter(r=>r.finishRound!==null&&r.finishRound<=rounds).map(r=>{
    const i=r.finishRound,v=r.values[i];
    return '<g class="chart-finish" data-seat="'+r.seat+'" data-round="'+i+'" transform="translate('+x(i)+' '+y(v)+') scale(2)" fill="'+colors[r.character]+'" stroke="#fffaf1" stroke-width="1"><title>'+CAST[r.character].name+'・'+i+'巡目にゴール：'+v+'個</title>'+marker(r.character,0,0)+'</g>';
  }).join('');
  const legend=rows.map(r=>{const c=CAST[r.character],color=colors[r.character];return '<li><svg viewBox="0 0 36 12" aria-hidden="true"><g stroke="'+color+'" fill="'+color+'"><path d="M1 6h34" stroke-width="2.5" stroke-dasharray="'+dashes[r.character]+'"/>'+marker(r.character,18,6)+'</g></svg>'+c.name+'</li>';}).join('');
  const table='<details class="chart-values"><summary>毎巡の数値を見る</summary><table><caption>全員の手番が一巡した時点のたね（個）</caption><thead><tr><th scope="col">巡目</th>'+rows.map(r=>'<th scope="col">'+CAST[r.character].short+'</th>').join('')+'</tr></thead><tbody>'+labels.map((label,i)=>'<tr><th scope="row">'+label+'</th>'+rows.map(r=>'<td>'+r.values[i]+'</td>').join('')+'</tr>').join('')+'</tbody></table></details>';
  return '<div class="race-record"><svg class="record-chart" viewBox="0 0 360 260" role="img" aria-labelledby="chart-title chart-description"><title id="chart-title">4匹のたねと巡目の折れ線グラフ</title><desc id="chart-description">'+summary+'</desc><text class="chart-axis-title" x="8" y="15">たね（個）</text>'+grid+lines+finishes+ticks.map(i=>'<text class="chart-round" text-anchor="middle" x="'+x(i)+'" y="221">'+i+'</text>').join('')+'<text class="chart-axis-title" text-anchor="middle" x="186" y="246">巡目</text></svg><ul class="chart-legend">'+legend+'</ul><p class="chart-note">全員の手番が一巡するごとに記録。<br>大きな点はゴール。その後のたね数は変わりません。</p>'+table+'</div>';
}
