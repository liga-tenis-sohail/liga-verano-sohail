'use strict';
/* Offline, reproducible comparison of production vs frozen v4.4. No writes to the
 * league, no HTTP and no credential fields retained in the projection.
 * Global date blocks allow VERIFIED identity links to connect all input leagues.
 * 70/30 split by dates within each league; both models see strictly prior dates.
 * Historical identity links are retrospective metadata, not proof they existed
 * on the match date. Unknown dates remain in production but cannot be evaluated
 * chronologically without inventing their order. Never use today's manual seeds.
 */
const fs=require('node:fs'),path=require('node:path');
const E=require('../public/rating-engine');
const base=require('../tests/support/rating-v440.cjs');
const {project,fitWinScale,metrics}=require('./benchmark-rating.cjs');
function evaluate(input,{phase='all',options={}}={}){
 if(!['all','development'].includes(phase))throw Error('Invalid evaluation phase');
 const leagues=project(input),all=E.prepare(leagues),cutoffs=new Map();
 for(const l of leagues){
  const dates=[...new Set(all.matches.filter(m=>m.leagueId===l.id&&m.date).map(m=>m.date))].sort();
  cutoffs.set(l.id,dates[Math.max(1,Math.floor(dates.length*0.7))]||'9999-12-31');
 }
 const dates=[...new Set(all.matches.map(m=>m.date).filter(Boolean))].sort(),rows=[];
 for(const date of dates){
  const targets=all.matches.filter(m=>m.date===date&&(phase!=='development'||date<cutoffs.get(m.leagueId)));
  if(!targets.length)continue;
  const past=E.prepare(leagues.map(l=>({...l,matches:l.matches.filter(m=>E.dateKey(m.date)&&E.dateKey(m.date)<date)})));
  const a=base.calculate(past,{asOf:date}),b=E.calculate(past,{...options,asOf:date});
  for(const m of targets){
   const g=m.gamesA+m.gamesB;if(!g)continue;
   const oldA=a.info[m.a]?.ratingCalculado??8,oldB=a.info[m.b]?.ratingCalculado??8;
   const newA=b.info[m.a]?.ratingCalculado??8,newB=b.info[m.b]?.ratingCalculado??8;
   rows.push({date,league:m.leagueId,split:date<cutoffs.get(m.leagueId)?'development':'holdout',
    games:m.gamesA/g,winner:m.winner==null?null:m.winner===0?1:0,
    oldGames:base.expected(oldA,oldB),newGames:E.expected(newA,newB,options.scale||E.DEFAULTS.scale),oldDiff:oldA-oldB,newDiff:newA-newB,
    type:m.retired?'retirement':m.stb!=null?'stb':'normal',
    cold:(a.info[m.a]?.partidos||0)<5||(a.info[m.b]?.partidos||0)<5,
    confidence:Math.min(b.info[m.a]?.fiab||0,b.info[m.b]?.fiab||0),
    windowA:b.info[m.a]?.partidos||0,windowB:b.info[m.b]?.partidos||0});
  }
 }
 return {rows,counts:{eligible:all.matches.length,undated:all.matches.filter(m=>!m.date).length,leagues:leagues.length},parameters:{...E.DEFAULTS,...options}};
}
function resample(rows,repetitions=2000){
 if(!rows.length)return {blocks:0,interval:null};
 const map=new Map();for(const r of rows){if(!map.has(r.date))map.set(r.date,[]);map.get(r.date).push(Math.abs(r.oldGames-r.games)-Math.abs(r.newGames-r.games));}
 const blocks=[...map.values()].map(v=>({sum:v.reduce((a,b)=>a+b,0),n:v.length}));
 let seed=451;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const samples=[];for(let i=0;i<repetitions;i++){let sum=0,n=0;for(let j=0;j<blocks.length;j++){const b=blocks[Math.floor(random()*blocks.length)];sum+=b.sum;n+=b.n;}samples.push(sum/n);}
 samples.sort((a,b)=>a-b);
 return {method:'paired global-date-block percentile bootstrap; exploratory, not independent across players',seed:451,repetitions,blocks:blocks.length,
  interval:[samples[Math.floor(0.025*repetitions)],samples[Math.min(repetitions-1,Math.floor(0.975*repetitions))]],meaning:'positive means lower game MAE for the new model'};
}
function report(input,opts={}){
 const run=evaluate(input,opts),dev=run.rows.filter(x=>x.split==='development'),hold=run.rows.filter(x=>x.split==='holdout');
 const slopes={old:fitWinScale(dev,'old'),new:fitWinScale(dev,'new')};
 const summary=rows=>({baseline:metrics(rows,'old',slopes.old),candidate:metrics(rows,'new',slopes.new)});
 return {baseline:base.VERSION,model:E.VERSION,parameters:run.parameters,counts:run.counts,
  protocol:'global chronological date blocks, strict earlier dates only; 70/30 per league; same targets and verified identities; manual seeds omitted; no inference of dates or same-name identities',
  development:summary(dev),holdout:summary(hold),holdoutByType:Object.fromEntries(['normal','stb','retirement'].map(t=>[t,summary(hold.filter(r=>r.type===t))])),
  holdoutNewPlayers:summary(hold.filter(r=>r.cold)),confidenceAudit:Object.fromEntries([['low',0,40],['medium',40,70],['high',70,101]].map(([name,a,b])=>[name,summary(hold.filter(r=>r.confidence>=a&&r.confidence<b))])),
  pairedGameImprovement:resample(hold),
  limitations:['Old backups, not the current production data.','Previously examined holdout is a regression sample, not a new blind test.','Retrospective identity links and small format subsets limit generalization.','Confidence is a diagnostic index, never a calibrated win probability.','Date-block interval does not remove dependencies between players on different dates.']};
}
module.exports={evaluate,resample,report};
if(require.main===module){
 try{
  const args=process.argv.slice(2),experimental=args.includes('--experimental-independent');
  const [input,output]=args.filter(x=>x!=='--experimental-independent');if(!input)throw Error('Uso: node scripts/validate-rating.cjs input.json [report.json] [--experimental-independent]');
  if(output&&path.resolve(input)===path.resolve(output))throw Error('La salida debe ser distinta del backup.');
  // Refuse overwriting an existing file. Backups and earlier reports are retained.
  const data=report(JSON.parse(fs.readFileSync(input,'utf8')),experimental?{options:{opponentMode:'independent',opponentFloor:0.75}}:{}),json=JSON.stringify(data,null,2)+'\n';
  if(output)fs.writeFileSync(output,json,{flag:'wx'});else process.stdout.write(json);
 }catch(e){console.error(e.message);process.exitCode=1;}
}
