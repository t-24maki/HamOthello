import { portrait } from "../baccarat/art.js?v=20261024-baccarat4";
import { CAST } from "./rules.js?v=20261107-roundgraph1";
const drawings={
 bridge:'<path d="M2 19q12-11 24 0v5q-12-10-24 0z" fill="#98baa6"/><path d="M3 18v-7m6 5v-8m10 8V8m6 10v-7M3 12q11-7 22 0"/>',
 home:'<path d="m3 13 11-9 11 9-2 1v10H5V14z" fill="#e8c390"/><path d="m2 13 12-10 12 10" stroke="#995d50" stroke-width="3"/><path d="M12 17h5v7h-5z" fill="#9f8062"/>',
 seed:'<path d="M14 2C5 7 3 18 10 24c2 2 6 2 8 0C25 18 23 7 14 2Z" fill="#edc77c"/><path d="M14 5v17M10 8l-1 9m9-9 1 9" stroke="#a18149"/>',
 chance:'<path d="m14 1 4 8 9 2-7 6 1 10-7-5-8 5 2-10-7-6 9-2z" fill="#dac4e6"/><path d="M11 10q1-4 5-2 4 3-1 6v2M15 20h0" stroke="#87699d" stroke-width="2.5"/>',
};
export const icon=(id)=>'<svg class="pict" viewBox="0 0 28 28" aria-hidden="true" fill="none" stroke="#776552" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+drawings[id]+'</svg>';
export const face = index => portrait(CAST[index].id, "neutral");
const dots={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
export const die = n => '<span aria-hidden="true" class="die">'+Array.from({length:9},(_,i)=>'<i class="'+(dots[n]?.includes(i)?'ink':'')+'"></i>').join('')+'</span>';

// Six pipped faces on a physical cube. The front always shows the confirmed die.
export function cube(n) {
  const side=[1,2,3,4,5,6].filter(v=>v!==n&&v!==7-n);
  return '<span class="die-physical" aria-hidden="true"><span class="die-shadow"></span><span class="die-flight"><span class="cube-space"><span class="cube">'+[n,7-n,side[0],7-side[0],side[1],7-side[1]].map((v,i)=>'<span class="facet f'+i+'">'+die(v)+'</span>').join("")+'</span></span></span></span>';
}
