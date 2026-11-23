'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const M=require('./support/mock-db.cjs'),{guard,rotationTracker}=require('../public/security-account');
const passkey=require('../api/passkey'),liga=require('../api/liga'),stateRoute=require('../api/state');
const R=require('../public/request-task');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const response=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json'}});
function installFetch(db){
 const old=global.fetch;
 global.fetch=(input,opts)=>{const u=new URL(input);const p=u.searchParams.get('principal_key');
  // mock-db's in parser only accepts unquoted strings; emulate PostgREST quoting.
  if(p?.startsWith('in.("'))u.searchParams.set('principal_key','in.('+JSON.parse('['+p.slice(4,-1)+']').join(',')+')');
  return db.fetch(String(u),opts);
 };
 return ()=>{global.fetch=old;};
}
async function run(fn,states){const db=M.createDB(states||[{id:"liga-actual",state:JSON.parse(JSON.stringify(M.fixture()))}]),restore=installFetch(db);try{return await fn(db);}finally{restore();}}
const req=(db,actor,body)=>({...M.req(db,actor,body),headers:{...M.req(db,actor).headers,'content-type':'application/json',origin:'https://sohail.test'}});
const row=(p,id='credential_0123456789',extra={})=>({principal_key:p,credential_id:id,device_label:'Test phone',created_at:'2026-10-01',last_used_at:null,public_key:'NEVER-EXPORT-KEY',counter:18,...extra});
test('RF overview returns one scoped result and never credential secrets',()=>run(async db=>{
 db.tables.passkeys=[row('g:profile-0'),row('g:foreign','foreign_0123456789')];
 const r=await M.call(passkey,req(db,'admin',{accion:'admin-overview',ligaId:'liga-actual'}));
 assert.equal(r.status,200);assert.equal(r.body.totalJugadores,5);assert.equal(r.body.conPasskey,1);assert.equal(r.body.totalPasskeys,1);assert.equal(r.body.jugadores[0].nombre,'Alicia');
 assert.ok(!JSON.stringify(r.body).includes('NEVER-EXPORT'));assert.ok(!JSON.stringify(r.body).includes('counter'));assert.ok(!JSON.stringify(r.body).includes('foreign'));
 assert.equal(db.requests.filter(x=>x.name==='passkeys').length,1);
}));
for(const actor of ['Alicia','Beto'])test('RF overview denies non-admin '+actor,()=>run(async db=>{const r=await M.call(passkey,req(db,actor,{accion:'admin-overview'}));assert.equal(r.status,403);assert.equal(db.requests.filter(x=>x.name==='passkeys').length,0);}));
test('RF overview denies unauthenticated reads',()=>run(async db=>{const r=await M.call(passkey,{method:'POST',headers:{host:'sohail.test'},body:{accion:'admin-overview'}});assert.equal(r.status,401);}));
test('RF foreign-league membership is checked independently',()=>{const a=M.fixture(),b=M.fixture();b.users.admin._credentialId='other-admin';return run(async db=>{const r=await M.call(passkey,req(db,'admin',{accion:'admin-overview',ligaId:'other'}));assert.equal(r.status,403);},[{id:'liga-actual',state:a},{id:'other',state:b}]);});
test('RF inactive users and privileged targets are not leaked to a delegate',()=>run(async db=>{
 db.state().users.Alicia.isAdmin=true;db.state().users.Beto.isAdmin=true;db.state().users.Ciro.inactive=true;
 db.tables.passkeys=[row('g:profile-1'),row('g:profile-2','second_0123456789'),row('g:profile-3','third_0123456789')];
 const r=await M.call(passkey,req(db,'Alicia',{accion:'admin-overview'}));assert.equal(r.status,200);assert.deepEqual(r.body.jugadores.map(x=>x.nombre),['Diego']);
}));
test('RF overview paginates device rows instead of silently truncating',()=>run(async db=>{
 db.tables.passkeys=Array.from({length:503},(_,i)=>row('g:profile-0','credential_'+String(i).padStart(8,'0')));
 const r=await M.call(passkey,req(db,'admin',{accion:'admin-overview'}));assert.equal(r.status,200);assert.equal(r.body.totalPasskeys,503);assert.equal(db.requests.filter(x=>x.name==='passkeys').length,3);
}));
test('RF overview database failure is an error, not zero registered devices',()=>run(async db=>{db.fault=x=>x.name==='passkeys';const r=await M.call(passkey,req(db,'admin',{accion:'admin-overview'}));assert.equal(r.status,503);assert.equal(r.body.jugadores,undefined);}));
test('RF authentication quota still rejects the 31st request',()=>run(async db=>{
 for(let i=0;i<30;i++)assert.equal((await M.call(passkey,req(db,'admin',{accion:'admin-overview'}))).status,200);
 const r=await M.call(passkey,req(db,'admin',{accion:'admin-overview'}));assert.equal(r.status,429);assert.equal(r.body.code,'REQUEST_RATE_LIMIT');assert.ok(Number(r.headers['Retry-After'])>0);
}));
function panel(fetcher){
 const nodes={'pk-admin-metrics':{textContent:'',innerHTML:''},'pk-admin-list':{innerHTML:'',querySelectorAll:()=>[]}};
 const c=vm.createContext({document:{getElementById:id=>nodes[id]},_token:'token',_ligaActual:'liga',fetch:fetcher,AbortSignal,Date,Promise,JSON,Number,Array,console,
  t:k=>k,mostrarSkeleton:e=>{e.innerHTML='loading';},apiError:d=>d.error||'Error',_pkEsc:x=>String(x).replace(/[&<>"']/g,'_')});
 const s=read('public/login-auth-p2.js'),a=s.indexOf('let _pkAdminRequest='),z=s.indexOf('// Admin desactiva',a);vm.runInContext(s.slice(a,z),c);return {c,nodes};
}
test('RF 100 panel redraws issue zero device HTTP requests',async()=>{let calls=0;const p=panel(async()=>{calls++;});for(let i=0;i<100;i++)await p.c.cargarPasskeysAdmin();assert.equal(calls,0);assert.match(p.nodes['pk-admin-list'].innerHTML,/Consultar dispositivos/);});
test('RF concurrent explicit device opens share one request and reuse short cache',async()=>{
 let calls=0,resolve;const p=panel(async()=>{calls++;return new Promise(r=>resolve=r);});
 const a=p.c.cargarPasskeysAdmin(true),b=p.c.cargarPasskeysAdmin(true);assert.equal(calls,1);
 resolve(response({ok:true,jugadores:[],totalJugadores:120,conPasskey:0,totalPasskeys:0,pct:0}));await Promise.all([a,b]);await p.c.cargarPasskeysAdmin(true);assert.equal(calls,1);
});
test('RF late device response from previous league is discarded',async()=>{
 let resolve;const p=panel(()=>new Promise(r=>resolve=r));const job=p.c.cargarPasskeysAdmin(true);p.c._ligaActual='other';p.nodes['pk-admin-list'].innerHTML='other-view';resolve(response({ok:true,jugadores:[],conPasskey:0}));await job;assert.equal(p.nodes['pk-admin-list'].innerHTML,'other-view');
});
test('RF failed overview is not cached and displays error inline',async()=>{let calls=0;const p=panel(async()=>{calls++;return response({error:'Unavailable'},503);});await p.c.cargarPasskeysAdmin(true);assert.match(p.nodes['pk-admin-list'].innerHTML,/Unavailable/);await p.c.cargarPasskeysAdmin(true);assert.equal(calls,2);});
test('RF proof receipt permits only a locally verified rotation and expires',()=>{let now=0;const r=rotationTracker(()=>now);assert.equal(r.matches('liga|old','liga|new'),false);r.record('liga|old','liga|new');assert.equal(r.matches('liga|old','liga|new'),true);assert.equal(r.matches('liga|old','other|new'),false);now=60001;assert.equal(r.matches('liga|old','liga|new'),false);r.record('a','b');r.clear();assert.equal(r.matches('a','b'),false);});
test('RF actual sid rotation retries only the explicitly rejected mutation once',async()=>{
 let token='old',ctx='liga|old',calls=0;const receipts=rotationTracker();
 const f=guard({origin:'https://sohail.test',getToken:()=>token,context:()=>ctx,sameContext:before=>receipts.matches(before,ctx),verify:async()=>{const before=ctx;token='new';ctx='liga|new';receipts.record(before,ctx);return true;},fetcher:async(_u,o)=>{calls++;return calls===1?response({code:'REAUTH_REQUIRED'},403):response({auth:new Headers(o.headers).get('Authorization')});}});
 const r=await f('/api/liga',{method:'POST',headers:{Authorization:'Bearer old'},body:'{}'});assert.equal(calls,2);assert.equal((await r.json()).auth,'Bearer new');
});
test('RF arbitrary sid change is still rejected after a verification dialog',async()=>{
 let ctx='old',calls=0;const receipts=rotationTracker();const f=guard({origin:'https://sohail.test',getToken:()=> 'token',context:()=>ctx,sameContext:old=>receipts.matches(old,ctx),verify:async()=>{ctx='different';return true;},fetcher:async()=>{calls++;return response({code:'REAUTH_REQUIRED'},403);}});
 await f('/api/liga',{method:'POST',headers:{Authorization:'Bearer token'},body:'{}'});assert.equal(calls,1);
});
for(const group of [0,1])test('RF new player saved additively in group '+group,()=>run(async db=>{
 const previous=structuredClone(db.state()),r=await M.call(liga,req(db,'admin',{accion:'agregarJugadores',id:'liga-actual',ligaId:'liga-actual',jugadores:[{nombre:'Nueva Persona',grupo:group}]}));
 assert.equal(r.status,200,JSON.stringify(r.body));assert.deepEqual(r.body.agregados,['Nueva Persona']);assert.deepEqual(db.state().matches,previous.matches);assert.equal(db.state().ALLNAMES.filter(n=>n==='Nueva Persona').length,1);
 assert.equal(db.state().cycles[0].groups[0].players.includes('Nueva Persona'),group===1);
 const again=await M.call(liga,req(db,'admin',{accion:'agregarJugadores',id:'liga-actual',jugadores:[{nombre:'Nueva Persona',grupo:group}]}));assert.equal(again.status,200);assert.deepEqual(again.body.agregados,[]);
}));
for(const group of [-1,1.5,99,'x'])test('RF invalid group is rejected before changing any profile '+group,()=>run(async db=>{const before=JSON.stringify(db.state());const r=await M.call(liga,req(db,'admin',{accion:'agregarJugadores',id:'liga-actual',jugadores:[{nombre:'Nueva Persona',grupo:group}]}));assert.equal(r.status,400);assert.equal(JSON.stringify(db.state()),before);assert.equal(db.requests.filter(x=>x.name==='jugadores'&&x.method==='POST').length,0);}));
test('RF duplicate player preserves credentials and contact metadata',()=>run(async db=>{const before=structuredClone(db.state().users.Alicia);const r=await M.call(liga,req(db,'admin',{accion:'agregarJugadores',id:'liga-actual',jugadores:[{nombre:'Alicia',grupo:0}]}));assert.equal(r.status,200);assert.deepEqual(r.body.agregados,[]);assert.deepEqual(db.state().users.Alicia,before);}));
test('RF closed cycle refuses group assignment, permits unassigned player',()=>run(async db=>{db.state().cycles[0].status='finished';const b={accion:'agregarJugadores',id:'liga-actual',jugadores:[{nombre:'Nueva Persona',grupo:1}]};assert.equal((await M.call(liga,req(db,'admin',b))).status,409);b.jugadores[0].grupo=0;assert.equal((await M.call(liga,req(db,'admin',b))).status,200);}));
test('RF catalogue read failure cannot create a replacement identity',()=>run(async db=>{db.fault=x=>x.name==='jugadores'&&x.method==='GET';const r=await M.call(liga,req(db,'admin',{accion:'agregarJugadores',id:'liga-actual',jugadores:[{nombre:'Nueva Persona',grupo:0}]}));assert.equal(r.status,503);assert.ok(!db.state().users['Nueva Persona']);}));
function client(fetcher,overrides={}){
 const st=M.fixture(),nodes={};
 const c=vm.createContext({console:{log(){},warn(){},error(){}},window:{dispatchEvent(){}},Event,Headers,AbortSignal,Response,JSON,Date,Number,Array,Set,Map,Promise,SohailRequest:R,
  document:{getElementById:id=>nodes[id]||null,querySelector:()=>null},toast:()=>{},t:k=>k,currentUser:{key:'admin',name:'Organización'},esAdmin:()=>true,
  _token:'test-token',_ligaActual:'liga-actual',_ligaReadOnly:false,_dataOperationBusy:false,_loadOK:true,_saveConflict:false,_saveUnconfirmed:false,_saveInFlight:null,_unconfirmedAttempt:null,
  _lastSaved:'',_saveSessionKey:()=> 'sid',_sameVerifiedSaveSession:k=>k==='sid',_hasPendingChanges:()=>false,_criticalSave:async()=>true,_hideLoadError:()=>{},
  USERS:structuredClone(st.users),ALLNAMES:structuredClone(st.ALLNAMES),fetch:fetcher,apiError:d=>d.error||d.code||'Failure',...overrides});
 c._serialize=()=>JSON.stringify({users:c.USERS,all:c.ALLNAMES});c._hydrate=s=>{c.USERS=structuredClone(s.users);c.ALLNAMES=structuredClone(s.ALLNAMES);return true;};
 const src=read('public/login-auth.js'),a=src.indexOf('let _altaJugadoresBusy='),z=src.indexOf('async function agregarJugadoresConfirmar()',a);vm.runInContext(src.slice(a,z),c);
 const view=read('public/playoffs.js'),v=view.indexOf('async function addPlayerUI(){'),end=view.indexOf('async function setDestino(',v);vm.runInContext(view.slice(v,end),c);
 return {c,nodes,state:st,pending:()=>vm.runInContext('_altaJugadoresPending',c)};
}
const payload=[{nombre:'Nueva Persona',grupo:0}];
const added=()=>{const s=M.fixture();s.users['Nueva Persona']={name:'Nueva Persona',role:'player'};s.ALLNAMES.push('Nueva Persona');s._v++;return s;};
test('RF UI confirms add once, then reads state without invoking login initialization',async()=>{
 const calls=[];const x=client(async(u,o)=>{calls.push([u,o.method||'GET']);return u==='/api/liga'?response({ok:true,agregados:['Nueva Persona']}):response({state:added()});});
 const result=await x.c.guardarAltaJugadores(payload);assert.deepEqual(JSON.parse(JSON.stringify(result.agregados)),['Nueva Persona']);assert.equal(calls.filter(x=>x[1]==='POST').length,1);assert.equal(x.pending(),null);assert.equal(x.c._dataOperationBusy,false);assert.equal(x.c._loadOK,true);
});
for(const status of [400,401,403,409,429])test('RF rejected player request preserves local users and has no false success '+status,async()=>{
 let calls=0;const x=client(async()=>{calls++;return response({code:'DENIED',error:'Explicit reason'},status);}),before=JSON.stringify(x.c.USERS);
 await assert.rejects(x.c.guardarAltaJugadores(payload),/Explicit reason/);assert.equal(calls,1);assert.equal(JSON.stringify(x.c.USERS),before);assert.equal(x.pending(),null);assert.equal(x.c._dataOperationBusy,false);
});
test('RF lost write response is checked, not submitted again, and found player is recovered',async()=>{
 let calls=0;const x=client(async(u)=>{calls++;if(u==='/api/liga')throw Error('lost');return response({state:added()});});
 await assert.rejects(x.c.guardarAltaJugadores(payload),/No se confirmó/);assert.equal(x.c._loadOK,false);assert.ok(x.pending());
 const result=await x.c.guardarAltaJugadores(payload);assert.equal(result.recovered,true);assert.equal(calls,2);assert.equal(x.pending(),null);assert.equal(x.c._loadOK,true);
});
test('RF uncommitted uncertain write requires a second explicit action after read',async()=>{
 let calls=0;const x=client(async(u)=>{calls++;if(u==='/api/liga')throw Error('lost');return response({state:M.fixture()});});await assert.rejects(x.c.guardarAltaJugadores(payload));await assert.rejects(x.c.guardarAltaJugadores(payload),/no se agregó ningún jugador/);assert.equal(calls,2);assert.equal(x.pending(),null);assert.equal(x.c._loadOK,true);
});
test('RF successful write plus failed refresh is not re-created on check',async()=>{
 let writes=0,reads=0;const x=client(async(u)=>{if(u==='/api/liga'){writes++;return response({ok:true,agregados:['Nueva Persona']});}reads++;if(reads===1)throw Error('read down');return response({state:added()});});
 await assert.rejects(x.c.guardarAltaJugadores(payload),/servidor confirmó/);assert.equal(x.c._loadOK,false);await x.c.guardarAltaJugadores(payload);assert.equal(writes,1);assert.equal(reads,2);
});
test('RF double submit never duplicates a player write',async()=>{let resolve,writes=0;const x=client(async(u)=>{if(u==='/api/liga'){writes++;return new Promise(r=>resolve=r);}return response({state:added()});});const p=x.c.guardarAltaJugadores(payload);await assert.rejects(x.c.guardarAltaJugadores(payload),/ya se está/);resolve(response({ok:true,agregados:['Nueva Persona']}));await p;assert.equal(writes,1);});
test('RF cancelled identity proof sends no player write',async()=>{let writes=0;const x=client(async()=>{writes++;});const security={ensureFresh:async()=>false};x.c.window.SohailSecurity=security;x.c.SohailSecurity=security;await assert.rejects(x.c.guardarAltaJugadores(payload),/cancelada/);assert.equal(writes,0);});
test('RF unsuccessful flush prevents the new-player mutation',async()=>{let writes=0;const x=client(async()=>{writes++;},{_hasPendingChanges:()=>true,_criticalSave:async()=>false});await assert.rejects(x.c.guardarAltaJugadores(payload),/cambios anteriores/);assert.equal(writes,0);});
test('RF form fields survive a rejected save and render is not called',async()=>{
 const x=client(async()=>response({error:'Too many',code:'REQUEST_RATE_LIMIT'},429));let rendered=0;x.c.renderPerfil=()=>rendered++;
 for(const [id,value]of [['ap-nom','Nueva'],['ap-ape','Persona'],['ap-grp','0']])x.nodes[id]={value,disabled:false,isConnected:true};
 await x.c.addPlayerUI();assert.equal(rendered,0);assert.equal(x.nodes['ap-nom'].value,'Nueva');assert.equal(x.nodes['ap-ape'].value,'Persona');assert.equal(x.nodes['ap-nom'].disabled,false);
});
test('RF pre-existing unassigned profile cannot be deleted by the add form',async()=>{
 let calls=0;const x=client(async()=>{calls++;});x.c.USERS['Nueva Persona']={role:'player',email:'keep@example.invalid',jugadorId:'keep-id'};
 for(const [id,value]of [['ap-nom','Nueva'],['ap-ape','Persona'],['ap-grp','1']])x.nodes[id]={value,disabled:false};const before=JSON.stringify(x.c.USERS);await x.c.addPlayerUI();assert.equal(calls,0);assert.equal(JSON.stringify(x.c.USERS),before);
});
test('RF concurrent local edits are never overwritten by add refresh',async()=>{
 const x=client(async(u)=>{if(u==='/api/liga'){x.c.USERS.Alicia.phone='new-local';return response({ok:true,agregados:['Nueva Persona']});}return response({state:added()});});
 await assert.rejects(x.c.guardarAltaJugadores(payload),/otros cambios locales/);assert.equal(x.c.USERS.Alicia.phone,'new-local');await assert.rejects(x.c.guardarAltaJugadores(payload),/otros cambios locales/);
});
test('RF real reauthentication endpoint rotates sid and guarded add completes once',()=>run(async db=>{
 let token=db.token('admin'),context=()=>M.lib.verifyToken(token).sid;const receipt=rotationTracker(),calls=[];
 const oldSid=context();for(const s of db.tables.sohail_auth_sessions)s.verified_at=new Date(Date.now()-700000).toISOString();
 const transport=async(url,init)=>{const body=JSON.parse(init.body),headers=Object.fromEntries(new Headers(init.headers));calls.push(body.accion);const r=await M.call(url==='/api/login'?require('../api/login'):liga,{method:'POST',headers:{...headers,host:'sohail.test',origin:'https://sohail.test','x-sohail-session':'1'},body,query:{}});return response(r.body,r.status);};
 const guarded=guard({fetcher:transport,origin:'https://sohail.test',getToken:()=>token,context,sameContext:before=>receipt.matches(before,context()),verify:async()=>{
  const prior=context(),r=await transport('/api/login',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({accion:'session-reauth',pass:'prueba123'})});assert.equal(r.status,200);token=(await r.json()).token;assert.notEqual(context(),prior);receipt.record(prior,context());return true;
 }});
 const result=await guarded('/api/liga',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({accion:'agregarJugadores',id:'liga-actual',jugadores:payload})});
 assert.equal(result.status,200);assert.notEqual(context(),oldSid);assert.deepEqual(calls,['agregarJugadores','session-reauth','agregarJugadores']);assert.equal(db.state().ALLNAMES.filter(n=>n==='Nueva Persona').length,1);assert.equal(db.requests.filter(r=>r.name==='sohail_write_state').length,1);
}));
test('RF catalogue insert failure never reports success or modifies league',()=>run(async db=>{db.fault=r=>r.name==='jugadores'&&r.method==='POST';const before=JSON.stringify(db.state());const r=await M.call(liga,req(db,'admin',{accion:'agregarJugadores',id:'liga-actual',jugadores:payload}));assert.equal(r.status,503);assert.equal(JSON.stringify(db.state()),before);}));
test('RF additive insert preserves a concurrent global profile password',()=>run(async db=>{
 const crypto=require('node:crypto'),id='p_'+crypto.createHash('sha256').update('nueva persona').digest('hex').slice(0,10),key='preserve-existing-password';let inserted=false;
 db.fault=r=>{if(r.name==='jugadores'&&r.method==='POST'&&!inserted){inserted=true;db.tables.jugadores.push({id,nombre:'Nueva Persona',email:'preserve@example.invalid',pass:key});}return false;};
 const r=await M.call(liga,req(db,'admin',{accion:'agregarJugadores',id:'liga-actual',jugadores:payload}));assert.equal(r.status,200);assert.equal(db.tables.jugadores.find(j=>j.id===id).pass,key);assert.equal(db.state().users['Nueva Persona'].pass,key);
}));
test('RF disappeared catalogue selection is rejected without writes',()=>run(async db=>{const r=await M.call(liga,req(db,'admin',{accion:'agregarJugadores',id:'liga-actual',jugadores:[{jugadorId:'not-in-catalogue',grupo:0}]}));assert.equal(r.status,400);assert.equal(r.body.code,'PLAYER_NOT_FOUND');assert.equal(db.requests.filter(r=>r.name==='sohail_write_state').length,0);}));
test('RF league commit failure cannot masquerade as a confirmed addition',()=>run(async db=>{db.fault=r=>r.name==='sohail_write_state';const r=await M.call(liga,req(db,'admin',{accion:'agregarJugadores',id:'liga-actual',jugadores:payload}));assert.equal(r.status,503);assert.equal(db.state().users['Nueva Persona'],undefined);}));
test('RF uncertain typed name checks the canonical accent-normalized profile',async()=>{
 const c=client(async()=>{}).c,s=M.fixture();s.users['José Pérez']={role:'player',jugadorId:'canonical'};assert.equal(c._altaFound(s,{nombre:'JOSE  PEREZ',grupo:0}),'José Pérez');
});
