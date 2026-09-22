/* Sohail v4.2 — complete-directory suggestions and bounded profile selection.
 * Pure data helpers: no requests, persistence, authentication or automatic merges.
 * Existing sporting IDs collapse already-linked memberships, not similar names.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(typeof window!=='undefined')root.SohailIdentitySelection=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const MAX_PROFILES=300;
 const refKey=r=>JSON.stringify(r.type==='league'?['league',r.ligaId,r.name]:['catalog',r.id]);
 const nodeKey=r=>r.globalId?'sport:'+r.globalId:(r.key||refKey(r.ref));
 function nodes(records,currentLeague=''){
  const grouped=new Map();
  for(const r of records){const id=nodeKey(r);if(!grouped.has(id))grouped.set(id,{id,records:[]});grouped.get(id).records.push(r);}
  const rank=r=>r.leagueId===currentLeague?0:r.ref.type==='league'?1:2;
  for(const n of grouped.values()){
   n.records.sort((a,b)=>rank(a)-rank(b)||(Number(b.orden)||0)-(Number(a.orden)||0)||String(a.key).localeCompare(String(b.key)));
   n.representative=n.records[0];n.name=n.representative.name;
   n.leagues=[...new Set(n.records.filter(r=>r.leagueId).map(r=>r.leagueName||r.leagueId))];
   n.editable=n.records.every(r=>r.editable!==false);
  }
  return [...grouped.values()].sort((a,b)=>a.name.localeCompare(b.name,'es')||a.id.localeCompare(b.id));
 }
 // Blocking keys cover every rule of SohailDuplicates.compareNames: spelling,
 // token reordering, one-token typo with an unchanged anchor, and partial names.
 // Compare distinct spellings, not every season's copy of each spelling.
 function blocks(p){
  if(!p)return [];
  return [...new Set(['spelling:'+p.clean.replace(/ñ/g,'n'),...p.significant.map(t=>'token:'+t)])];
 }
 function* scanSteps(records,engine,currentLeague='',decisions={}){
  const profiles=nodes(records,currentLeague),position=new Map(profiles.map((n,i)=>[n.id,i]));
  const parent=profiles.map((_,i)=>i),sizes=profiles.map(()=>1);
  function find(a){while(parent[a]!==a){parent[a]=parent[parent[a]];a=parent[a];}return a;}
  function join(a,b){a=find(a);b=find(b);if(a===b)return;if(sizes[a]<sizes[b])[a,b]=[b,a];parent[b]=a;sizes[a]+=sizes[b];}
  const names=new Map(),byKey=new Map();let processed=0,comparisons=0;
  for(const r of records){
   byKey.set(r.key||refKey(r.ref),r);
   if(!engine.validName(r.name))continue;
   if(!names.has(r.name))names.set(r.name,{name:r.name,p:engine.prepare(r.name),owners:new Set()});
   names.get(r.name).owners.add(position.get(nodeKey(r)));
   if(++processed%1000===0)yield {processed,comparisons};
  }
  const spellings=[...names.values()],index=new Map();
  function unionOwners(a,b=a){const members=[...a.owners,...(a===b?[]:b.owners)],first=members[0];for(const member of members)join(first,member);}
  for(const [i,n]of spellings.entries()){
   unionOwners(n);n.blocks=blocks(n.p);
   for(const key of n.blocks){if(!index.has(key))index.set(key,[]);index.get(key).push(i);}
  }
  for(let i=0;i<spellings.length;i++){
   const a=spellings[i],candidates=new Set();
   for(const key of a.blocks)for(const j of index.get(key))if(j>i)candidates.add(j);
   for(const j of candidates){
    const b=spellings[j];comparisons++;
    if(engine.compareNames(a.name,b.name))unionOwners(a,b);
    if(comparisons%1000===0)yield {processed,comparisons};
   }
  }
  const grouped=new Map();
  for(const [i,n]of profiles.entries()){const id=find(i);if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(n);}
  const distinctByRoot=new Map();
  for(const decision of Object.values(decisions||{})){
   if(decision.status!=='distinct'||!Array.isArray(decision.keys))continue;
   const ends=decision.keys.map(k=>byKey.get(k));if(ends.some(r=>!r))continue;
   const ids=ends.map(r=>position.get(nodeKey(r)));if(ids.length!==2||find(ids[0])!==find(ids[1]))continue;
   const group=find(ids[0]);if(!distinctByRoot.has(group))distinctByRoot.set(group,[]);distinctByRoot.get(group).push(decision);
  }
  const groups=[];
  for(const [id,members]of grouped){
   if(members.length<2)continue;
   // Prefer the current league's spelling for the proposed primary name.
   members.sort((a,b)=>Number(b.representative.leagueId===currentLeague)-Number(a.representative.leagueId===currentLeague)||a.name.localeCompare(b.name,'es')||a.id.localeCompare(b.id));
   const decisions=distinctByRoot.get(id)||[],key=JSON.stringify(members.map(n=>n.id).sort());
   groups.push({key,nodes:members,refs:members.map(n=>n.representative.ref),
    profiles:members.length,records:members.flatMap(n=>n.records),distinct:decisions,
    eligible:members.every(n=>n.editable)&&!decisions.length});
  }
  groups.sort((a,b)=>a.nodes[0].name.localeCompare(b.nodes[0].name,'es')||a.key.localeCompare(b.key));
  return {groups,nodes:profiles,complete:true,limited:false,records:records.length,spellings:spellings.length,comparisons};
 }
 function scan(records,engine,currentLeague='',decisions={}){
  const generator=scanSteps(records,engine,currentLeague,decisions);let next;
  do{next=generator.next();}while(!next.done);return next.value;
 }
 async function scanAsync(records,engine,currentLeague='',decisions={},options={}){
  const generator=scanSteps(records,engine,currentLeague,decisions);
  for(;;){
   if(options.cancelled?.()){const e=Error('Revisión cancelada.');e.code='SCAN_CANCELLED';throw e;}
   const next=generator.next();if(next.done)return next.value;
   options.progress?.(next.value);await new Promise(resolve=>setTimeout(resolve,0));
  }
 }
 function count(selection){return [...selection.values()].reduce((total,g)=>total+g.refs.length,0);}
 function selectAll(groups,selection=new Map()){
  const chosen=new Map(selection);let used=count(chosen),omitted=0,blocked=0;
  for(const g of groups){
   if(chosen.has(g.key))continue;
   if(!g.eligible){blocked++;continue;}
   if(used+g.refs.length>MAX_PROFILES){omitted++;continue;}
   chosen.set(g.key,g);used+=g.refs.length;
  }
  return {selection:chosen,profiles:used,omitted,blocked};
 }
 const batches=selection=>[...selection.values()].map(g=>({refs:g.refs.map(r=>({...r})),choices:{}}));
 return Object.freeze({MAX_PROFILES,refKey,nodeKey,nodes,blocks,scan,scanAsync,count,selectAll,batches});
});
