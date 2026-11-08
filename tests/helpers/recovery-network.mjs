// Deterministic SDK-shaped network: real production transport and game adapters
// run above it. Packet loss, missing presence, channel errors and time advance
// remain controllable without calling Supabase from node tests.
export function recoveryNetwork() {
  let time=100000, nextTimer=0;
  const jobs=new Map(), endpoints=[], packets=[];
  const turns=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
  const timers={
    setInterval(fn,ms){const id=++nextTimer;jobs.set(id,{fn,ms,next:time+ms});return id;},
    clearInterval(id){jobs.delete(id);},
  };
  const now=()=>time;
  const all=()=>endpoints.flatMap(e=>e.channels).filter(c=>!c.removed&&c.member&&c.endpoint.up);
  function sync(){for(const c of all())queueMicrotask(()=>c.handlers.get("presence:sync")?.({}));}
  function endpoint() {
    const e={up:true,silent:false,failJoins:0,failTracks:0,channels:[],drops:[],loads:0,closed:0,events:new EventTarget()};endpoints.push(e);
    e.factory=()=>({realtime:{disconnect(){}},channel(name){
      const c={endpoint:e,name,member:null,removed:false,handlers:new Map(),
        on(type,{event},fn){c.handlers.set(type+":"+event,fn);return c;},
        subscribe(fn){c.status=fn;queueMicrotask(()=>fn(!e.up||e.failJoins-->0?"CHANNEL_ERROR":"SUBSCRIBED"));return c;},
        async track(p){if(!e.up||e.failTracks-->0)return "timed out";c.member=p;sync();return "ok";},
        presenceState(){return {room:all().filter(t=>t.name===name).map(t=>t.member)};},
        async send(m){
          packets.push({from:endpoints.indexOf(e),...structuredClone(m)});
          if(!e.up||c.removed)return "timed out";
          const drop=e.drops.indexOf(m.payload.type??m.payload.kind);
          if(drop>=0){e.drops.splice(drop,1);return "ok";}
          if(e.silent)return "ok";
          for(const other of all())if(other!==c&&other.name===name&&!other.endpoint.silent){
            queueMicrotask(()=>{if(!other.removed&&other.endpoint.up)other.handlers.get("broadcast:"+m.event)?.({payload:structuredClone(m.payload)});});
          }
          return "ok";
        },
      };e.channels.push(c);return c;
    },async removeChannel(c){c.removed=true;c.member=null;e.closed++;sync();return "ok";}});
    e.down=()=>{e.up=false;e.events.dispatchEvent(new Event("offline"));for(const c of e.channels)if(!c.removed)c.status?.("CHANNEL_ERROR");sync();};
    e.upAgain=()=>{e.up=true;e.events.dispatchEvent(new Event("online"));sync();};
    return e;
  }
  async function tick(ms=500){const end=time+ms;while(time<end){time=Math.min(end,time+100);for(const [id,j]of [...jobs])if(j.next<=time&&jobs.has(id)){j.next+=j.ms;j.fn();}await turns();}await turns();}
  return {endpoint,endpoints,timers,now,tick,turns,packets,jobs,sync,jump(ms){time+=ms;}};
}
export const quietNotice=()=>({show(){},hide(){},dispose(){}});
