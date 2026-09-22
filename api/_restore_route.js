'use strict';
const lib=require('./_lib'),O=require('./_operations'),{planRestore}=require('./_restore');
module.exports=require('./_http').wrap(async function(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
 if(!lib.envOK(res))return;
 const ctx=await O.context(req),b=req.body||{},id=lib.resolveLigaId(b.ligaId);
 const current=await lib.readState(id);if(!current)throw new O.AppError(404,'LEAGUE_NOT_FOUND','La liga de destino no existe. Creala antes de restaurar.');
 O.requireAdmin(ctx,current);
 if(b.mode==='status'){
  const row=await O.operation(b.operationId);
  if(row&&(row.actor_key!==ctx.session.pk||row.kind!=='restore'))throw new O.AppError(403,'FORBIDDEN','No podés consultar esa operación.');
  return res.status(200).json(row?O.publicResult(row):{committed:false});
 }
 if(!['preview','commit'].includes(b.mode))throw new O.AppError(400,'INVALID_MODE','Elegí vista previa o confirmación.');
 if(b.mode==='commit'){
  const prior=await O.replay(b.operationId,ctx,'restore',b.digest);if(prior)return res.status(200).json(prior);
 }
 const index=await lib.readLigaIndex(),entry=index.find(l=>l.id===id);
 if(!entry)throw new O.AppError(404,'LEAGUE_NOT_FOUND','La liga no está en el índice. No se aplicó nada.');
 const reg=await O.registry(),plan=planRestore(current,b.state,{ligaId:id,source:ctx.source,session:ctx.session,reg});
 const states=[{id,expected:current._v||0,data:plan.state,write:true,indexName:plan.state.LEAGUE_NAME||entry.nombre}];
 const proof=O.planProof(ctx,'restore',states,reg.version,{warnings:plan.warnings});
 if(b.mode==='preview')return res.status(200).json({ok:true,digest:proof,ligaId:id,targetName:entry.nombre,archiveName:plan.state.LEAGUE_NAME,leagueStatus:entry.estado,summary:plan.summary,warnings:plan.warnings});
 if(typeof b.digest!=='string'||b.digest!==proof)throw new O.AppError(409,'PREVIEW_EXPIRED','El archivo o la liga cambiaron desde la vista previa. Volvé a revisar.');
 const result=await O.commit(ctx,{kind:'restore',states,reg,proof,operationId:b.operationId,summary:{...plan.summary,ligaId:id}});
 return res.status(200).json(result);
});
