'use strict';
// Authorization remains in protectState. This guard verifies sporting rules
// against the stored version, so an old/tampered browser cannot skip review.
const {isDeepStrictEqual:equal}=require('node:util');
const Rules=require('../public/cycle-close');
const error=(code,msg)=>{throw Object.assign(new Error(msg),{status:400,code});};
function protect(current,incoming,session){
 const n=current.activeN,c=current.cycles?.[n-1],target=incoming.cycles?.[n-1];
 const advancing=incoming.activeN>n;
 const closing=c?.status==='active'&&target?.status==='finished';
 const activated=(incoming.cycles||[]).filter((cy,i)=>i>=n&&cy.status==='active'&&current.cycles?.[i]?.status!=='active');
 const nextActivated=activated.length>0;
 if(!advancing&&!closing&&!nextActivated)return;
 const p=Rules.plan(current);
 if(!closing||incoming.activeN!==(p.to||p.from)||activated.some(cy=>cy.n!==p.to))error('CYCLE_TRANSITION_INVALID','Cerrá el ciclo actual antes de habilitar el siguiente, sin saltar ciclos.');
 if(!equal(c.groups,target.groups)||!equal(current.DESTINO,incoming.DESTINO)||!equal(current.PUNTOS,incoming.PUNTOS))
  error('CYCLE_REVIEW_CHANGED','Los grupos o destinos cambiaron. Guardá esos cambios y volvé a revisar el cierre.');
 const currentMatches=(current.matches||[]).filter(m=>!m.po&&m.cycle===n);
 const incomingMatches=(incoming.matches||[]).filter(m=>!m.po&&m.cycle===n);
 if(!equal(currentMatches,incomingMatches)||c.groups.flatMap(g=>g.players||[]).some(name=>!!current.users[name]?.inactive!==!!incoming.users[name]?.inactive))
  error('CYCLE_REVIEW_CHANGED','Los resultados o participantes cambiaron. Guardá esos cambios y volvé a revisar el cierre.');
 if(p.to){
  const decision=target.zeroPointDecision,rows=Rules.assignments(p,decision),expected=Rules.nextGroups(p,decision);
  const next=incoming.cycles[p.to-1];
  if(next?.status!=='active'||next.n!==p.to||!Array.isArray(next.groups)||next.groups.length!==expected.length||
     expected.some((g,i)=>!Array.isArray(next.groups[i]?.players)||!equal(g.players.slice().sort(),next.groups[i].players.slice().sort())))
   error('CYCLE_DESTINATIONS_MISMATCH','Los grupos siguientes no coinciden con los destinos confirmados. No se abrió el ciclo.');
  if(p.ties.length)target.zeroPointDecision={...Rules.decision(p,rows),decidedBy:session.u,decidedAt:new Date().toISOString()};
  else delete target.zeroPointDecision;
 }else delete target.zeroPointDecision;
}
module.exports={protect};
