'use strict';
// Test-only contract simulation. SQL execution is checked independently in the
// optional PostgreSQL workflow; this is deliberately not labelled a real DB.
const crypto=require('node:crypto');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
function attachSession(db,s){
 const now=s.iat||Date.now();s.typ='session-p2';s.sid=s.sid||crypto.randomBytes(32).toString('base64url');s.iat=now;s.authAt=s.authAt||now;
 db.tables.sohail_auth_sessions.push({id:digest(s.sid),public_id:crypto.randomUUID(),principal:s.pk,epoch:s.sv,created_at:new Date(now).toISOString(),expires_at:new Date(s.exp).toISOString(),verified_at:new Date(s.authAt).toISOString(),method:s.amr||'password',device_label:'Browser',revoked_at:null});
 return s;
}
function rpc(db,name,body,lib){
 const now=Date.now(),iso=()=>new Date(now).toISOString(),accounts=db.tables.sohail_account_security,sessions=db.tables.sohail_auth_sessions,challenges=db.tables.sohail_auth_challenges;
 const invalid={ok:false};
 function store(pk,epoch,hash,temporary,rehash){
  const a=accounts.find(x=>x.id===pk);if(!a||a.epoch!==epoch)return invalid;
  if(!/^v3:scrypt:32768:8:3:[0-9a-f]{32}:[0-9a-f]{64}$/.test(hash))throw Error('Invalid v3 hash in mock SQL');
  if(pk.startsWith('g:')&&!db.tables.jugadores.some(j=>j.id===pk.slice(2)))throw Error('Global profile missing');
  Object.assign(a,{pass_hash:hash,must_change:temporary,epoch:a.epoch+(rehash?0:1),updated_at:iso()});
  if(temporary&&!rehash)a.tutorial_epoch++;
  for(const row of db.tables.liga_state){let changed=false;for(const[n,u]of Object.entries(row.data.users||{}))if(lib.principalKey(n,u)===pk){u.pass=hash;u.passwordTemporary=temporary;changed=true;}if(changed&&!rehash)row.data._v++;}
  if(pk.startsWith('g:'))db.tables.jugadores.find(j=>j.id===pk.slice(2)).pass=hash;
  if(!rehash)for(const s of sessions)if(s.principal===pk&&!s.revoked_at)s.revoked_at=iso();
  return {ok:true,account:a};
 }
 if(name==='sohail_p2_rehash'){
  const a=accounts.find(x=>x.id===body.p_principal);
  if(!a||a.epoch!==body.p_epoch||a.pass_hash!==body.p_expected||a.pass_hash.startsWith('v3:')||(body.p_master&&a.epoch!==0))return invalid;
  return store(a.id,a.epoch,body.p_hash,a.must_change||body.p_temporary,true);
 }
 if(name==='sohail_p2_session'){
  const d=body.p_data,action=body.p_action,a=accounts.find(x=>x.id===d.principal),s=sessions.find(x=>x.id===d.id&&x.principal===d.principal);
  if(action==='cleanup'){db.tables.sohail_auth_sessions=sessions.filter(s=>Date.parse(s.expires_at)>now-7*864e5);db.tables.sohail_auth_challenges=challenges.filter(c=>Date.parse(c.expires_at)>now);return {ok:true};}
  if(!a||a.epoch!==d.epoch)return {ok:action==='revoke',revoked:0};
  if(action==='create'){
   if(d.method==='passkey'&&(a.must_change||!db.tables.passkeys.some(x=>x.credential_id===d.credential_id&&x.principal_key===a.id)))return invalid;
   const prior=d.previous?sessions.find(x=>x.id===d.previous&&x.principal===d.principal):null;
   if(d.previous&&(!prior||prior.revoked_at||prior.epoch!==a.epoch||Date.parse(prior.expires_at)<=now||a.must_change))return invalid;
   const row={id:d.id,public_id:d.public_id,principal:a.id,epoch:a.epoch,created_at:prior?.created_at||iso(),expires_at:prior?.expires_at||new Date(now+(a.must_change?15*60000:24*3600000)).toISOString(),verified_at:iso(),method:d.method,device_label:d.device||'Browser',revoked_at:null};
   if(sessions.some(s=>s.id===row.id))throw Error('Duplicate session');sessions.push(row);if(prior)prior.revoked_at=iso();
   const active=sessions.filter(s=>s.principal===a.id&&!s.revoked_at&&Date.parse(s.expires_at)>now).sort((a,b)=>b.verified_at.localeCompare(a.verified_at));for(const old of active.slice(30))old.revoked_at=iso();
   return {ok:true,session:row,must_change:a.must_change};
  }
  if(action==='revoke'){const changed=!!s&&!s.revoked_at;if(changed)s.revoked_at=iso();return {ok:true,revoked:changed?1:0};}
  if(!s||s.revoked_at||s.epoch!==a.epoch||Date.parse(s.expires_at)<=now)return invalid;
  if(action==='read')return {ok:true,epoch:a.epoch,must_change:a.must_change,session:s};
  if(action==='list')return {ok:true,sessions:sessions.filter(x=>x.principal===a.id&&!x.revoked_at&&x.epoch===a.epoch&&Date.parse(x.expires_at)>now).map(x=>({id:x.public_id,device:x.device_label,created:x.created_at,expires:x.expires_at,method:x.method,current:x.id===s.id}))};
  let count=0;for(const x of sessions)if(x.principal===a.id&&!x.revoked_at&&(action==='revoke-all'||x.public_id===d.target)){x.revoked_at=iso();count++;}
  return {ok:true,revoked:count,signedOut:action==='revoke-all'||s.public_id===d.target};
 }
 if(name==='sohail_p2_change_password'){
  const d=body.p_data,a=accounts.find(x=>x.id===d.target_key),actor=accounts.find(x=>x.id===d.actor_key),s=sessions.find(x=>x.id===d.session_hash&&x.principal===d.actor_key);
  if(!a||!actor||!s||s.revoked_at||Date.parse(s.expires_at)<=now||s.epoch!==actor.epoch||a.epoch!==d.target_epoch||a.pass_hash!==d.expected_hash)return {ok:false,code:'CREDENTIAL_CONFLICT'};
  const state=db.state(d.liga),au=state?.users?.[d.actor],tu=state?.users?.[d.target];
  if(!au||!tu||au.inactive||lib.principalKey(d.actor,au)!==d.actor_key||lib.principalKey(d.target,tu)!==d.target_key)return {ok:false,code:'FORBIDDEN'};
  const other=d.actor_key!==d.target_key,manager=d.actor==='admin'||au.role==='superadmin';
  if(other&&(actor.must_change||now-Date.parse(s.verified_at)>600000||!lib.sesionEsAdmin({u:d.actor,pk:d.actor_key},state.users)||tu.role==='superadmin'||(!manager&&(d.target==='admin'||tu.role==='admin'||tu.isAdmin))))return {ok:false,code:'FORBIDDEN'};
  const r=store(a.id,a.epoch,d.hash,other,false);
  if(r.ok){if(other&&d.revoke_passkeys)db.tables.passkeys=db.tables.passkeys.filter(x=>x.principal_key!==a.id);db.tables.audit_log.push({actor:d.actor,action:other?'pass.admin_reset':'pass.self_change',target:d.target,details:{temporary:other}});}
  return r;
 }
 if(name==='sohail_p2_passkey'){
  const d=body.p_data,keys=db.tables.passkeys,k=keys.find(k=>k.credential_id===d.credential_id);
  if(body.p_action==='counter'){
   if(!k||k.principal_key!==d.principal_key||k.counter!==d.expected||d.counter<k.counter)return invalid;
   k.counter=d.counter;k.last_used_at=iso();return {ok:true};
  }
  const a=accounts.find(x=>x.id===d.principal_key),s=sessions.find(x=>x.id===d.session_hash&&x.principal===a?.id),u=db.state(d.liga)?.users?.[d.user_name];
  if(!a||a.epoch!==d.epoch||a.must_change||!s||s.epoch!==a.epoch||s.revoked_at||Date.parse(s.expires_at)<=now||now-Date.parse(s.verified_at)>600000||!u||u.inactive||lib.principalKey(d.user_name,u)!==a.id)return invalid;
  if(k||keys.filter(x=>x.principal_key===a.id).length>=10)return invalid;
  keys.push({credential_id:d.credential_id,user_name:d.user_name,principal_key:a.id,public_key:d.public_key,counter:d.counter,device_label:d.device_label,transports:d.transports,created_at:iso()});return {ok:true};
 }
 if(name==='sohail_p2_challenge'){
  const d=body.p_data;
  if(body.p_action==='issue'){if(challenges.some(x=>x.id===d.id))throw Error('Challenge duplicate');challenges.push({...d,expires_at:new Date(now+300000).toISOString(),used_at:null});return {ok:true};}
  const c=challenges.find(x=>x.id===d.id&&x.kind===d.kind&&x.principal===d.principal&&x.epoch===d.epoch&&x.session_hash===d.session_hash);
  if(!c||c.used_at||Date.parse(c.expires_at)<=now)return invalid;c.used_at=iso();return {ok:true};
 }
 throw Error('Unsupported auth RPC '+name);
}
module.exports={attachSession,rpc,digest};
