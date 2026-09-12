// Cambio de contraseña y revocación: SOLO servidor; ninguna base se edita desde el cliente.
const lib=require('./_lib');
module.exports=require('./_http').wrap(async function(req,res){
 if(req.query&&req.query.accion==='tutorial')return require('./_tutorial')(req,res);
 if(req.method!=='POST')return res.status(405).json({error:'Método no permitido'});
 if(!lib.envOK(res))return;
 const session=await lib.auth(req,true);
 if(!session)return res.status(401).json({error:'Sesión inválida o expirada.',code:'SESSION_EXPIRED'});
 const body=req.body||{},name=body.target?String(body.target):session.u,newPass=String(body.newPass||'');
 const liga=lib.ligaIdOK(body.ligaId)?body.ligaId:lib.LIGA_DEFAULT;
 const state=await lib.readState(liga);
 if(!state||lib.blockedUser(state,session))return res.status(403).json({error:'No tenés acceso a esta liga.',code:'FORBIDDEN'});
 const target=state.users[name];if(!target)return res.status(404).json({error:'Usuario no encontrado.'});
 const other=name!==session.u;
 if(other&&(!lib.sesionEsAdmin(session,state.users)||session.m))return res.status(403).json({error:'No tenés permiso para cambiar esa contraseña.',code:'FORBIDDEN'});
 if(other&&(target.role==='superadmin'||(!lib.puedeGestionarAdmins(session)&&(name==='admin'||target.role==='admin'||target.isAdmin))))return res.status(403).json({error:'No tenés permiso para administrar esa cuenta.',code:'FORBIDDEN'});
 const reset=other&&newPass==='tenis';
 if((newPass.length<6&&!reset)||newPass.length>128||(!reset&&lib.defaultStored(lib.hashV2(newPass))))return res.status(400).json({error:'Elegí una contraseña no predeterminada de entre 6 y 128 caracteres.',code:'PASSWORD_POLICY'});
 const account=await lib.securityFor(name,state),stored=account.pass_hash;
 if(!other&&!account.must_change){
   const old=String(body.oldPass||'');
   const valid=old&&(stored===old||stored===lib.hashV1(old)||stored===lib.hashV2(old)||(name==='superadmin'&&lib.SUPER_HASH&&lib.hashV2(old)===lib.SUPER_HASH));
   if(!valid)return res.status(400).json({error:'La contraseña actual no es correcta.',code:'WRONG_PASSWORD'});
 }
 const result=await lib.rpc('sohail_change_password',{p_principal:account.id,p_epoch:Number(account.epoch),p_hash:lib.hashV2(newPass),p_reset:reset,p_user:name,p_jugador:target.jugadorId||null});
 if(!result.ok)return res.status(409).json({error:'La contraseña cambió durante la operación. Volvé a entrar.',code:'CREDENTIAL_CONFLICT'});
 await lib.logAudit(session.u,other?'pass.admin_reset':'pass.self_change',name,{defaultReset:reset},lib.clientIP(req));
 const record=result.account;
 return res.status(200).json({ok:true,passwordDefault:reset,tutorialPending:!!reset,token:other?undefined:lib.signToken(lib.makeSession(name,target.role||'player',liga,state,record)),version:result.version});
});
