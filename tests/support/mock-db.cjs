'use strict';
// TEST ONLY. PostgREST and SQL RPC simulation, never a connection to Supabase.
process.env.SESSION_SECRET='SOHAIL_LOCAL_TEST_NOT_A_SECRET';
process.env.SUPABASE_URL='https://database.invalid';process.env.SUPABASE_SERVICE_KEY='sb_secret_test';
const lib=require('../../api/_lib');
function result(data,status=200){return {status,ok:status<400,headers:new Headers(),json:async()=>structuredClone(data),text:async()=>JSON.stringify(data)};}
function createDB(states){
 const db={tables:{liga_state:[],liga_index:[],jugadores:[],sohail_account_security:[],passkeys:[],rate_limits:[],mensajes:[],audit_log:[],admin_notify_channels:[],password_resets:[],sohail_identity_registry:[],sohail_data_operations:[],sohail_login_order:[]},requests:[],fault:null,latency:0,failWrites:0};
 db.setStates=(list)=>{for(const name of Object.keys(db.tables))db.tables[name]=[];db.tables.sohail_login_order.push({id:1,version:0,league_ids:[]});db.tables.sohail_identity_registry.push({id:1,version:0,data:{links:{},profiles:{},decisions:{}}});for(const item of list){db.tables.liga_state.push({id:item.id,data:structuredClone(item.state)});db.tables.liga_index.push({id:item.id,nombre:item.state.LEAGUE_NAME||item.id,estado:item.estado||'activa',orden:db.tables.liga_index.length});for(const[n,u]of Object.entries(item.state.users)){const key=lib.principalKey(n,u);if(!db.tables.sohail_account_security.some(a=>a.id===key))db.tables.sohail_account_security.push({id:key,pass_hash:u.pass,epoch:0,must_change:false,tutorial_epoch:1,tutorial_done_epoch:1,tutorial_version:1});if(u.jugadorId&&!db.tables.jugadores.some(j=>j.id===u.jugadorId))db.tables.jugadores.push({id:u.jugadorId,nombre:n,pass:u.pass,email:n.toLowerCase()+'@example.invalid'});}}};
 function rows(name,url){return db.tables[name].filter(row=>{for(const[k,v]of url.searchParams){if(['select','limit','offset','order','on_conflict'].includes(k))continue;
   if(v==='is.null'&&row[k]!=null)return false;if(v==='not.is.null'&&row[k]==null)return false;
   if(v.startsWith('eq.')&&String(row[k])!==v.slice(3))return false;
   if(v.startsWith('gt.')&&!(row[k]>Number(v.slice(3))))return false;
   if(v.startsWith('in.(')&&!v.slice(4,-1).split(',').includes(String(row[k])))return false;
  }return true;});}
 db.fetch=async(input,opts={})=>{
  const url=new URL(input);if(url.hostname!=='database.invalid')throw Error('External network prohibited');
  const name=url.pathname.split('/').at(-1),method=opts.method||'GET',body=opts.body?JSON.parse(opts.body):undefined;
  db.requests.push({name,method,body:structuredClone(body),query:url.search});
  if(db.latency)await new Promise(r=>setTimeout(r,db.latency));
  if(db.fault&&db.fault({name,method,url,body}))return result({error:'Database failure simulated'},503);
  if(url.pathname.includes('/rpc/')){
   if(name==='sohail_set_login_league_order'){
    // Contract simulation only: not a substitute for executing the migration.
    const p=body,config=db.tables.sohail_login_order[0],source=db.state(p.p_source),u=source?.users[p.p_actor];
    if(!config)return result({error:'missing function/table'},404);
    const account=db.tables.sohail_account_security.find(x=>x.id===p.p_actor_key);
    if(!account||account.epoch!==p.p_epoch||account.must_change||!u||u.inactive||!lib.sesionEsAdmin({u:p.p_actor,pk:p.p_actor_key},source.users))return result({ok:false,code:'FORBIDDEN'});
    if(!Array.isArray(p.p_ids)||new Set(p.p_ids).size!==p.p_ids.length)return result({ok:false,code:'INVALID_ORDER'});
    if(config.version!==p.p_expected)return result({ok:false,code:'CONFLICT'});
    const closed=db.tables.liga_index.filter(l=>l.estado==='finalizada').map(l=>l.id).sort();
    if(JSON.stringify(closed)!==JSON.stringify(p.p_ids.slice().sort()))return result({ok:false,code:'LEAGUES_CHANGED'});
    if(db.failWrites>0){db.failWrites--;return result({error:'save failed'},503);}
    if(JSON.stringify(config.league_ids)!==JSON.stringify(p.p_ids)){config.league_ids=structuredClone(p.p_ids);config.version++;config.updated_by=p.p_actor;}
    return result({ok:true,version:config.version,ids:config.league_ids});
   }
   if(name==='sohail_apply_data_operation'){
    // Models the transaction's atomic CAS, authorization and idempotency contract.
    // The SQL implementation still needs its independent database integration test.
    const p=body,reg=db.tables.sohail_identity_registry[0],prior=db.tables.sohail_data_operations.find(x=>x.id===p.p_id);
    if(prior)return result(prior.actor_key===p.p_actor_key&&prior.kind===p.p_kind&&prior.request_digest===p.p_digest?prior.result:{ok:false,code:'OPERATION_REUSED'});
    if(!reg||reg.version!==p.p_registry_version)return result({ok:false,code:'CONFLICT'});
    const source=db.state(p.p_source),su=source?.users[p.p_actor],account=db.tables.sohail_account_security.find(x=>x.id===p.p_actor_key);
    if(!account||account.epoch!==p.p_epoch||account.must_change||!su||su.inactive||lib.principalKey(p.p_actor,su)!==p.p_actor_key)return result({ok:false,code:'FORBIDDEN'});
    const superadmin=su.role==='superadmin';
    if(!superadmin&&(!lib.sesionEsAdmin({u:p.p_actor,pk:p.p_actor_key},source.users)||p.p_kind==='undo'))return result({ok:false,code:'FORBIDDEN'});
    const before={},versions={};
    for(const item of p.p_states){const current=db.state(item.id),idx=db.tables.liga_index.find(x=>x.id===item.id);
     if(!current||!idx||Number(current._v||0)!==item.expected)return result({ok:false,code:'CONFLICT',currentV:current?._v});
     if(item.write&&!superadmin&&!lib.sesionEsAdmin({u:p.p_actor,pk:p.p_actor_key},current.users))return result({ok:false,code:'FORBIDDEN'});
     before[item.id]={state:structuredClone(current),indexName:idx.nombre,write:!!item.write};
    }
    if(db.failWrites>0){db.failWrites--;return result({error:'atomic transaction failure simulated'},503);}
    const oldreg=p.p_registry?structuredClone(reg.data):null;
    for(const item of p.p_states)if(item.write){db.tables.liga_state.find(x=>x.id===item.id).data={...structuredClone(item.data),_v:item.expected+1};versions[item.id]=item.expected+1;if('indexName' in item)db.tables.liga_index.find(x=>x.id===item.id).nombre=item.indexName;}
    if(p.p_registry){reg.data=structuredClone(p.p_registry);reg.version++;}
    const out={ok:true,operationId:p.p_id,versions,registryVersion:reg.version,summary:structuredClone(p.p_summary)};
    db.tables.sohail_data_operations.push({id:p.p_id,kind:p.p_kind,actor:p.p_actor,actor_key:p.p_actor_key,request_digest:p.p_digest,before_states:before,before_registry:oldreg,after_versions:versions,registry_after:reg.version,result:out,created_at:new Date().toISOString()});return result(out);
   }
   if(name==='sohail_write_state'){
    if(db.failWrites>0){db.failWrites--;return result({error:'write failed'},503);}
    const row=db.tables.liga_state.find(r=>r.id===body.p_liga),s=row?.data;const v=s?Number(s._v||0):-1;
    if(body.p_expected!==v)return result({ok:false,conflict:true,currentV:v});
    const next={...structuredClone(body.p_data),_v:v+1};if(row)row.data=next;else db.tables.liga_state.push({id:body.p_liga,data:next});return result({ok:true,version:v+1});
   }
   if(name==='sohail_change_password'){
    const a=db.tables.sohail_account_security.find(x=>x.id===body.p_principal);if(!a||Number(a.epoch)!==body.p_epoch)return result({ok:false});
    Object.assign(a,{epoch:a.epoch+1,pass_hash:body.p_hash,must_change:body.p_reset});if(body.p_reset)a.tutorial_epoch++;
    for(const row of db.tables.liga_state){let changed=false;for(const[n,u]of Object.entries(row.data.users))if(lib.principalKey(n,u)===body.p_principal){u.pass=body.p_hash;changed=true;}if(changed)row.data._v++;}
    if(body.p_jugador){const j=db.tables.jugadores.find(x=>x.id===body.p_jugador);if(j)j.pass=body.p_hash;}return result({ok:true,account:a});
   }
   return result({error:'Unsimulated RPC '+name},501);
  }
  if(!(name in db.tables))return result({error:'Unknown table'},404);
  let selected=rows(name,url);
  if(method==='GET'){
   const order=url.searchParams.get('order');if(order){const[k,dir]=order.split('.');selected.sort((a,b)=>(a[k]>b[k]?1:a[k]<b[k]?-1:0)*(dir==='desc'?-1:1));}
   const off=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000);selected=selected.slice(off,off+limit);
   const select=url.searchParams.get('select');if(select&&select!=='*')selected=selected.map(r=>Object.fromEntries(select.split(',').map(k=>[k,r[k]])));return result(selected);
  }
  if(method==='DELETE'){db.tables[name]=db.tables[name].filter(r=>!selected.includes(r));return result(selected);}
  if(method==='PATCH'){selected.forEach(r=>Object.assign(r,structuredClone(body)));return result(selected);}
  if(method==='POST'){
   const out=[],key=name==='rate_limits'?'key':name==='passkeys'?'credential_id':'id';
   for(const b of Array.isArray(body)?body:[body]){const old=db.tables[name].find(r=>b[key]!=null&&r[key]===b[key]);
    if(old&&String(opts.headers?.Prefer).includes('ignore-duplicates'))continue;
    if(old&&!String(opts.headers?.Prefer).includes('merge-duplicates'))return result({error:'duplicate'},409);
    const rec=old||{[key]:b[key]??db.tables[name].length+1};Object.assign(rec,structuredClone(b));
    if(!rec.updated_at)rec.updated_at=new Date().toISOString();if(name==='mensajes')rec.fecha=new Date().toISOString();if(!old)db.tables[name].push(rec);out.push(rec);}
   return result(out,201);
  }throw Error('Unsimulated HTTP method');
 };
 db.state=(id='liga-actual')=>db.tables.liga_state.find(x=>x.id===id)?.data;
 db.token=(name='Alicia',id='liga-actual')=>{const s=db.state(id),u=s.users[name],a=db.tables.sohail_account_security.find(x=>x.id===lib.principalKey(name,u));return lib.signToken(lib.makeSession(name,u.role,id,s,a));};
 db.setStates(states||[{id:'liga-actual',state:fixture()}]);return db;
}
let hash;function fixture(){if(!hash)hash=lib.hashV2('prueba123');const names=['Alicia','Beto','Ciro','Diego','Elena'];return {_v:3,users:Object.fromEntries([['admin',{role:'admin',name:'Organización',pass:hash,_credentialId:'org'}],['superadmin',{role:'superadmin',name:'Superadministrador',pass:hash,_credentialId:'super'}],...names.map((n,i)=>[n,{name:n,role:'player',jugadorId:'profile-'+i,pass:hash,email:n.toLowerCase()+'@example.invalid'}])]),LEAGUE_NAME:'Liga de pruebas 2026',LEAGUE_SUBTITLE:'',LOGIN_TITLE:'',ALLNAMES:names,cycles:[{n:1,status:'active',groups:[{players:names}]},{n:2,status:'locked',groups:null}],activeN:1,matches:[],matchId:1,playoff:{started:false,preview:false,numTramos:1,tramos:[],results:{},qualified:[],viewT:0,forcedSize:0},DESTINO:{1:['G1','G1','G1','G1','G1']},FECHAS:['01/09/26 - 30/09/26','01/10/26 - 31/10/26'],PO_FECHAS:{},PUNTOS:{1:[5,4,3,2,1]},AJUSTES_PUNTOS:{},LOG:[],JOIN_REQUESTS:[],CLUBS:[{name:'Sohail',bg:'#D6ECFB'},{name:'Club Haza',bg:'#FDE7BD'}],COLOR_DISPUTA:'#FFF3CD',LEAGUE_COLOR_PRI:'#1B4F9C',LEAGUE_COLOR_ACC:'#CED400',LEAGUE_COLOR_HL:'#FFF6C7',LOGIN_HEADER:{color:'#0E3470',textColor:'',colorDark:'',textColorDark:'',links:[]},RATING_ON:false,RATING_SEEDS:{},RATING_OVERRIDES:{},REGLAMENTO:'<p>Reglas de prueba</p>'};}
function match(extra={}){return {id:1,cycle:1,g:1,po:false,aName:'Alicia',bName:'Beto',sets:[[6,3],[6,2]],date:'2026-09-16',club:'Sohail',status:'pending',reporter:'Alicia',locked:false,...extra};}
function req(db,name='Alicia',body={},query={},method='POST'){return {headers:{authorization:'Bearer '+db.token(name),'x-forwarded-for':'192.0.2.1',host:'sohail.test'},method,body,query};}
async function call(handler,request){const headers={};let body;const res={statusCode:200,headersSent:false,setHeader(k,v){headers[k]=v;},getHeader:k=>headers[k],status(n){this.statusCode=n;return this;},json(v){body=v;this.headersSent=true;return this;},end(v){body=v;this.headersSent=true;}};await handler(request,res);return {status:res.statusCode,body,headers};}
module.exports={createDB,fixture,match,req,call,lib};
