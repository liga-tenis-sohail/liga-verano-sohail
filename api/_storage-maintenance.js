'use strict';
const lib=require('./_lib'),security=require('./_auth-security'),gate=require('./_request-security');
async function handler(req,res){
 const en=gate.english(req),fail=(status,code,es,eng)=>{throw Object.assign(new Error(en?eng:es),{status,code});};
 const body=req.body||{},mode=body.mode||'report';
 if(!['report','export','clean'].includes(mode)||Object.keys(body).some(k=>!['mode','league','version','digest','kind'].includes(k)))fail(400,'STORAGE_INPUT','Solicitud inválida.','Invalid request.');
 if(mode!=='report'&&!lib.ligaIdOK(body.league))fail(400,'STORAGE_INPUT','Liga inválida.','Invalid league.');
 if(mode==='clean'&&(!Number.isSafeInteger(body.version)||!/^([a-f0-9]{64})$/.test(body.digest||'')||!['images','all'].includes(body.kind)))fail(400,'STORAGE_INPUT','Revisá la versión y el tipo de limpieza.','Check the version and cleanup type.');
 const session=await lib.auth(req);if(!session)fail(401,'SESSION_EXPIRED','La sesión venció.','Your session expired.');
 const state=await lib.readState(session.src);if(!lib.sesionEsAdmin(session,state.users))fail(403,'FORBIDDEN','Solo administradores.','Administrators only.');
 if(mode==='clean')security.ensureFresh(session);
 const result=await lib.rpc('sohail_perf_rules',{p_action:mode,p_data:{actor:session.u,principal:session.pk,epoch:session.sv,sid:security.hashSid(session.sid),source:session.src,league:body.league,version:body.version,digest:body.digest,kind:body.kind}});
 if(!result?.ok)fail(result?.code==='CONFLICT'?409:403,result?.code||'STORAGE_UNAVAILABLE','No se pudo completar. Revisá los permisos o descargá una copia actualizada.','The operation failed. Check permissions or download a current archive.');
 return res.status(200).json(result);
}
module.exports={handler};
