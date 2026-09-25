'use strict';
// Part 2: all credential writes use a single, guarded database transaction.
const lib=require('./_lib'),passwords=require('./_password-security'),security=require('./_auth-security');
module.exports=require('./_http').wrap(async function(req,res){
 if(req.query?.accion==='tutorial')return require('./_tutorial')(req,res);
 if(req.method!=='POST')return res.status(405).json({error:'Método no permitido'});
 if(!lib.envOK(res))return;
 const session=await lib.auth(req,true);
 if(!session)return res.status(401).json({error:'Sesión inválida o expirada.',code:'SESSION_EXPIRED'});
 const body=req.body||{},name=typeof body.target==='string'&&body.target?body.target:session.u;
 const liga=lib.resolveLigaId(body.ligaId===undefined?session.src:body.ligaId),state=await lib.readState(liga);
 if(!state||lib.blockedUser(state,session))return res.status(403).json({error:'No tenés acceso a esta liga.',code:'FORBIDDEN'});
 const target=state.users?.[name];if(!target)return res.status(404).json({error:'Usuario no encontrado.',code:'USER_NOT_FOUND'});
 const other=lib.principalKey(name,target)!==session.pk,newPass=body.newPass;
 if(other&&(!lib.sesionEsAdmin(session,state.users)||session.m))return res.status(403).json({error:'No tenés permiso para cambiar esa contraseña.',code:'FORBIDDEN'});
 if(other&&(target.role==='superadmin'||(!lib.puedeGestionarAdmins(session)&&(name==='admin'||target.role==='admin'||target.isAdmin))))return res.status(403).json({error:'No tenés permiso para administrar esa cuenta.',code:'FORBIDDEN'});
 if(other)security.ensureFresh(session);
 if(!passwords.policy(newPass,{temporary:other}))return res.status(400).json({error:other?'Usá tenis o una contraseña temporal de 6 a 128 caracteres.':'Elegí una contraseña personal de 6 a 128 caracteres, distinta de las predeterminadas.',code:'PASSWORD_POLICY'});
 const account=await lib.securityFor(name,state);
 if(!other){
  const keys=['change-password:'+session.pk,'change-password-ip:'+lib.clientIP(req)];
  for(const key of keys){const wait=await lib.rateLimitCheck(key,5);if(wait)return res.status(429).json({code:'AUTH_RATE_LIMIT',wait,error:'Demasiados intentos. Esperá antes de reintentar.'});}
  // A restricted, short-lived temporary-password session itself proves the old
  // password. Established accounts must supply their current password again.
  if(!account.must_change&&!await passwords.verifyPassword(account.pass_hash,body.oldPass)){
   await Promise.all(keys.map(k=>lib.rateLimitFail(k,5,5*60*1000)));
   return res.status(400).json({error:'La contraseña actual no es correcta.',code:'WRONG_PASSWORD'});
  }
  if(await passwords.verifyPassword(account.pass_hash,newPass))return res.status(400).json({error:'La contraseña nueva debe ser diferente.',code:'PASSWORD_REUSED'});
  await Promise.all(keys.map(k=>lib.rateLimitClear(k)));
 }
 const result=await lib.rpc('sohail_p2_change_password',{p_data:{actor:session.u,actor_key:session.pk,session_hash:security.hashSid(session.sid),
  target:name,target_key:account.id,target_epoch:Number(account.epoch),expected_hash:account.pass_hash,hash:await passwords.hashPassword(newPass),
  liga,revoke_passkeys:other&&body.revokePasskeys===true}});
 if(!result?.ok)return res.status(result?.code==='FORBIDDEN'?403:409).json({error:'La cuenta o sus permisos cambiaron. Volvé a revisar antes de reintentar.',code:result?.code||'CREDENTIAL_CONFLICT'});
 // The database has committed at this point. Do not falsely report the password
 // write as failed if issuing a new session encounters a network interruption.
 if(other)return res.status(200).json({ok:true,passwordDefault:true,passwordTemporary:true,tutorialPending:true,passkeysRevoked:body.revokePasskeys===true});
 try{
  const next=await security.createSession(name,target.role||'player',liga,state,result.account,req,'password');
  return res.status(200).json({ok:true,passwordDefault:false,passwordTemporary:false,token:lib.signToken(next),exp:next.exp});
 }catch(_){
  require('./_session').clearCookie(res);
  return res.status(200).json({ok:true,passwordDefault:false,passwordTemporary:false,requiresLogin:true});
 }
});
module.exports=require('./_session').withCookie(module.exports);
