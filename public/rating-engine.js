/* Sohail rating v4.4 — pure sporting model, shared by server and offline checks.
 * The public scale 1–16 is a LOCAL scale, not an official UTR or a win probability.
 * Every selected match has positive weight. Exactly the latest 50 per sports
 * identity (or all when fewer). No filtering by opponent level or age.
 * Scores use normal games plus a SEPARATE STB observation. Evidence/uncertainty
 * are conservative diagnostics, NOT calibrated confidence percentages/intervals.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.SohailRatingEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION='sohail-rating-4.4.0';
 const DEFAULTS=Object.freeze({window:50,scale:4,halfLifeDays:240,timeFloor:0.2,
  gameCorrelation:0.15,stbEvidence:0.35,prior:0.12,seedPrior:0.3,maxIterations:4000,tolerance:0.000001});
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
 const dict=()=>Object.create(null);
 const cmp=(a,b)=>a<b?-1:a>b?1:0;
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const text=v=>typeof v==='string'&&v.trim()?v.trim():null;
 const system=n=>n==='admin'||n==='superadmin';
 const identity=(league,name,u)=>JSON.stringify(text(u?.historialId||u?.jugadorId)?['profile',text(u.historialId||u.jugadorId)]:['league',league,name]);
 function dateKey(v){
  if(typeof v!=='string')return '';
  const a=v.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/),b=v.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(!a&&!b)return '';
  const y=+(a?a[1]:b[3]),m=+(a?a[2]:b[2]),d=+(a?a[3]:b[1]);
  if(y<1000||m<1||m>12||d<1||d>new Date(Date.UTC(y,m,0)).getUTCDate())return '';
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
 }
 const day=d=>dateKey(d)?Date.parse(dateKey(d)+'T00:00:00Z')/86400000:null;
 const pair=s=>Array.isArray(s)&&s.length===2&&s.every(x=>Number.isSafeInteger(x)&&x>=0&&x<=100);
 const full=s=>{const hi=Math.max(...s),lo=Math.min(...s);return hi===6&&lo<=4||hi===7&&(lo===5||lo===6);};
 const tb=s=>s&&(s[0]===1&&s[1]===0||s[0]===0&&s[1]===1);
 const names=m=>m.po?m.poNames:[m.aName,m.bName];
 class RatingError extends Error{constructor(code,message){super(message);this.code=code;}}
 function score(m){
  if(!m||m.status!=='confirmed'||m.np)return null;
  if(m.wo&&(!Array.isArray(m.sets)||!m.sets.length))return null;
  if(!Array.isArray(m.sets)||m.sets.length>3||!m.sets.every(pair))throw new RatingError('INVALID_SCORE','Hay un marcador confirmado inválido. No se publicó un cálculo incompleto.');
  const ss=m.sets,rawNames=names(m),ns=Array.isArray(rawNames)?rawNames:[],normal=ss.slice(0,2),third=ss[2];
  // A legacy full third set is real tennis too: do not convert it into one game.
  const isSTB=!!(third&&tb(third)),stb=isSTB?(third[0]>third[1]?0:1):null;
  if(third&&!isSTB){if(full(third))normal.push(third);else if(third[0]||third[1])throw new RatingError('INVALID_SCORE','Tercer set inválido; revisá el marcador.');}
  const gamesA=normal.reduce((s,x)=>s+x[0],0),gamesB=normal.reduce((s,x)=>s+x[1],0);
  if(gamesA+gamesB===0&&!isSTB)return null; // W.O. with no play does not estimate ability.
  let winner=null,issue=null;
  if(m.wo){
   // Matches with played games and wo=true are RET in this application.
   if(m.winner!=null&&!ns?.includes(m.winner)||m.retiroDe!=null&&!ns?.includes(m.retiroDe)||m.winner&&m.winner===m.retiroDe)issue='winner-unknown';
   else if(ns?.includes(m.winner))winner=ns.indexOf(m.winner);
   else if(ns?.includes(m.retiroDe))winner=1-ns.indexOf(m.retiroDe);
   else issue='winner-unknown';
  }else{
   const setsWon=normal.filter(full).reduce((n,s)=>n+(s[0]>s[1]?1:-1),0);
   const clean=normal.length>=2&&normal.every(full)&&normal.every(s=>s[0]+s[1]>0);
   if(clean&&normal.length===2&&setsWon===0&&isSTB)winner=stb;
   else if(clean&&normal.length===2&&Math.abs(setsWon)===2&&!isSTB)winner=setsWon>0?0:1;
   else if(clean&&normal.length===3&&Math.abs(setsWon)===1)winner=setsWon>0?0:1;
   else issue='winner-unknown';
  }
  return {gamesA,gamesB,stb,winner,retired:!!m.wo,issue};
 }
 function expected(a,b,scale=4){return 1/(1+10**(-(a-b)/scale));}
 function groupSeed(group,count){
  if(!Number.isSafeInteger(group)||group<1||!Number.isSafeInteger(count)||count<group)return null;
  return count===1?8.5:14-(group-1)/(count-1)*11;
 }
 function prepare(leagues){
  if(!Array.isArray(leagues))throw new RatingError('INVALID_DATA','Falta la lista de ligas.');
  const people=dict(),byLeague=dict(),found=new Map(),issues=[],leagueIds=new Set();
  // Canonical ordering, independent of the selected league or login display order.
  const sorted=leagues.slice().sort((a,b)=>cmp(a.id,b.id));
  function person(l,name){
   if(typeof name!=='string'||!name||name.length>200)throw new RatingError('INVALID_PLAYER','Jugador inválido en un resultado.');
   const u=own(l.users,name)?l.users[name]:{},key=identity(l.id,name,u);
   if(!own(people,key))people[key]={key,label:text(u.historialNombre)||name,aliases:[],sources:[],seeds:[],groupPrior:null,unlinked:!text(u.historialId||u.jugadorId)};
   const p=people[key];if(!p.aliases.includes(name))p.aliases.push(name);
   if(!p.sources.some(s=>s.leagueId===l.id&&s.name===name))p.sources.push({leagueId:l.id,name});
   byLeague[l.id][name]=key;
   return key;
  }
  for(const l of sorted){
   if(!l||typeof l.id!=='string'||!l.id||leagueIds.has(l.id)||!Array.isArray(l.matches))throw new RatingError('INVALID_DATA','Liga ausente o repetida.');
   leagueIds.add(l.id);byLeague[l.id]=dict();
   for(const name of Object.keys(l.users||{}).sort()){
    if(system(name))continue;
    const key=person(l,name),seed=l.seeds?.[name];
    if(typeof seed==='number'&&Number.isFinite(seed)&&seed>=1&&seed<=16)people[key].seeds.push({value:seed,leagueId:l.id});
   }
   l.matches.forEach((m,index)=>{
    if(!m||m.status!=='confirmed'||m.np)return;
    // A bye/W.O. with no play may legitimately have no second participant.
    // It is not an ability observation and must not block other played matches.
    let sc;try{sc=score(m);}catch(e){e.message+=' Liga: '+l.id+'; partido: '+String(m.id??index)+'.';throw e;}if(!sc)return;
    const ns=names(m);
    if(!Array.isArray(ns)||ns.length!==2||ns.some(n=>typeof n!=='string'||!n||system(n)))throw new RatingError('INVALID_PLAYER','Hay un resultado con juego sin dos jugadores válidos. Liga: '+l.id+'; partido: '+String(m.id??index)+'.');
    const a=person(l,ns[0]),b=person(l,ns[1]);
    if(a===b)throw new RatingError('SELF_MATCH','Una identidad deportiva figura en los dos lados de un partido. Liga: '+l.id+'; partido: '+String(m.id??index)+'. Revisá la fusión o el resultado.');
    if(m.id!=null&&!(typeof m.id==='string'||Number.isSafeInteger(m.id)))throw new RatingError('INVALID_MATCH_ID','Identificador de partido inválido en '+l.id+'.');
    const id=m.id==null?'row:'+index:'id:'+String(m.id),key=JSON.stringify([l.id,id]);
    const date=dateKey(m.date),p={key,leagueId:l.id,a,b,...sc,date,day:day(date),cycle:Number(m.cycle)||0,order:Number(l.order)||0,sourceIndex:index};
    // Deduplication by provenance ONLY. Equal scores/dates in different games survive.
    const signature=JSON.stringify({a,b,sets:m.sets,date,wo:!!m.wo,winner:m.winner??null,retiroDe:m.retiroDe??null,po:!!m.po,cycle:m.cycle??null,g:m.g??null});
    if(found.has(key)){
     if(found.get(key).signature!==signature)throw new RatingError('DUPLICATE_CONFLICT','Un ID de partido tiene resultados diferentes en la misma liga. Liga: '+l.id+'; partido: '+String(m.id??index)+'. Revisalo antes de recalcular.');
     return;
    }
    found.set(key,{signature,p});
    if(m.id==null)issues.push({code:'missing-id',match:key});
    if(!date)issues.push({code:'missing-date',match:key});
    if(sc.issue)issues.push({code:sc.issue,match:key});
    // Only the group at the FIRST RECORDED match, not activeN/current group.
    // This is a weak historical initial reference, not an official cross-league calibration.
    const count=l.cycles?.find(c=>Number(c.n)===Number(m.cycle))?.groups?.length;
    const gs=m.po?null:groupSeed(Number(m.g),count);
    if(gs!=null)for(const k of [a,b]){
     const prior={value:gs,date,order:p.order,cycle:p.cycle,key};
     const old=people[k].groupPrior;
     const orderPrior=(x,y)=>x.date&&y.date?cmp(x.date,y.date)||cmp(x.key,y.key):x.order-y.order||x.cycle-y.cycle||cmp(x.key,y.key);
     if(!old||orderPrior(prior,old)<0)people[k].groupPrior=prior;
    }
   });
  }
  for(const p of Object.values(people)){
   p.aliases.sort(cmp);p.sources.sort((a,b)=>cmp(a.leagueId,b.leagueId)||cmp(a.name,b.name));
   const ss=Array.from(new Set(p.seeds.map(x=>x.value)));
   p.seedConflict=ss.length>1;
   p.seed=ss.length===1?ss[0]:null;
   p.prior=p.seed??p.groupPrior?.value??8;
   p.priorSource=p.seed!=null?'manual-consistent':p.groupPrior?'first-recorded-group':'neutral';
   if(p.seedConflict)issues.push({code:'seed-conflict',person:p.key});
  }
  const matches=Array.from(found.values(),x=>x.p).sort((a,b)=>{
   // Unknown dates remain unknown, sorted before known dates (same policy as old window).
   return cmp(a.date,b.date)||a.order-b.order||a.cycle-b.cycle||cmp(a.key,b.key);
  });
  return {people,byLeague,matches,issues};
 }
 function calculate(data,options={}){
  const cfg={...DEFAULTS,...options};
  if(cfg.window!==50)throw new RatingError('INVALID_WINDOW','El modelo conserva 50 partidos por persona.');
  for(const k of ['scale','halfLifeDays','prior','maxIterations','tolerance'])if(!Number.isFinite(cfg[k])||cfg[k]<=0)throw new RatingError('INVALID_CONFIG','Parámetro inválido: '+k);
  if(!Number.isFinite(cfg.timeFloor)||cfg.timeFloor<=0||cfg.timeFloor>1||!Number.isFinite(cfg.gameCorrelation)||cfg.gameCorrelation<0||cfg.gameCorrelation>=1||!Number.isFinite(cfg.stbEvidence)||cfg.stbEvidence<=0||!Number.isFinite(cfg.seedPrior)||cfg.seedPrior<0)throw new RatingError('INVALID_CONFIG','Pesos inválidos.');
  const {people,matches}=data,totalCounts=dict();for(const m of matches){totalCounts[m.a]=(totalCounts[m.a]||0)+1;totalCounts[m.b]=(totalCounts[m.b]||0)+1;}
  const keys=Object.keys(people).sort(cmp),rows=dict(),R=dict(),latest=dict();
  for(const k of keys){rows[k]=[];R[k]=people[k].prior;latest[k]=null;}
  for(let i=matches.length-1;i>=0;i--){const m=matches[i];for(const [k,rival,side]of [[m.a,m.b,0],[m.b,m.a,1]]){
   if(rows[k].length>=50)continue;
   rows[k].push({m,rival,side,rank:rows[k].length});
   if(m.day!=null)latest[k]=Math.max(latest[k]??m.day,m.day);
  }}
  const counts=dict();for(const k of keys)counts[k]=rows[k].length;
  const slope=Math.LN10/cfg.scale,lambda=dict();
  for(const k of keys){
   lambda[k]=cfg.prior+(people[k].seed!=null?cfg.seedPrior/(1+counts[k]/5):0);
   for(const e of rows[k]){
    const m=e.m,g=m.gamesA+m.gamesB;
    const age=m.day!=null&&latest[k]!=null?Math.max(0,latest[k]-m.day):null;
    const time=age==null?Math.max(cfg.timeFloor,0.97**e.rank):Math.max(cfg.timeFloor,2**(-age/cfg.halfLifeDays));
    // Finite games within one match are correlated; more games still add evidence.
    const games=g?g/(1+(g-1)*cfg.gameCorrelation):0;
    // Opponent evidence is bounded AWAY from zero; new opponents still count.
    const opponent=0.6+0.4*Math.min(1,counts[e.rival]/15);
    e.weight=time*opponent;e.gamesEvidence=games;e.stbEvidence=m.stb==null?0:cfg.stbEvidence;
    e.gameShare=g?(e.side?m.gamesB:m.gamesA)/g:0.5;
    e.stbShare=m.stb===e.side?1:0;
   }
  }
  let converged=false,iterations=0,maxChange=Infinity;
  // Damped simultaneous Newton fixed point of each player's weighted score equation.
  // Side-specific windows preserve 50 for A even when that match is outside B's 50.
  // A weak positive prior anchors the local scale and makes no-result/separated cases finite.
  for(let it=0;it<cfg.maxIterations;it++){
   iterations=it+1;maxChange=0;const next=dict();
   for(const k of keys){
    let grad=lambda[k]*(people[k].prior-R[k]),precision=lambda[k];
    for(const e of rows[k]){
     const p=expected(R[k],R[e.rival],cfg.scale),a=e.gamesEvidence,b=e.stbEvidence;
     grad+=e.weight*slope*(a*(e.gameShare-p)+b*(e.stbShare-p));
     precision+=e.weight*slope*slope*(a+b)*p*(1-p);
    }
    next[k]=clamp(R[k]+0.65*clamp(grad/precision,-1,1),1,16);
    maxChange=Math.max(maxChange,Math.abs(next[k]-R[k]));
   }
   for(const k of keys)R[k]=next[k];
   if(maxChange<cfg.tolerance){converged=true;break;}
  }
  if(!converged)throw new RatingError('NO_CONVERGENCE','El cálculo no convergió. Se conserva el cálculo completo anterior.');
  // Connected components of the actually used comparison network.
  const parent=dict();for(const k of keys)parent[k]=k;
  function root(k){while(parent[k]!==k){parent[k]=parent[parent[k]];k=parent[k];}return k;}
  for(const k of keys)for(const e of rows[k]){const a=root(k),b=root(e.rival);if(a!==b)parent[cmp(a,b)>0?a:b]=cmp(a,b)>0?b:a;}
  const sizes=dict();for(const k of keys){const r=root(k);sizes[r]=(sizes[r]||0)+1;}
  const activeComponents=new Set(keys.filter(k=>counts[k]>0).map(root));
  const asOf=dateKey(options.asOf)||new Date().toISOString().slice(0,10),asDay=day(asOf),info=dict(),allIssues=data.issues.slice();
  for(const m of matches)if(m.day!=null&&m.day>asDay)allIssues.push({code:'future-date',match:m.key});
  for(const k of keys){
   const list=rows[k],p=people[k],rivals=new Map();let wins=0,losses=0,unknown=0,gA=0,gB=0,stbWins=0,stbLosses=0,weightSum=0,weightSquares=0,evidence=0,dated=0,rivalSum=0,residual=0,retirements=0;
   for(const e of list){
    const m=e.m;if(m.winner==null)unknown++;else if(m.winner===e.side)wins++;else losses++;
    gA+=e.side?m.gamesB:m.gamesA;gB+=e.side?m.gamesA:m.gamesB;
    if(m.stb!=null){if(m.stb===e.side)stbWins++;else stbLosses++;}
    if(m.retired)retirements++;
    if(m.day!=null&&m.day<=asDay)dated++;
    const w=e.weight*(e.gamesEvidence+e.stbEvidence);evidence+=w;weightSum+=w;weightSquares+=w*w;
    rivals.set(e.rival,(rivals.get(e.rival)||0)+w);rivalSum+=R[e.rival];
    residual+=w*(e.gameShare-expected(R[k],R[e.rival],cfg.scale))**2;
   }
   const n=list.length,nEff=weightSquares?weightSum**2/weightSquares:0;
   const div=weightSum?1/Array.from(rivals.values()).reduce((s,w)=>s+(w/weightSum)**2,0):0;
   const inactiveDays=latest[k]==null?null:Math.max(0,asDay-latest[k]);
   const activity=inactiveDays==null?0.6:Math.max(0.25,2**(-inactiveDays/730));
   const coverage=n?0.6+0.4*dated/n:0;
   const stability=weightSum?1/(1+2*Math.sqrt(residual/weightSum)):0;
   const confidence=clamp(Math.round(95*(1-Math.exp(-nEff/15))*(0.4+0.6*Math.min(1,div/8))*Math.min(1,evidence/80)*coverage*activity*(0.8+0.2*stability)),0,95);
   info[k]={rating:R[k],ratingCalculado:R[k],partidos:n,totalMatches:totalCounts[k]||0,
    provisional:n<15||confidence<55,fiab:confidence,confidence:confidence>=70?'high':confidence>=40?'medium':'low',
    seed:p.seed,prior:p.prior,priorSource:p.priorSource,seedConflict:p.seedConflict,
    vict:wins,der:losses,unresolved:unknown,gGanados:gA,gPerdidos:gB,pctGames:gA+gB?gA/(gA+gB):null,
    stbWins,stbLosses,retirements,nivelRivales:n?rivalSum/n:null,uniqueOpponents:rivals.size,
    effectiveMatches:nEff,evidence,diversity:div,missingDates:list.filter(e=>e.m.day==null).length,futureDates:list.filter(e=>e.m.day!=null&&e.m.day>asDay).length,lastPlayed:latest[k]==null?null:new Date(latest[k]*86400000).toISOString().slice(0,10),inactiveDays,
    unlinked:p.unlinked,component:root(k),componentSize:sizes[root(k)],isolated:activeComponents.size>1,
    // Full provenance of the selected window, without contacts or credentials.
    selected:list.map(e=>({key:e.m.key,leagueId:e.m.leagueId,date:e.m.date,weight:e.weight,gamesEvidence:e.gamesEvidence,stbEvidence:e.stbEvidence}))};
  }
  return {version:VERSION,asOf,window:50,info,byLeague:data.byLeague,people,
   issues:allIssues,matchCount:matches.length,componentCount:activeComponents.size,converged,iterations,maxChange};
 }
 return Object.freeze({VERSION,DEFAULTS,identity,dateKey,score,expected,groupSeed,prepare,calculate,RatingError});
});
