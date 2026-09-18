/* Sohail v3.9.5 — admission of NEW results, shared by browser and server.
   Pure functions: no network, no mutation, no permissions granted by the UI. */
(function(root,factory){
 'use strict';
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.SohailResultPolicy=factory();
})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const names=m=>m&&m.po?(m.poNames||[m.a,m.b]):[m&&m.aName||m&&m.a,m&&m.bName||m&&m.b];
 const group=c=>c.gid==null?c.g:c.gid;
 const samePair=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===2&&b.length===2&&a[0]&&a[1]&&a[0]!==a[1]&&a.every(n=>b.includes(n));
 function slot(state,c){return state&&state.playoff&&state.playoff.tramos&&state.playoff.tramos[c.ti]&&state.playoff.tramos[c.ti][c.which]&&state.playoff.tramos[c.ti][c.which][c.ri]&&state.playoff.tramos[c.ti][c.which][c.ri][c.mi];}
 function phaseOpen(state,c){
  if(!state||!c)return false;
  if(c.po)return !!(state.playoff&&state.playoff.started);
  const cycle=(state.cycles||[]).find(x=>x&&x.n===c.cycle);
  // editMode is deliberately NOT an exception: a finished cycle cannot accept
  // new results. Existing administrative corrections are handled separately.
  return !!(cycle&&cycle.status==='active'&&c.cycle===state.activeN&&!(state.playoff&&state.playoff.started));
 }
 function existing(state,c){
  const target=names(c);
  return (state&&state.matches||[]).find(m=>{
   if(!m||!!m.po!==!!c.po)return false;
   if(!c.po)return m.cycle===c.cycle&&m.g===group(c)&&samePair(names(m),target);
   if(m.ti!==c.ti||m.which!==c.which)return false;
   // A draw slot is unique even when its players have changed. Legacy records
   // without coordinates can still be recognised by the unordered pair.
   if(Number.isSafeInteger(m.ri)&&Number.isSafeInteger(m.mi))return m.ri===c.ri&&m.mi===c.mi;
   return samePair(names(m),target);
  })||null;
 }
 function slotRecorded(state,c){
  if(!c.po)return false;
  const s=slot(state,c);
  // Legacy draw-only results must not become a silent overwrite from Report.
  return !!(s&&(s.locked||s.winner||s.w||(Array.isArray(s.sets)&&s.sets.length)));
 }
 function newBlock(state,c){
  if(!phaseOpen(state,c))return 'stage';
  if(existing(state,c)||slotRecorded(state,c))return 'recorded';
  return '';
 }
 return Object.freeze({names,samePair,slot,phaseOpen,existing,slotRecorded,newBlock});
});
