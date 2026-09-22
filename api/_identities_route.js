'use strict';
const lib=require('./_lib'),O=require('./_operations'),I=require('./_identities');
module.exports=require('./_http').wrap(async function(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
 if(!lib.envOK(res))return;
 const ctx=await O.context(req),b=req.body||{},id=lib.resolveLigaId(b.ligaId);
 const current=await lib.readState(id);if(!current)throw new O.AppError(404,'LEAGUE_NOT_FOUND','La liga no existe.');O.requireAdmin(ctx,current);
 if(b.mode==='status'){
  const row=await O.operation(b.operationId);
  if(row&&row.actor_key!==ctx.session.pk)throw new O.AppError(403,'FORBIDDEN','No podés consultar esta operación.');
  return res.status(200).json(row?O.publicResult(row):{committed:false});
 }
 if(b.mode==='operations'){
  if(!ctx.superadmin)throw new O.AppError(403,'FORBIDDEN','Solo el superadministrador puede revisar las copias previas.');
  const rows=await O.tableRows('sohail_data_operations','id,kind,actor,created_at,result');
  return res.status(200).json({operations:rows.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,50).map(r=>({id:r.id,kind:r.kind,actor:r.actor,createdAt:r.created_at,summary:r.result?.summary}))});
 }
 const reg=await O.registry();
 if(b.mode==='profile'){
  const ref={type:'league',ligaId:id,name:String(b.name||'')},key=I.refKey(ref),u=current.users[ref.name];
  if(!u)throw new O.AppError(404,'PROFILE_NOT_FOUND','Jugador no encontrado.');
  const sid=u.historialId||(u.jugadorId&&reg.data.links?.[JSON.stringify(['catalog',u.jugadorId])]);
  const p=sid&&reg.data.profiles?.[sid];
  return res.status(200).json({profile:p?{id:sid,name:p.name,aliases:p.aliases,fields:p.fields,alternatives:p.alternatives}:null});
 }
 if(b.mode==='undo-preview'||b.mode==='undo-commit'){
  if(!ctx.superadmin)throw new O.AppError(403,'FORBIDDEN','Solo el superadministrador puede deshacer una operación.');
  if(b.mode==='undo-commit'){const prior=await O.replay(b.operationId,ctx,'undo',b.digest);if(prior)return res.status(200).json(prior);}
  const old=await O.operation(b.undoId);if(!old)throw new O.AppError(404,'OPERATION_NOT_FOUND','La operación no existe.');
  const states=[];
  for(const [lid,before]of Object.entries(old.before_states)){
   if(!before.write)continue;
   const now=await lib.readState(lid);
   if(!now||Number(now._v)!==Number(old.after_versions[lid]))throw new O.AppError(409,'UNDO_CONFLICT','Hubo cambios posteriores en '+lid+'. No se revierte automáticamente para no borrarlos.');
   const restored=O.clone(before.state);
   // A rollback is not a password reset: retain any currently existing principal data.
   for(const [name,u]of Object.entries(restored.users||{}))if(now.users?.[name])for(const k of ['pass','role','isAdmin','jugadorId','_credentialId','inactive']){
    if(O.own(now.users[name],k))u[k]=O.clone(now.users[name][k]);else delete u[k];
   }
   states.push({id:lid,expected:now._v||0,data:restored,write:true,indexName:before.indexName});
  }
  if(reg.version!==Number(old.registry_after))throw new O.AppError(409,'UNDO_CONFLICT','Hubo cambios posteriores en las identidades. No se revierte automáticamente.');
  const newRegistry=old.before_registry||null,summary={undoId:old.id,kind:old.kind,leagues:states.map(s=>s.id)};
  const proof=O.planProof(ctx,'undo',states,reg.version,{newRegistry,summary});
  if(b.mode==='undo-preview')return res.status(200).json({ok:true,digest:proof,summary});
  if(b.digest!==proof)throw new O.AppError(409,'PREVIEW_EXPIRED','La vista previa ya no está vigente.');
  return res.status(200).json(await O.commit(ctx,{kind:'undo',states,reg,newRegistry,proof,operationId:b.operationId,summary}));
 }
 // Bulk uses the existing 'merge' SQL operation, with a distinct signed plan.
 // It does not require a migration or bypass the per-profile permission checks.
 if(b.mode==='bulk-preview'||b.mode==='bulk-commit'){
  if(b.mode==='bulk-commit'){
   const prior=await O.replay(b.operationId,ctx,'merge',b.digest);
   if(prior)return res.status(200).json(prior);
  }
  const all=await I.universe(ctx,reg);
  const plan=require('./_bulk-identities').planBulkMerge(ctx,all,reg,b.groups);
  const proof=O.planProof(ctx,'merge',plan.states,reg.version,{bulk:true,newRegistry:plan.newRegistry,summary:plan.summary});
  if(b.mode==='bulk-preview')return res.status(200).json({ok:true,digest:proof,summary:plan.summary,cases:plan.cases});
  if(b.digest!==proof)throw new O.AppError(409,'PREVIEW_EXPIRED','El lote o los datos cambiaron. Volvé a revisar antes de fusionar.');
  return res.status(200).json(await O.commit(ctx,{kind:'merge',states:plan.states,reg,newRegistry:plan.newRegistry,proof,operationId:b.operationId,summary:plan.summary}));
 }
 const all=await I.universe(ctx,reg);
 if(b.mode==='directory'){
  const visible=all.records.filter(r=>r.ref.type==='catalog'||r.editable);
  return res.status(200).json({complete:true,scope:'all-authorised-leagues',maxProfiles:I.MAX_MERGE_PROFILES,superadmin:ctx.superadmin,records:visible.map(r=>({ref:r.ref,key:r.key,name:r.name,globalId:r.sportId,source:r.source,leagueId:r.leagueId,leagueName:r.leagueName,estado:r.estado,orden:r.orden,editable:r.editable})),decisions:Object.fromEntries(Object.entries(reg.data.decisions||{}).filter(([,d])=>I.decisionApplies(d,visible))),leagues:all.index.filter(l=>all.states.has(l.id)&&O.authorised(ctx,all.states.get(l.id).state))});
 }
 if(!['preview','commit'].includes(b.mode))throw new O.AppError(400,'INVALID_MODE','Modo inválido.');
 if(!['decision','link','merge'].includes(b.kind))throw new O.AppError(400,'INVALID_KIND','Tipo de operación inválido.');
 const kind=b.kind;
 if(b.mode==='commit'){const prior=await O.replay(b.operationId,ctx,kind,b.digest);if(prior)return res.status(200).json(prior);}
 O.safeTree(b.choices||{});
 const plan=kind==='decision'?I.planDecision(ctx,all,reg,b.refs,b.status):I.planMerge(ctx,all,reg,b.refs,b.choices||{},kind);
 const proof=O.planProof(ctx,kind,plan.states,reg.version,{newRegistry:plan.newRegistry,summary:plan.summary});
 if(b.mode==='preview')return res.status(200).json({ok:true,digest:proof,kind,summary:plan.summary,profile:plan.profile});
 if(b.digest!==proof)throw new O.AppError(409,'PREVIEW_EXPIRED','Los datos o las elecciones cambiaron. Volvé a revisar antes de confirmar.');
 return res.status(200).json(await O.commit(ctx,{kind,states:plan.states,reg,newRegistry:plan.newRegistry,proof,operationId:b.operationId,summary:plan.summary}));
});
