'use strict';
// Public, read-only sporting projection. NEVER send the state or a user record.
// Reached through GET /api/users?consulta=ligas|resultados (no new Vercel Function).
const lib=require('./_lib');
const Score=require('../public/score-rules');
const TTL=20000,MAX_CACHE=16,cache=new Map(),pending=new Map();
const fail=(status,code,message)=>Object.assign(new Error(message),{status,code});
const text=(s,max=160)=>typeof s==='string'?s.slice(0,max):'';
const number=n=>typeof n==='number'&&Number.isFinite(n)?n:0;
const has=(o,k)=>!!o&&Object.prototype.hasOwnProperty.call(o,k);
function published(entry){return !!entry&&lib.ligaIdOK(entry.id)&&['activa','finalizada'].includes(entry.estado);}
function directory(index){return (Array.isArray(index)?index:[]).filter(published).slice().sort((a,b)=>
 Number(b.estado==='activa')-Number(a.estado==='activa')||number(b.orden)-number(a.orden)
 ).map(e=>({id:e.id,name:text(e.nombre),status:e.estado}));}
function pointsFor(state,gid,pos){
 const a=state.PUNTOS?.[gid];
 return number(a?.[pos]!==undefined?a[pos]:a?.length?(a[a.length-1]||1):Math.max(1,5-pos));
}
function destination(state,cycle,gid,name,pos){
 const chosen=cycle.status==='finished'&&cycle.zeroPointDecision?.accepted===true?
  cycle.zeroPointDecision.assignments?.find(r=>r.group===gid&&r.name===name)?.destination:null;
 const d=chosen||state.DESTINO?.[gid]?.[pos]||'';
 return typeof d==='string'&&/^G[1-9]\d{0,3}$/.test(d)?Number(d.slice(1)):null;
}
function matchResult(m){
 const a=m.po?m.poNames?.[0]:m.aName,b=m.po?m.poNames?.[1]:m.bName;
 if(typeof a!=='string'||!a||typeof b!=='string'||!b)return null;
 const sets=Array.isArray(m.sets)?m.sets.filter(s=>Array.isArray(s)&&s.length===2&&s.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=99)).map(s=>[s[0],s[1]]):[];
 const isWO=m.wo===true&&sets.length===0;
 const kind=m.np===true?'not-played':isWO?'walkover':m.wo===true?'retired':'played';
 let winner='';
 if(m.wo===true){if(m.winner===a||m.winner===b)winner=m.winner;}
 else if(!m.np&&sets.length){let aw=0,bw=0;for(const [x,y]of sets){if(x>y)aw++;else if(y>x)bw++;}if(aw!==bw)winner=aw>bw?a:b;}
 return {a:text(a),b:text(b),sets:kind==='not-played'?[]:sets,kind,winner:text(winner),
  date:typeof m.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(m.date)?m.date:'',club:text(m.club,100)};
}
function project(state,entry,now=Date.now()){
 if(!published(entry))throw fail(404,'LEAGUE_NOT_PUBLIC','La liga no está disponible para consulta.');
 if(!state||!Array.isArray(state.cycles)||!Array.isArray(state.matches)||typeof Score.standings!=='function')
  throw fail(503,'PUBLIC_RESULTS_UNAVAILABLE','No se pudieron preparar los resultados.');
 const allCycles=state.cycles,users=state.users||{};
 const visible=allCycles.filter(c=>c&&Number.isSafeInteger(c.n)&&c.n>0&&['active','finished'].includes(c.status)&&Array.isArray(c.groups));
 const allowedCycles=new Set(visible.map(c=>c.n));
 const confirmed=state.matches.filter(m=>m&&m.status==='confirmed'&&(m.po?state.playoff?.started===true:allowedCycles.has(m.cycle)));
 const totals=new Map(),byCycle=new Map();
 function add(name,n,value){totals.set(name,(totals.get(name)||0)+value);if(!byCycle.has(name))byCycle.set(name,new Map());const pc=byCycle.get(name);pc.set(n,(pc.get(n)||0)+value);}
 const cycles=visible.map(c=>({n:c.n,status:c.status,groups:c.groups.map((g,gi)=>{
  const gid=gi+1;
  // The same deterministic scoring engine as the authenticated group table.
  const rows=Score.standings(c.n,gid,allCycles,confirmed).map((s,pos)=>{
   const base=pointsFor(state,gid,pos),extra=pos===0?2:0;
   const adjustment=number(state.AJUSTES_PUNTOS?.[c.n]?.[gid]?.[s.name]);
   const total=base+extra+adjustment;add(s.name,c.n,total);
   return {name:text(s.name),position:pos+1,destination:destination(state,c,gid,s.name,pos),points:number(s.pts),
    played:number(s.g)+number(s.p),wins:number(s.g),losses:number(s.p),notPlayed:number(s.nj),
    setsWon:number(s.sg),setsLost:number(s.sp),setsBalance:number(s.sg)-number(s.sp),base,extra,adjustment,total};
  });
  const names=new Set(Array.isArray(g?.players)?g.players:[]);
  return {number:gid,rows,results:confirmed.filter(m=>!m.po&&m.cycle===c.n&&m.g===gid&&names.has(m.aName)&&names.has(m.bName)).map(matchResult).filter(Boolean)};
 })}));
 for(const c of visible){for(const [name,v]of Object.entries(state.AJUSTES_PUNTOS?.[c.n]?.[0]||{}))if(has(users,name)&&number(v))add(name,c.n,number(v));}
 const latest=Math.max(0,...visible.filter(c=>[...byCycle.values()].some(pc=>pc.has(c.n))).map(c=>c.n));
 const active=visible.find(c=>c.n===state.activeN)||visible[visible.length-1];
 function groupOf(name){const i=active?.groups.findIndex(g=>Array.isArray(g?.players)&&g.players.includes(name))??-1;return i<0?999:i+1;}
 const ranked=[...totals.keys()].sort((a,b)=>Number(!!users[a]?.inactive)-Number(!!users[b]?.inactive)||
  totals.get(b)-totals.get(a)||(byCycle.get(b)?.get(latest)||0)-(byCycle.get(a)?.get(latest)||0)||groupOf(a)-groupOf(b));
 const standings=ranked.map((name,i)=>({position:i+1,name:text(name),group:groupOf(name)===999?null:groupOf(name),
  total:totals.get(name),cycles:visible.map(c=>({n:c.n,points:byCycle.get(name)?.get(c.n)||0}))}));
 const out={schema:1,readOnly:true,league:{id:entry.id,name:text(entry.nombre),status:entry.estado},
  activeCycle:active?.n||null,cycles,standings,playoffResults:confirmed.filter(m=>m.po).map(matchResult).filter(Boolean),
  consultedAt:new Date(now).toISOString()};
 // Cache/output size is bounded. The private state is never cached in this module.
 if(Buffer.byteLength(JSON.stringify(out))>2*1024*1024)throw fail(413,'PUBLIC_RESULTS_LIMIT','La consulta es demasiado grande. Contactá a la organización.');
 return out;
}
async function handler(req,res){
 if(req.method!=='GET')throw fail(405,'METHOD_NOT_ALLOWED','La consulta solo permite lectura.');
 const q=req.query||{};
 if(!['ligas','resultados'].includes(q.consulta)||Object.keys(q).some(k=>!['consulta','liga'].includes(k))||
  (q.consulta==='ligas'&&q.liga!==undefined)||(q.consulta==='resultados'&&!lib.ligaIdOK(q.liga)))
  throw fail(400,'INVALID_PUBLIC_QUERY','Elegí una liga válida para consultar.');
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Robots-Tag','noindex, nofollow');
 const index=await lib.readLigaIndex();
 if(q.consulta==='ligas')return res.status(200).json({readOnly:true,leagues:directory(index)});
 // Check publication on EVERY request, even a cached response. No fallback league.
 const entry=index.find(e=>e.id===q.liga&&published(e));
 if(!entry)throw fail(404,'LEAGUE_NOT_PUBLIC','La liga no está disponible para consulta.');
 const key=JSON.stringify([entry.id,entry.nombre,entry.estado]),hit=cache.get(key),now=Date.now();
 if(hit&&now-hit.at<TTL)return res.status(200).json(hit.data);
 if(!pending.has(key)){
  if(pending.size>=MAX_CACHE)throw fail(503,'PUBLIC_RESULTS_BUSY','Hay varias consultas en curso. Reintentá en unos segundos.');
  pending.set(key,(async()=>{
   const state=await lib.readState(entry.id);if(!state)throw fail(404,'PUBLIC_RESULTS_EMPTY','Esta liga todavía no tiene resultados publicados.');
   const data=project(state,entry);if(cache.size>=MAX_CACHE)cache.delete(cache.keys().next().value);
   cache.set(key,{at:Date.now(),data});return data;
  })().finally(()=>pending.delete(key)));
 }
 return res.status(200).json(await pending.get(key));
}
module.exports={handler,project,directory,pointsFor,matchResult};
