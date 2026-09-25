'use strict';
/* OFFLINE ONLY. Input is {leagues:[{id,state,order?}]} with a saved JSON backup
 * for each state. No network, credentials, Supabase writes or file mutation.
 * Every target DATE block is predicted with strictly earlier dated matches.
 * Unknown dates are not placed in the past by guessing; report their count.
 * Both models are evaluated on exactly the SAME target records and 50-window.
 * Admin seeds/overrides are omitted: their historical creation dates are unknown.
 * Historical groups from already observed matches are allowed for both models.
 * 70% of date blocks development; final 30% held out per league (no shuffling).
 * Win probability calibration is fitted ONLY to development predictions.
 */
const fs=require('node:fs');
const E=require('../api/_rating-engine');
const old=require('../tests/support/rating-legacy.cjs');
function project(input){
 if(!input||!Array.isArray(input.leagues)||!input.leagues.length)throw Error('Expected {leagues:[{id,state,order?}]}');
 return input.leagues.map(l=>{
  const s=l.state||l;if(!l.id||!Array.isArray(s.matches))throw Error('Invalid league input');
  const users=Object.create(null);for(const [n,u]of Object.entries(s.users||{})){users[n]={};for(const k of ['historialId','jugadorId','historialNombre'])if(u?.[k])users[n][k]=u[k];}
  return {id:l.id,users,matches:s.matches,cycles:s.cycles||[],seeds:{},order:l.order||0};
 });
}
function oldRatings(data){
 const keys=Object.keys(data.people),seeds=Object.fromEntries(keys.map(k=>[k,data.people[k].prior]));
 const matches=data.matches.map(m=>({a:m.a,b:m.b,gamesA:m.gamesA+(m.stb===0?1:0),gamesB:m.gamesB+(m.stb===1?1:0),fecha:m.date,esSTB:m.stb!=null}));
 const info=old.utrCalcular(keys,matches,seeds,{},{});return Object.fromEntries(keys.map(k=>[k,info[k].ratingCalculado]));
}
function sigmoid(x){return 1/(1+Math.exp(-Math.max(-40,Math.min(40,x))));}
function fitWinScale(rows,model){
 let beta=1;for(let i=0;i<60;i++){
  let grad=-0.01*beta,hessian=0.01;
  for(const r of rows)if(r.winner!=null){const x=r[model+'Diff'],p=sigmoid(beta*x);grad+=x*(r.winner-p);hessian+=x*x*p*(1-p);}
  const next=Math.max(0,Math.min(20,beta+grad/hessian));if(Math.abs(next-beta)<1e-8)break;beta=next;
 }return beta;
}
function metrics(rows,model,beta){
 let ae=0,se=0,brier=0,loss=0,correct=0,nWin=0;
 for(const r of rows){const p=r[model+'Games'],delta=p-r.games;ae+=Math.abs(delta);se+=delta*delta;
  if(r.winner!=null){nWin++;const q=Math.max(1e-8,Math.min(1-1e-8,sigmoid(beta*r[model+'Diff'])));brier+=(q-r.winner)**2;loss-=r.winner*Math.log(q)+(1-r.winner)*Math.log(1-q);
   correct+=r[model+'Diff']===0?0.5:(r[model+'Diff']>0)===(r.winner===1)?1:0;
  }
 }
 return {matches:rows.length,gameMAE:rows.length?ae/rows.length:null,gameRMSE:rows.length?Math.sqrt(se/rows.length):null,winnerMatches:nWin,winnerAccuracy:nWin?correct/nWin:null,winBrier:nWin?brier/nWin:null,winLogLoss:nWin?loss/nWin:null,winCalibrationSlope:beta};
}
function benchmark(input,options={}){
 const leagues=project(input),output=[],counts={retained:0,undated:0};
 // Each league is scored as a separate historical sample. This avoids assuming
 // that equal unlinked names in two supplied old backups identify one person.
 for(const l of leagues){
  const all=E.prepare([l]),dates=[...new Set(all.matches.map(m=>m.date).filter(Boolean))].sort(),cut=Math.max(1,Math.floor(dates.length*0.7));
  counts.retained+=all.matches.length;counts.undated+=all.matches.filter(m=>!m.date).length;
  for(let i=0;i<dates.length;i++){
   const d=dates[i],training={...l,matches:l.matches.filter(m=>E.dateKey(m.date)&&E.dateKey(m.date)<d)};
   const past=E.prepare([training]),model=E.calculate(past,{...options,asOf:d}),legacy=oldRatings(past);
   for(const m of all.matches.filter(m=>m.date===d)){
    const newA=model.info[m.a]?.ratingCalculado??8,newB=model.info[m.b]?.ratingCalculado??8,oldA=legacy[m.a]??8,oldB=legacy[m.b]??8;
    const g=m.gamesA+m.gamesB;if(!g)continue;
    output.push({date:d,league:l.id,split:i<cut?'development':'holdout',games:m.gamesA/g,winner:m.winner==null?null:m.winner===0?1:0,
     newGames:E.expected(newA,newB,options.scale||E.DEFAULTS.scale),oldGames:E.expected(oldA,oldB),newDiff:newA-newB,oldDiff:oldA-oldB,
     type:m.retired?'retirement':m.stb!=null?'stb':'normal',cold:!past.matches.some(p=>p.a===m.a||p.b===m.a)||!past.matches.some(p=>p.a===m.b||p.b===m.b)});
   }
  }
 }
 const development=output.filter(x=>x.split==='development'),holdout=output.filter(x=>x.split==='holdout');
 const slopes={old:fitWinScale(development,'old'),new:fitWinScale(development,'new')};
 const summarize=list=>({old:metrics(list,'old',slopes.old),new:metrics(list,'new',slopes.new)});
 return {model:E.VERSION,parameters:{...E.DEFAULTS,...options},method:'chronological-by-date; 70/30 per league; no future seeds; identical targets; calibration on development only',counts,
  development:summarize(development),holdout:summarize(holdout),holdoutByType:Object.fromEntries(['normal','stb','retirement'].map(type=>[type,summarize(holdout.filter(x=>x.type===type))])),
  limitations:['Historical backups are not current production.','Identity links are retrospective; no name guessing.','Engine-only comparison: the old model gets the same corrected input and initial references.','Win probabilities are calibrated offline for evaluation only; not exposed as game shares.','No confidence interval or significance claim; outcomes depend on players and dates.'],
  // Anonymous paired errors allow a DATE-block resampling analysis outside CI.
  pairedHoldout:holdout.map(x=>({league:x.league,date:x.date,oldError:Math.abs(x.oldGames-x.games),newError:Math.abs(x.newGames-x.games)}))};
}
module.exports={project,oldRatings,fitWinScale,metrics,benchmark};
if(require.main===module){
 try{if(!process.argv[2])throw Error('Usage: node scripts/benchmark-rating.cjs input.json [output.json]');
  const result=benchmark(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));const json=JSON.stringify(result,null,2)+'\n';
  if(process.argv[3]){if(require('node:path').resolve(process.argv[2])===require('node:path').resolve(process.argv[3]))throw Error('Output must differ from the source backup.');fs.writeFileSync(process.argv[3],json);}else process.stdout.write(json);
 }catch(e){console.error(e.message);process.exitCode=1;}
}
