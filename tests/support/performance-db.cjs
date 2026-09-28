'use strict';
// Contract simulation only; SQL12 needs the independent PostgreSQL workflow.
const crypto=require('node:crypto');
const clone=structuredClone,digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const pick=(o,fields)=>Object.fromEntries(fields.filter(k=>Object.hasOwn(o||{},k)).map(k=>[k,o[k]]));
function project(s){if(typeof s==='string')s=JSON.parse(s);if(!s||!s.users||!Array.isArray(s.matches))throw Error('Incomplete source');return {users:Object.fromEntries(Object.entries(s.users).map(([n,u])=>[n,pick(u,['name','jugadorId','historialId','historialNombre'])])),matches:s.matches.map(m=>pick(m,['id','po','cycle','g','sets','club','date','status','wo','np','npReason','injurySide','winner','retiroDe','poNames','aName','bName','tLabel','which'])),cycles:(s.cycles||[]).map(c=>({n:c.n,groups:Array.isArray(c.groups)?c.groups.map(()=>({})):null})),RATING_SEEDS:s.RATING_SEEDS||{},RATING_OVERRIDES:s.RATING_OVERRIDES||{}};}
function manifest(db,priv){const index=db.tables.liga_index.filter(i=>priv||i.estado==='finalizada').sort((a,b)=>a.id.localeCompare(b.id)).map(i=>{const s=db.state(i.id);if(!s)throw Error('Missing state');return {...i,version:s._v||0,sport:digest(project(s))};});return {index,signature:digest(index.map(({version,...x})=>x))};}
function rpc(db,name,p,lib){
 const now=Date.now(),today=new Date(now).toISOString().slice(0,10);
 if(name==='sohail_perf_login_source')return {index:clone(db.tables.liga_index),states:db.tables.liga_index.filter(l=>l.estado==='activa').map(l=>{const s=db.state(l.id);if(!s?.users)throw Error('Incomplete login');return {id:l.id,data:Object.hasOwn(s.users,p.p_user)?clone(s):{users:{}}};})};
 if(name==='sohail_perf_source'){
  const m=manifest(db,p.p_private),row=db.tables.sohail_derived_cache.find(c=>c.scope===(p.p_private?'authenticated':'public')&&c.signature===m.signature&&c.model===p.p_model&&c.as_of===today),cache=row?clone(row.payload):null;
  if(cache?.computed?.info)for(const [k,v]of Object.entries(cache.computed.info))if(k!==p.p_player)delete v.selected;
  return {...m,asOf:today,cache,states:p.p_snapshot&&p.p_signature!==m.signature?m.index.map(l=>({id:l.id,data:{...project(db.state(l.id)),_v:l.version}})):null};
 }
 if(name==='sohail_perf_cache_put'){
  const m=manifest(db,p.p_private);if(p.p_signature!==m.signature||p.p_as_of!==today||Buffer.byteLength(JSON.stringify(p.p_payload))>4194304)return false;
  const scope=p.p_private?'authenticated':'public';db.tables.sohail_derived_cache=db.tables.sohail_derived_cache.filter(c=>c.scope!==scope);db.tables.sohail_derived_cache.push({scope,signature:m.signature,model:p.p_model,as_of:today,payload:clone(p.p_payload)});return true;
 }
 if(name==='sohail_perf_backup'){
  const d=p.p_data,a=p.p_action;let l=db.tables.sohail_backup_lock[0];if(!l){l={id:1};db.tables.sohail_backup_lock.push(l);}
  const ledger=db.tables.sohail_backup_runs,keep=()=>ledger.filter(r=>r.verified).sort((a,b)=>b.day.localeCompare(a.day)).slice(0,3);
  if(a==='acquire'){if(l.expires>now)return {ok:false,code:'BACKUP_BUSY'};l.owner=d.owner;l.expires=now+600000;return {ok:true,day:today,existing:clone(ledger.find(r=>r.verified&&r.day===today)||null)};}
  if(l.owner!==d.owner||l.expires<=now)return {ok:false,code:'BACKUP_LOCK_LOST'};
  if(a==='release'){l.owner=null;l.expires=0;return {ok:true};}
  if(a==='register'){if(d.day!==today||!/^daily-v510-\d{4}-\d{2}-\d{2}-[a-f0-9]{32}\.sohail\.enc$/.test(d.file)||d.file.slice(11,21)!==d.day)throw Error('Invalid file');ledger.push({file:d.file,day:d.day,verified:false});}
  else if(a==='verified'){const r=ledger.find(x=>x.file===d.file);if(!r||ledger.some(x=>x!==r&&x.day===r.day&&x.verified))throw Error('Invalid record');Object.assign(r,{verified:true,digest:d.digest,size_bytes:d.size});}
  else if(a==='plan'){const k=keep();return {ok:true,keep:clone(k),remove:ledger.filter(x=>!k.some(y=>y.file===x.file)).map(x=>x.file)};}
  else if(a==='deleted'){const k=keep();db.tables.sohail_backup_runs=ledger.filter(x=>k.some(y=>x.file===y.file)||!d.files.includes(x.file));}
  else throw Error('Unknown backup action');return {ok:true};
 }
 if(name==='sohail_perf_rules'){
  const d=p.p_data,a=p.p_action;const sec=require('./auth-part2.cjs').rpc(db,'sohail_p2_session',{p_action:'read',p_data:{id:d.sid,principal:d.principal,epoch:d.epoch}},lib);
  if(!sec.ok||sec.must_change)return {ok:false,code:'SESSION_EXPIRED'};
  const source=db.state(d.source),u=source?.users[d.actor],session={u:d.actor,pk:d.principal};
  if(!u||!lib.sesionEsAdmin(session,source.users))return {ok:false,code:'FORBIDDEN'};
  if(a==='clean'&&now-Date.parse(sec.session.verified_at)>600000)return {ok:false,code:'REAUTH_REQUIRED'};
  const out=[];
  for(const l of db.tables.liga_index.filter(l=>l.estado==='finalizada'&&(a==='report'||l.id===d.league))){
   const s=db.state(l.id);if(u.role!=='superadmin'&&!lib.sesionEsAdmin(session,s.users))continue;
   const rules={normativa:s.REGLAMENTO||'',secciones:s.REGLAMENTO_SECCIONES||{}},h=digest(rules),version=s._v||0,bytes=Buffer.byteLength(JSON.stringify(rules));
   if(a==='report'){out.push({id:l.id,name:l.nombre,version,digest:h,bytes,images:(JSON.stringify(rules).match(/data:image\//g)||[]).length});continue;}
   if(a==='export')return {ok:true,format:'sohail-rules-archive-1',id:l.id,name:l.nombre,version,digest:h,rules};
   if(version!==d.version||h!==d.digest)return {ok:false,code:'CONFLICT'};
   const strip=v=>v.replace(/<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi,''),next=d.kind==='images'?{normativa:strip(rules.normativa),secciones:Object.fromEntries(Object.entries(rules.secciones).map(([k,v])=>[k,strip(v)]))}:{normativa:'',secciones:{}};
   const changed=JSON.stringify(next)!==JSON.stringify(rules);if(changed){s.REGLAMENTO=next.normativa;s.REGLAMENTO_SECCIONES=next.secciones;s._v++;db.tables.audit_log.push({actor:d.actor,action:'rules.cleanup',target:l.id});}
   return {ok:true,changed,version:s._v,savedBytes:Math.max(0,bytes-Buffer.byteLength(JSON.stringify(next)))};
  }
  return a==='report'?{ok:true,leagues:out}:{ok:false,code:'RULES_NOT_AVAILABLE'};
 }
 throw Error('Unsupported performance RPC '+name);
}
module.exports={rpc,project,manifest};
