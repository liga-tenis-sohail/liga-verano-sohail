'use strict';
// Server-only session ledger and credential migration. No positive auth cache.
const crypto=require('node:crypto');
const passwords=require('./_password-security');
const lib=()=>require('./_lib');
const TTL=24*60*60*1000,TEMP_TTL=15*60*1000,FRESH_MS=10*60*1000;
const sidOK=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{43}$/.test(s);
const hashSid=s=>{if(!sidOK(s))throw new Error('Invalid session identifier');return crypto.createHash('sha256').update(s).digest('hex');};
const error=(status,code,message)=>Object.assign(new Error(message),{status,code});
function ensureFresh(session){
 if(!session||session.m)throw error(403,'PASSWORD_CHANGE_REQUIRED','Primero cambiá la contraseña temporal.');
 if(!Number.isSafeInteger(session.authAt)||session.authAt>Date.now()+30000||Date.now()-session.authAt>FRESH_MS)
  throw error(403,'REAUTH_REQUIRED','Confirmá tu identidad con tu contraseña o passkey para continuar.');
}
function device(req){
 const ua=String(req?.headers?.['user-agent']||'');
 const platform=/iPhone|iPad/.test(ua)?'iPhone / iPad':/Android/.test(ua)?'Android':/Windows/.test(ua)?'Windows':/Macintosh/.test(ua)?'Mac':/Linux/.test(ua)?'Linux':'Browser';
 const browser=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'';
 return [platform,browser].filter(Boolean).join(' · ');
}
async function sessionRPC(action,data={}){
 const r=await lib().rpc('sohail_p2_session',{p_action:action,p_data:data});
 if(!r||typeof r!=='object')throw error(503,'AUTH_UNAVAILABLE','No se pudo comprobar la sesión.');
 return r;
}
async function createSession(name,role,source,state,account,req,method='password',previous=null,credentialId=null){
 const s=lib().makeSession(name,role,source,state,account);
 const r=await sessionRPC('create',{id:hashSid(s.sid),public_id:crypto.randomUUID(),principal:account.id,epoch:Number(account.epoch),method,credential_id:credentialId,device:device(req),previous:previous?hashSid(previous.sid):null});
 if(!r.ok)throw error(401,'SESSION_EXPIRED','La cuenta o sesión cambió. Volvé a ingresar.');
 s.iat=Date.parse(r.session.created_at);s.exp=Date.parse(r.session.expires_at);s.authAt=Date.parse(r.session.verified_at);
 s.m=!!r.must_change;s.amr=method;
 return s;
}
async function validateSession(s){
 if(!s||s.typ!=='session-p2'||!sidOK(s.sid)||!Number.isSafeInteger(s.iat)||!Number.isSafeInteger(s.exp)||s.iat>Date.now()+30000||s.exp<=s.iat||s.exp-s.iat>TTL+1000)return null;
 const r=await sessionRPC('read',{id:hashSid(s.sid),principal:s.pk,epoch:s.sv});
 if(!r.ok)return null;
 if(s.exp>Date.parse(r.session.expires_at)||s.iat!==Date.parse(r.session.created_at))return null;
 return {must_change:!!r.must_change,epoch:Number(r.epoch),authAt:Date.parse(r.session.verified_at),amr:r.session.method};
}
async function revoke(s){
 if(!s?.pk||!sidOK(s.sid))return {ok:true,revoked:0};
 const r=await sessionRPC('revoke',{id:hashSid(s.sid),principal:s.pk,epoch:s.sv});
 if(!r.ok)throw error(503,'LOGOUT_UNCONFIRMED','No se pudo confirmar el cierre en el servidor. Reintentá antes de dejar este dispositivo.');
 return r;
}
async function authenticate(name,plain,state){
 const l=lib();let a=await l.securityFor(name,state),master=false;
 // The old master env key is bootstrap-only. It can never bypass a changed
 // password or a migrated account. Its value is never returned to the client.
 const initialMaster=name==='superadmin'&&state.users[name]?.role==='superadmin'&&Number(a.epoch)===0&&!passwords.isModern(a.pass_hash)&&!!l.SUPER_HASH;
 const valid=initialMaster?(master=await passwords.verifyPassword(l.SUPER_HASH,plain)):await passwords.verifyPassword(a.pass_hash,plain);
 if(!valid)return null;
 if(!passwords.isModern(a.pass_hash)){
  const hashed=await passwords.hashPassword(plain);
  const r=await l.rpc('sohail_p2_rehash',{p_principal:a.id,p_epoch:Number(a.epoch),p_expected:a.pass_hash,p_hash:hashed,p_master:master,p_temporary:a.must_change||['tenis','admin123'].includes(plain)});
  if(!r?.ok)throw error(409,'CREDENTIAL_CONFLICT','Las credenciales cambiaron durante el acceso. Volvé a ingresar.');
  a=r.account;
 }
 return a;
}
async function reauthenticate(req,res){
 if(!require('./_session').protectRequest(req))return res.status(403).json({code:'SESSION_ORIGIN',error:'Solicitud de sesión no permitida.'});
 const l=lib(),s=await l.auth(req);
 if(!s)return res.status(401).json({code:'SESSION_EXPIRED',error:'Tu sesión venció. Volvé a ingresar.'});
 const pw=req.body?.pass;
 if(!passwords.validInput(pw))return res.status(400).json({code:'PASSWORD_POLICY',error:'Ingresá tu contraseña actual.'});
 const keys=['reauth:'+s.pk,'reauth-ip:'+l.clientIP(req)];
 for(const k of keys){const wait=await l.rateLimitCheck(k,5);if(wait)return res.status(429).json({code:'AUTH_RATE_LIMIT',wait,error:'Demasiados intentos. Esperá antes de reintentar.'});}
 const a=await l.readAccount(s.pk);
 if(!a||Number(a.epoch)!==s.sv||!await passwords.verifyPassword(a.pass_hash,pw)){
  await Promise.all(keys.map(k=>l.rateLimitFail(k,5,5*60*1000)));
  return res.status(401).json({code:'WRONG_PASSWORD',error:'La contraseña actual no es correcta.'});
 }
 await Promise.all(keys.map(k=>l.rateLimitClear(k)));
 const state=await l.readState(s.src);
 const next=await createSession(s.u,s.r,s.src,state,a,req,'password',s);
 await l.logAudit(s.u,'session.reauth',null,{method:'password'},l.clientIP(req));
 return res.status(200).json({ok:true,token:l.signToken(next),exp:next.exp});
}
module.exports={TTL,TEMP_TTL,FRESH_MS,sidOK,hashSid,ensureFresh,createSession,validateSession,revoke,sessionRPC,authenticate,reauthenticate};
