'use strict';
// One atomic merge operation containing independent duplicate cases. Never merge
// every selected person into a single profile. Reuses the existing SQL transaction.
const O=require('./_operations'), I=require('./_identities');
const MAX_CASES=20;
function planBulkMerge(ctx,all,reg,groups){
  if(!Array.isArray(groups)||groups.length<1||groups.length>MAX_CASES){
    throw new O.AppError(400,'INVALID_BATCH','Seleccioná entre 1 y '+MAX_CASES+' casos por lote.');
  }
  O.safeTree(groups);
  // Separate containers; the input universe, registry and current states remain
  // untouched until the SQL CAS transaction commits the complete final plan.
  const working={...all,states:new Map(all.states)};
  let workingReg={version:reg.version,data:O.clone(reg.data)};
  const used=new Set(),writes=new Map(),cases=[],touched=new Map();
  for(const [index,group] of groups.entries()){
    try{
      if(!O.object(group)||!Array.isArray(group.refs)||group.refs.length!==2||
         group.choices!==undefined&&!O.object(group.choices)){
        throw new O.AppError(400,'INVALID_BATCH_CASE','Cada caso necesita dos fichas y elecciones de campos válidas.');
      }
      const selected=group.refs.map(ref=>I.pick(all,ref)),members=I.expand(all,selected,reg);
      // Include historical members retained by earlier merges, not only visible
      // aliases, to reject chains such as A+B and B+C in the same batch.
      const keys=new Set(members.map(r=>r.key));
      for(const r of members)if(r.sportId){
        keys.add('sport:'+r.sportId);
        for(const key of reg.data.profiles?.[r.sportId]?.members||[])keys.add(key);
      }
      if([...keys].some(key=>used.has(key)))throw new O.AppError(409,'BATCH_OVERLAP',
        'Esta persona ya aparece en otro caso seleccionado. Resolvé ese grupo por separado.');
      const plan=I.planMerge(ctx,working,workingReg,group.refs,group.choices||{},'merge');
      for(const key of keys)used.add(key);
      for(const r of members)if(r.leagueId){
        if(!touched.has(r.leagueId))touched.set(r.leagueId,new Set());
        touched.get(r.leagueId).add(r.ref.name);
      }
      for(const change of plan.states){
        working.states.set(change.id,{...working.states.get(change.id),state:change.data});
        writes.set(change.id,change);
      }
      workingReg={version:reg.version,data:plan.newRegistry};
      cases.push({index,refs:O.clone(group.refs),summary:plan.summary,profile:plan.profile});
    }catch(e){
      if(e.status)throw new O.AppError(e.status,e.code,'Caso '+(index+1)+': '+e.message);
      throw e;
    }
  }
  const states=[...writes.values()].sort((a,b)=>a.id.localeCompare(b.id));
  let matches=0;
  for(const [id,names] of touched){
    // Count each match once per league even when two independent selected
    // identities played each other; colliding IDs in other leagues still count.
    for(const m of all.states.get(id).state.matches||[]){
      const people=m.po?m.poNames:[m.aName,m.bName];
      if(Array.isArray(people)&&people.some(n=>names.has(n)))matches++;
    }
  }
  const summary={bulk:true,cases:cases.length,members:cases.reduce((n,c)=>n+c.summary.members,0),
    profiles:cases.map(c=>({id:c.summary.profileId,name:c.summary.name,aliases:c.summary.aliases})),
    leagues:states.map(s=>({id:s.id,name:all.states.get(s.id).entry.nombre})),matches,
    conflicts:cases.reduce((n,c)=>n+c.summary.conflicts,0)};
  return {states,newRegistry:workingReg.data,cases,summary};
}
module.exports={MAX_CASES,planBulkMerge};
