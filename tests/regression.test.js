'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
process.env.SESSION_SECRET='LOCAL-TEST-NOT-A-PRODUCTION-SECRET';
process.env.SUPABASE_URL='https://database.invalid';process.env.SUPABASE_SERVICE_KEY='sb_secret_test';
const v=require('../api/_validation');const lib=require('../api/_lib');const score=require('../public/score-rules');
function fixture(){return {_v:3,users:{admin:{role:'admin',pass:'private',name:'Organización'},superadmin:{role:'superadmin',pass:'private'},Alicia:{role:'player',pass:'private',name:'Alicia',email:'a@example.invalid'},Beto:{role:'player',pass:'private',name:'Beto'},Ciro:{role:'player',pass:'private',name:'Ciro'}},cycles:[{n:1,status:'active',groups:[{players:['Alicia','Beto','Ciro']}]}],matches:[],matchId:1,activeN:1,ALLNAMES:['Alicia','Beto','Ciro'],playoff:{started:false,tramos:[]},CLUBS:[{name:'Sohail',bg:'#D6ECFB'}],REGLAMENTO:'<p>Reglas</p>',AJUSTES_PUNTOS:{},LOG:[],JOIN_REQUESTS:[]};}
function match(){return {id:1,cycle:1,g:1,aName:'Alicia',bName:'Beto',sets:[[6,2],[6,3]],date:'2026-09-10',club:'Sohail',status:'pending',reporter:'Alicia',locked:false};}
const clone=structuredClone;
for(const [name,mut]of Object.entries({puntos:s=>s.AJUSTES_PUNTOS={1:{1:{Alicia:10}}},reglamento:s=>s.REGLAMENTO='modificado',rol:s=>s.users.Alicia.isAdmin=true,identidad:s=>s.users.Alicia.jugadorId='other',inactividad:s=>s.users.Beto.inactive=true,campoDesconocido:s=>s.evil=true}))test('R1: jugador no cambia '+name,()=>{const s=fixture(),i=clone(s);mut(i);assert.throws(()=>v.protectState(s,i,{u:'Alicia',r:'player'},false,false),e=>e.status===403);});
test('R1: administrador delegado no eleva role',()=>{const s=fixture();s.users.Alicia.isAdmin=true;const i=clone(s);i.users.Beto.role='admin';assert.throws(()=>v.protectState(s,i,{u:'Alicia',r:'player'},true,false));});
test('R1: resultado propio permitido',()=>{const s=fixture(),i=clone(s);i.matches=[match()];v.protectState(s,i,{u:'Alicia',r:'player'},false,false);assert.equal(i.matches[0].reporter,'Alicia');});
test('R1: reporter falso no convierte partido ajeno en propio',()=>{const s=fixture(),i=clone(s);i.matches=[{...match(),aName:'Beto',bName:'Ciro',reporter:'Alicia'}];assert.throws(()=>v.protectState(s,i,{u:'Alicia',r:'player'},false,false));});
test('R1: jugador no confirma resultados',()=>{const s=fixture(),i=clone(s);i.matches=[{...match(),status:'confirmed'}];assert.throws(()=>v.protectState(s,i,{u:'Alicia',r:'player'},false,false));});
test('R1: marcador normal y supertiebreak de la liga',()=>{assert.equal(score.validMatch([[6,2],[6,3]]).ok,true);assert.equal(score.validMatch([[6,2],[2,6],[1,0]]).ok,true);});
for(const sets of [[[6,-1],[6,2]],[[6,2.5],[6,3]],[[6,0],[6,0],[1,0],[1,0]],[[6,1],[2,6],[10,8]],[[6,1],[6,2],[1,0]],[[6,1]],null])test('R1: marcador inválido '+JSON.stringify(sets),()=>assert.equal(score.validMatch(sets).ok,false));
test('R1: RET admite sets completos pero no parcial ni partido terminado',()=>{assert.equal(score.validRetirement([]),true);assert.equal(score.validRetirement([[6,3]]),true);assert.equal(score.validRetirement([[3,2]]),false);assert.equal(score.validRetirement([[6,3],[6,2]]),false);});
test('R1: hashes nunca salen al admin',()=>{const s=lib.filterForSession(fixture(),{u:'admin',r:'admin'});assert.ok(Object.values(s.users).every(u=>!('pass'in u)));assert.ok(s.users.Alicia.identityRef);});
test('R1: público sin contactos ni solicitudes ni log',()=>{const s=fixture();s.JOIN_REQUESTS=[{email:'private'}];s.LOG=[{private:true}];const p=lib.filterPublicState(s);assert.ok(!p.users.Alicia.email);assert.ok(!p.JOIN_REQUESTS);assert.ok(!p.LOG);});
test('R1: rol del token no autoriza en una liga ajena',()=>assert.equal(lib.sesionEsAdmin({u:'intruso',r:'admin'},fixture().users),false));
test('R1: datos privados omitidos no bloquean un guardado legítimo',()=>{const s=fixture(),i=lib.filterForSession(clone(s),{u:'Alicia',r:'player'});i.matches=[match()];v.protectState(s,i,{u:'Alicia',r:'player'},false,false);assert.equal(i.users.Beto.pass,'private');});
test('R1: clave peligrosa de JSON rechazada',()=>assert.throws(()=>v.safeTree(JSON.parse('{"__proto__":{"x":1}}'))));
module.exports={fixture,match};
const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
function persistenceContext(fetcher){
 const base=fixture();
 const ctx={console:{log(){},warn(){},error(){}},fetch:fetcher,AbortSignal,JSON,Promise,Blob,setTimeout:()=>0,setInterval:()=>0,clearTimeout(){},structuredClone,atob:s=>Buffer.from(s,'base64').toString(),t:k=>k,
   document:{getElementById:()=>null,addEventListener(){},createElement:()=>({style:{},appendChild(){},replaceChildren(){},setAttribute(){}}),body:{appendChild(){}}},window:{addEventListener(){}},
   currentUser:{name:'Alicia'},_token:'token-test',_ligaActual:'liga-test',_ligaReadOnly:false,RATING_ON:false,
   cycles:base.cycles,matches:[],matchId:1,activeN:1,playoff:base.playoff,DESTINO:{},FECHAS:{},PO_FECHAS:{},ALLNAMES:base.ALLNAMES,USERS:base.users,PUNTOS:{},AJUSTES_PUNTOS:{},LOG:[],LEAGUE_NAME:'Prueba',LEAGUE_SUBTITLE:'',LOGIN_TITLE:'',LEAGUE_COLOR_PRI:'#123456',LEAGUE_COLOR_ACC:'#123456',LEAGUE_COLOR_HL:'#123456',LEAGUE_TEXT_COLORS:{},CLUBS:base.CLUBS,COLOR_DISPUTA:'#123456',RATING_SEEDS:{},RATING_OVERRIDES:{},REGLAMENTO:'',LOGIN_HEADER:{},JOIN_REQUESTS:[]};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/persistencia.js'),'utf8'),ctx);vm.runInContext('_loadOK=true;_stateV=3;_lastSaved=_serialize();',ctx);return ctx;
}
test('R2: RPC utiliza versión leída y actualiza versión recibida',async()=>{
 const calls=[];const prev=global.fetch;global.fetch=async(url,o)=>{calls.push({url,o});return {ok:true,json:async()=>url.includes('/rpc/')?{ok:true,version:8}:[{data:JSON.stringify({_v:7,users:{}})}]};};
 try{const s=await lib.readState('test');s.users.a={};await lib.writeState('test',s);const body=JSON.parse(calls[1].o.body);assert.equal(body.p_expected,7);assert.equal(s._v,8);}finally{global.fetch=prev;}
});
test('R2: conflicto SQL se propaga y nunca cae a un upsert incondicional',async()=>{
 const prev=global.fetch;let calls=0;global.fetch=async()=>{calls++;return {ok:true,json:async()=>({ok:false,currentV:5})};};
 try{await assert.rejects(lib.writeState('test',{_v:3,users:{}}),e=>e.status===409);assert.equal(calls,1);}finally{global.fetch=prev;}
});
test('R2: cambios en vuelo quedan pendientes y se transmiten en segundo envío',async()=>{
 let resolve, calls=[];
 const ctx=persistenceContext(async(_,o)=>{calls.push(JSON.parse(o.body));if(calls.length===1)await new Promise(r=>resolve=r);return {ok:true,json:async()=>({version:3+calls.length})};});
 vm.runInContext("LEAGUE_NAME='Primero'",ctx);const p=vm.runInContext('persist(true)',ctx);
 vm.runInContext("LEAGUE_NAME='Segundo'",ctx);resolve();await p;
 assert.equal(calls.length,2);assert.equal(calls[0].state.LEAGUE_NAME,'Primero');assert.equal(calls[1].state.LEAGUE_NAME,'Segundo');
 assert.equal(vm.runInContext('_serialize()===_lastSaved',ctx),true);
});
test('R2: 409 no adopta la versión remota ni reenvía datos antiguos',async()=>{
 let n=0;const ctx=persistenceContext(async()=>{n++;return{ok:false,status:409,json:async()=>({currentV:99,error:'Conflict'})};});
 await vm.runInContext('persist(true)',ctx);await vm.runInContext('persist(true)',ctx);
 assert.equal(n,1);assert.equal(vm.runInContext('_stateV',ctx),3);assert.equal(vm.runInContext('_saveConflict',ctx),true);
});
test('R2: respuesta tardía no modifica otra liga',async()=>{
 let resolve;const ctx=persistenceContext(async()=>{await new Promise(r=>resolve=r);return{ok:true,json:async()=>({version:100,token:'old'})};});
 const p=vm.runInContext('_doPersist()',ctx);ctx._ligaActual='otra-liga';resolve();await p;assert.equal(vm.runInContext('_stateV',ctx),3);assert.equal(ctx._token,'token-test');
});
test('R2: dos invocaciones simultáneas se serializan',async()=>{
 let resolve,n=0;const ctx=persistenceContext(async()=>{n++;await new Promise(r=>resolve=r);return{ok:true,json:async()=>({version:4})};});
 const a=vm.runInContext('_doPersist()',ctx),b=vm.runInContext('_doPersist()',ctx);resolve();await Promise.all([a,b]);assert.equal(n,1);
});
function authFixture(epoch=0,must=false){const state=fixture();return {state,account:{id:'n:Alicia',epoch,must_change:must,pass_hash:lib.hashV2('segura123'),tutorial_epoch:1,tutorial_done_epoch:0,tutorial_version:0}};}
function tokenFor(extra={}){return lib.signToken({u:'Alicia',r:'player',src:'liga-test',pk:'n:Alicia',sv:0,exp:Date.now()+60000,...extra});}
function requestFor(token){return {headers:{authorization:'Bearer '+token}};}
async function mockedAuth(f,fn){const prev=global.fetch;global.fetch=async url=>({ok:true,json:async()=>url.includes('sohail_account_security')?[f.account]:[{data:f.state}]});try{return await fn();}finally{global.fetch=prev;}}
test('R3: token vigente y cuenta activa autentican',()=>mockedAuth(authFixture(),async()=>assert.equal((await lib.auth(requestFor(tokenFor()))).u,'Alicia')));
test('R3: restablecimiento revoca token anterior por epoch',()=>mockedAuth(authFixture(1),async()=>assert.equal(await lib.auth(requestFor(tokenFor())),null)));
test('R3: token de la versión anterior no sirve',async()=>assert.equal(await lib.auth(requestFor(lib.signToken({u:'Alicia',r:'player',exp:Date.now()+10000}))),null));
test('R3: cambio por defecto se exige en servidor',()=>mockedAuth(authFixture(0,true),async()=>assert.rejects(lib.auth(requestFor(tokenFor())),e=>e.code==='PASSWORD_CHANGE_REQUIRED')));
test('R3: la ruta de cambio de contraseña acepta sesión pendiente',()=>mockedAuth(authFixture(0,true),async()=>assert.equal((await lib.auth(requestFor(tokenFor()),true)).m,true)));
test('R3: cuenta dada de baja pierde acceso inmediatamente',()=>{const f=authFixture();f.state.users.Alicia.inactive=true;return mockedAuth(f,async()=>assert.equal(await lib.auth(requestFor(tokenFor())),null));});
test('R3: suplantación de identidad global no autentica',()=>{const f=authFixture();f.state.users.Alicia.jugadorId='otro';return mockedAuth(f,async()=>assert.equal(await lib.auth(requestFor(tokenFor())),null));});
test('R3: rol actual prevalece sobre el token',()=>mockedAuth(authFixture(),async()=>assert.equal((await lib.auth(requestFor(tokenFor({r:'admin'})))).r,'player')));
test('R3: liga con mismo nombre pero distinta identidad no autoriza',()=>{const s=fixture();s.users.Alicia.jugadorId='distinto';s.users.Alicia.isAdmin=true;assert.equal(lib.sesionEsAdmin({u:'Alicia',pk:'n:Alicia'},s.users),false);assert.ok(lib.blockedUser(s,{u:'Alicia',pk:'n:Alicia'}));});
test('R3: JWT adulterado y expirado no verifican',()=>{assert.equal(lib.verifyToken(tokenFor().slice(0,-3)+'xxx'),null);assert.equal(lib.verifyToken(tokenFor({exp:Date.now()-1})),null);});
// R5/R6: regression of the fixes found during interface integration.
test('R5: currentUser.key is not sent as persisted user data',()=>{
 const ctx=persistenceContext(async()=>{});ctx.USERS.Alicia.key='Alicia';
 assert.equal(JSON.parse(vm.runInContext('_serialize()',ctx)).users.Alicia.key,undefined);
});
test('R5: retirement and walkover valid on server',()=>{
 for(const sets of [[],[[6,3]],[[6,3],[2,6]]]){const s=fixture(),i=clone(s);i.matches=[{...match(),wo:true,retiroDe:'Beto',winner:'Alicia',sets}];assert.doesNotThrow(()=>v.protectState(s,i,{u:'Alicia',r:'player'},false,false));}
});
test('R5: server refuses an impossible retirement winner',()=>{const s=fixture(),i=clone(s);i.matches=[{...match(),wo:true,retiroDe:'Beto',winner:'Beto',sets:[]}];assert.throws(()=>v.protectState(s,i,{u:'Alicia',r:'player'},false,false));});
test('R5: playoff coordinates validated against the draw',()=>{
 const s=fixture();s.playoff={started:true,tramos:[{main:[[{a:'Alicia',b:'Beto'}]],cons:[]}]};
 const i=clone(s);i.matches=[{...match(),po:true,poNames:['Alicia','Beto'],ti:0,which:'main',ri:0,mi:0,winner:'Alicia'}];
 assert.doesNotThrow(()=>v.protectState(s,i,{u:'Alicia',r:'player'},false,false));
 const invalid=clone(s);invalid.matches=[{...i.matches[0],mi:5}];assert.throws(()=>v.protectState(s,invalid,{u:'Alicia',r:'player'},false,false));
});
test('R5: playoff messages retain draw coordinates in INSERT and SELECT',async()=>{
 const prev=global.fetch,calls=[];global.fetch=async(url,o)=>{calls.push({url,o});return{ok:true,json:async()=>[]};};
 try{
 await lib.insertarMensaje({ligaId:'prueba',tipo:'playoff',ciclo:0,grupo:2,autor:'Alicia',texto:'Hola'});
 assert.equal(JSON.parse(calls[0].o.body).grupo,2);assert.equal(JSON.parse(calls[0].o.body).ciclo,0);
 await lib.leerMensajes({ligaId:'prueba',tipo:'playoff',ciclo:0,grupo:2});assert.ok(calls[1].url.includes('grupo=eq.2'));
 await lib.leerMensajesDesde({ligaId:'prueba',tipo:'playoff',ciclo:0,grupo:3,desdeId:1});assert.ok(calls[2].url.includes('grupo=eq.3'));
 }finally{global.fetch=prev;}
});
test('R6: backup exports all pages even if server max_rows is smaller than request',async()=>{
 const prev=global.fetch,prior=process.env.BACKUP_SECRET;process.env.BACKUP_SECRET='TESTBACKUP';let snapshot;
 global.fetch=async(url,o={})=>{
  const u=new URL(url);
  if(u.pathname.includes('/storage/v1/object/backups/')){snapshot=JSON.parse(require('node:zlib').gunzipSync(o.body));return{ok:true};}
  if(u.pathname.includes('/storage/'))return{ok:true,json:async()=>[]};
  if(o.method==='POST')return{ok:true,json:async()=>[]};
  const offset=Number(u.searchParams.get('offset')||0),table=u.pathname.split('/').at(-1);
  const n=table==='mensajes'?503:2;
  return{ok:true,json:async()=>Array.from({length:Math.max(0,Math.min(100,n-offset))},(_,i)=>({id:i+offset}))};
 };
 let status,body;const res={headersSent:false,setHeader(){},status(s){status=s;return this;},json(x){body=x;return this;}};
 try{await require('../api/backup')({method:'GET',headers:{'x-backup-secret':'TESTBACKUP'}},res);
  assert.equal(status,200);assert.equal(body.ok,true);assert.equal(snapshot.tables.mensajes.length,503);
  assert.deepEqual(Object.keys(snapshot.tables).sort(),['admin_notify_channels','audit_log','jugadores','liga_index','liga_state','mensajes','passkeys','sohail_account_security','sohail_data_operations','sohail_identity_registry','sohail_login_order']);
  assert.equal(snapshot.consistency,'logical-export-not-transactional');
 }finally{global.fetch=prev;if(prior===undefined)delete process.env.BACKUP_SECRET;else process.env.BACKUP_SECRET=prior;}
});
test('R6: failure reading a backup table never uploads a partial success',async()=>{
 const prev=global.fetch,prior=process.env.BACKUP_SECRET;process.env.BACKUP_SECRET='TESTBACKUP';let uploaded=false;
 global.fetch=async(url,o={})=>{if(url.includes('/storage/'))uploaded=true;if(o.method==='POST')return{ok:true};return{ok:false,status:503};};
 let status;const res={headersSent:false,setHeader(){},status(s){status=s;return this;},json(){return this;}};
 try{await require('../api/backup')({method:'GET',headers:{'x-backup-secret':'TESTBACKUP'}},res);assert.equal(status,500);assert.equal(uploaded,false);}
 finally{global.fetch=prev;if(prior===undefined)delete process.env.BACKUP_SECRET;else process.env.BACKUP_SECRET=prior;}
});
test('R6: tutorial acknowledgement cannot hide a newer reset',async()=>{
 const f=authFixture();f.account.tutorial_epoch=3;f.account.tutorial_version=1;
 let status,data;const res={headersSent:false,setHeader(){},status(s){status=s;return this;},json(v){data=v;return this;}};
 await mockedAuth(f,()=>require('../api/_tutorial')({...requestFor(tokenFor()),method:'POST',body:{version:1,epoch:2,status:'skipped'}},res));
 assert.equal(status,409);assert.equal(data.code,'TUTORIAL_CONFLICT');
});
test('R6: tutorial skip cannot bypass mandatory password change',async()=>{
 let status;const res={headersSent:false,setHeader(){},status(s){status=s;return this;},json(){return this;}};
 await mockedAuth(authFixture(0,true),()=>require('../api/_tutorial')({...requestFor(tokenFor()),method:'POST',body:{version:1,epoch:1,status:'skipped'}},res));assert.equal(status,403);
});
test('R6: malicious future tutorial versions rejected',async()=>{
 const f=authFixture();f.account.tutorial_epoch=1;let status;const res={headersSent:false,setHeader(){},status(s){status=s;return this;},json(){return this;}};
 await mockedAuth(f,()=>require('../api/_tutorial')({...requestFor(tokenFor()),method:'POST',body:{version:100,epoch:1,status:'completed'}},res));assert.equal(status,409);
});
test('R6: wrong request method cannot save league state',async()=>{
 let status;const res={headersSent:false,status(s){status=s;return this;},json(){return this;}};await require('../api/save')({method:'GET',headers:{}},res);assert.equal(status,405);
});
test('R6: no unconditional PostgREST state upsert remains in central writer',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../api/_lib.js'),'utf8');const fn=source.slice(source.indexOf('async function writeState('),source.indexOf('async function readCatalogo('));
 assert.ok(fn.includes("rpc('sohail_write_state'"));assert.ok(!fn.includes('resolution=merge-duplicates'));
});
// Ronda 7: bordes encontrados durante el repaso final de recorridos.
test('R7: duplicado contra partido anterior inalterado rechazado',()=>{const s=fixture();s.matches=[match()];const i=clone(s);i.matches.push({...match(),id:2});assert.throws(()=>v.protectState(s,i,{u:'Alicia',r:'player'},false,false),/más de una vez/);});
test('R7: duplicado invertido también rechazado',()=>{const s=fixture();s.matches=[match()];const i=clone(s);i.matches.push({...match(),id:2,aName:'Beto',bName:'Alicia'});assert.throws(()=>v.protectState(s,i,{u:'admin',r:'admin'},true,true),/más de una vez/);});
test('R7: duplicados históricos inalterados no se borran automáticamente',()=>{const s=fixture();s.matches=[match(),{...match(),id:2}];assert.doesNotThrow(()=>v.protectState(s,clone(s),{u:'Alicia',r:'player'},false,false));});
test('R7: participante puede disputar pendiente sin alterar marcador',()=>{const s=fixture();s.matches=[match()];const i=clone(s);i.matches[0].status='disputed';v.protectState(s,i,{u:'Beto',r:'player'},false,false);assert.equal(i.matches[0].status,'disputed');});
test('R7: no puede disputar y cambiar marcador en la misma solicitud',()=>{const s=fixture();s.matches=[match()];const i=clone(s);i.matches[0].status='disputed';i.matches[0].sets=[[6,1],[6,0]];assert.throws(()=>v.protectState(s,i,{u:'Beto',r:'player'},false,false));});
test('R7: nueva carga con rival inactivo rechazada',()=>{const s=fixture();s.users.Beto.inactive=true;const i=clone(s);i.matches=[match()];assert.throws(()=>v.protectState(s,i,{u:'Alicia',r:'player'},false,false),/inactivo/);});
test('R7: fallo de revocación impide vinculación',async()=>{const original=global.fetch;try{global.fetch=async()=>({ok:false,status:503});await assert.rejects(lib.borrarPasskeysDeUsuario('Alicia',true),e=>e.status===503);}finally{global.fetch=original;}});

// v3.9.6 — orden de las opciones POSTERIORES al login. No cambia permisos,
// sesiones, el índice persistido ni la elección directa cuando hay una liga.
{
 const options = [
  {ligaId:'old',nombre:'Zeta antigua',state:{private:true},u:{pass:'not-for-client'}},
  {ligaId:'new',nombre:'Alfa nueva'},
  {ligaId:'mid',nombre:'Liga intermedia'}
 ];
 const leagueIndex=[{id:'old',orden:2},{id:'new',orden:10},{id:'mid',orden:9}];
 const ids=arr=>arr.map(l=>l.id);
 test('ORDER01: opciones por creación descendente, no por nombre ni orden lexicográfico',()=>{
  assert.deepEqual(ids(lib.postLoginLeagueChoices(options,leagueIndex)),['new','mid','old']);
 });
 test('ORDER02: listas originales y perfiles inmutables; respuesta sólo id/nombre',()=>{
  const input=Object.freeze(options.map(l=>Object.freeze({...l}))),index=Object.freeze(leagueIndex.map(l=>Object.freeze({...l})));
  const out=lib.postLoginLeagueChoices(input,index);
  assert.deepEqual(input.map(l=>l.ligaId),['old','new','mid']);
  assert.deepEqual(index.map(l=>l.orden),[2,10,9]);
  assert.ok(out.every(l=>Object.keys(l).sort().join(',')==='id,nombre'));
  out[0].nombre='No cambiar original';assert.equal(input[1].nombre,'Alfa nueva');
 });
 test('ORDER03: empates conservan el orden previo',()=>{
  assert.deepEqual(ids(lib.postLoginLeagueChoices(options,leagueIndex.map(l=>({...l,orden:5})))),['old','new','mid']);
 });
 test('ORDER04: orden cero válido y datos faltantes/inválidos al final sin adivinar fechas',()=>{
  const o=['zero','missing','null','bad','infinite','nan','new'].map(id=>({ligaId:id,nombre:'Liga 2099 '+id}));
  const idx=[{id:'zero',orden:0},{id:'null',orden:null},{id:'bad',orden:'9'},{id:'infinite',orden:Infinity},{id:'nan',orden:NaN},{id:'new',orden:1}];
  assert.deepEqual(ids(lib.postLoginLeagueChoices(o,idx)),['new','zero','missing','null','bad','infinite','nan']);
 });
 test('ORDER05: no agrega opciones del índice que el login no haya autorizado',()=>{
  assert.deepEqual(ids(lib.postLoginLeagueChoices([options[0]],[...leagueIndex,{id:'private',orden:99} ])),['old']);
 });
 test('ORDER06: entrada vacía o índice ausente es estable',()=>{
  assert.deepEqual(lib.postLoginLeagueChoices(null,leagueIndex),[]);
  assert.deepEqual(ids(lib.postLoginLeagueChoices(options,null)),['old','new','mid']);
 });

 // Reutilizar la base simulada existente, preservando el entorno de esta suite.
 const envKeys=['SESSION_SECRET','SUPABASE_URL','SUPABASE_SERVICE_KEY'];
 const beforeEnv=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
 const mock=require('./support/mock-db.cjs');
 for(const k of envKeys){if(beforeEnv[k]===undefined)delete process.env[k];else process.env[k]=beforeEnv[k];}
 function orderDB(){
  const names=['Zeta antigua 2025','Alfa reciente 2026/2027','Liga intermedia 2026'];
  const db=mock.createDB(['old','new','mid'].map((id,i)=>({id,state:{...mock.fixture(),LEAGUE_NAME:names[i]}})));
  for(const row of db.tables.liga_index)row.orden=leagueIndex.find(l=>l.id===row.id).orden;
  return db;
 }
 async function withOrderDB(fn){const prev=global.fetch,db=orderDB();global.fetch=db.fetch;try{return await fn(db);}finally{global.fetch=prev;}}
 async function passwordLogin(db,user){return mock.call(require('../api/login'),{method:'POST',headers:{host:'sohail.test','x-forwarded-for':'192.0.2.1'},body:{user,pass:'prueba123'},query:{}});}
 for(const user of ['Alicia','admin','superadmin']){
  test('ORDER07: login '+user+' devuelve nuevas primero sin cambiar la sesión fuente',()=>withOrderDB(async db=>{
   const states=clone(db.tables.liga_state),idx=clone(db.tables.liga_index);
   const r=await passwordLogin(db,user);assert.equal(r.status,200);assert.equal(r.body.eligeLiga,true);
   assert.deepEqual(ids(r.body.ligas),['new','mid','old']);
   assert.equal(lib.verifyToken(r.body.token).src,'old');
   assert.ok(r.body.ligas.every(l=>Object.keys(l).sort().join(',')==='id,nombre'));
   assert.deepEqual(db.tables.liga_state,states);assert.deepEqual(db.tables.liga_index,idx);
   assert.equal(r.headers['Cache-Control'],'no-store');
   // Elegir la antigua sigue siendo posible; no hay preselección de la primera.
   const chosen=await mock.call(require('../api/state'),{method:'GET',headers:{authorization:'Bearer '+r.body.token},query:{liga:'old',elegir:'1'}});
   assert.equal(chosen.status,200);assert.equal(chosen.body.state.LEAGUE_NAME,states[0].data.LEAGUE_NAME);
  }));
 }
 test('ORDER08: ligas finalizadas, cuentas ausentes o inactivas no se agregan al selector',()=>withOrderDB(async db=>{
  db.tables.liga_index.find(l=>l.id==='new').estado='finalizada';
  db.state('mid').users.Alicia.inactive=true;
  const r=await passwordLogin(db,'Alicia');assert.equal(r.status,200);assert.equal(r.body.ligaId,'old');assert.equal(r.body.eligeLiga,undefined);
 }));
 test('ORDER09: credencial incorrecta no entrega la lista',()=>withOrderDB(async db=>{
  const r=await mock.call(require('../api/login'),{method:'POST',headers:{'x-forwarded-for':'192.0.2.2'},body:{user:'Alicia',pass:'incorrecta'},query:{}});
  assert.equal(r.status,401);assert.equal(r.body.ligas,undefined);
 }));
 test('ORDER10: cambio de nombre y resultados no cambia la posición de la liga',()=>withOrderDB(async db=>{
  db.state('old').matches.push(mock.match({id:987,status:'confirmed'}));
  db.tables.liga_index.find(l=>l.id==='old').nombre='Liga 2099 renombrada';
  const r=await passwordLogin(db,'Alicia');assert.deepEqual(ids(r.body.ligas),['new','mid','old']);assert.equal(r.body.ligas[2].nombre,'Liga 2099 renombrada');
 }));
 test('ORDER11: no incluye ligas activas sin pertenencia del jugador',()=>withOrderDB(async db=>{
  delete db.state('new').users.Alicia;
  const r=await passwordLogin(db,'Alicia');assert.equal(r.status,200);assert.deepEqual(ids(r.body.ligas),['mid','old']);
 }));
 test('ORDER12: nueva liga pasa arriba en el siguiente login sin cambiar las anteriores',()=>withOrderDB(async db=>{
  const state=clone(db.state('new'));state.LEAGUE_NAME='Nueva liga de pruebas';
  db.tables.liga_state.push({id:'latest',data:state});db.tables.liga_index.push({id:'latest',nombre:state.LEAGUE_NAME,estado:'activa',orden:11});
  const r=await passwordLogin(db,'admin');assert.deepEqual(ids(r.body.ligas),['latest','new','mid','old']);
 }));

 // Sólo se sustituye el verificador WebAuthn para probar la ruta tras verificar
 // identidad. No es una prueba biométrica ni una auditoría de criptografía.
 function orderPasskey(spy){
  const source=fs.readFileSync(path.join(__dirname,'../api/passkey.js'),'utf8');
  assert.ok(source.includes("await import('@simplewebauthn/server')"));
  const mod={exports:{}},localRequire=require('node:module').createRequire(path.join(__dirname,'../api/passkey.js'));
  const ctx={module:mod,exports:mod.exports,require:localRequire,__wa:async()=>spy,Buffer,process,console,fetch:(...args)=>global.fetch(...args),Date,JSON};
  vm.createContext(ctx);vm.runInContext(source.replace("await import('@simplewebauthn/server')","await __wa()"),ctx);return mod.exports;
 }
 async function loginPasskey(db,user,verified=true){
  db.tables.passkeys=[{credential_id:'order-test-credential',user_name:user,public_key:'AA',counter:0}];
  const handler=orderPasskey({generateAuthenticationOptions:async o=>{assert.equal(o.userVerification,'required');return {challenge:'order-test-challenge'};},verifyAuthenticationResponse:async o=>{assert.equal(o.requireUserVerification,true);return {verified,authenticationInfo:{newCounter:1}};}});
  const headers={host:'sohail.test','x-forwarded-proto':'https'};
  const start=await mock.call(handler,{method:'POST',headers,body:{accion:'auth-start'},query:{}});assert.equal(start.status,200);
  return mock.call(handler,{method:'POST',headers:{...headers,cookie:start.headers['Set-Cookie'].split(';')[0]},body:{accion:'auth-finish',ligaId:'old',cred:{id:'order-test-credential'}},query:{}});
 }
 test('ORDER13: passkey del jugador muestra el mismo orden que contraseña',()=>withOrderDB(async db=>{
  const p=await passwordLogin(db,'Alicia'),r=await loginPasskey(db,'Alicia');
  assert.equal(r.status,200);assert.equal(r.body.eligeLiga,true);assert.deepEqual(JSON.parse(JSON.stringify(r.body.ligas)),p.body.ligas);assert.equal(lib.verifyToken(r.body.token).src,'old');
  assert.equal(r.headers['Cache-Control'],'no-store');
 }));
 test('ORDER14: passkey conserva el filtro de cuentas inactivas y la entrada directa de una liga',()=>withOrderDB(async db=>{
  db.state('new').users.Alicia.inactive=true;db.tables.liga_index.find(l=>l.id==='mid').estado='finalizada';
  const r=await loginPasskey(db,'Alicia');assert.equal(r.status,200);assert.equal(r.body.ligaId,'old');assert.equal(r.body.eligeLiga,undefined);
 }));
 for(const user of ['admin','superadmin'])test('ORDER15: passkey '+user+' conserva la entrada directa administrativa existente',()=>withOrderDB(async db=>{
  const r=await loginPasskey(db,user);assert.equal(r.status,200);assert.equal(r.body.ligaId,'old');assert.equal(r.body.eligeLiga,undefined);
 }));
 test('ORDER16: passkey no verificada no obtiene el selector',()=>withOrderDB(async db=>{
  const r=await loginPasskey(db,'Alicia',false);assert.equal(r.status,401);assert.equal(r.body.ligas,undefined);
 }));
}

// v3.9.7 — duplicate suggestions are advisory, never identity authority.
{
 const dup=require('../public/player-duplicates.js');
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 const cases=[
  ['Javier López','Javier Lopez','accents'],['MARcos Gavassa','marcos gavassa','format'],
  [' Juan   Pérez ','juan pérez','format'],['Juan Pe\u0301rez','Juan Pérez','format'],
  ['Marcos Gavassa','Marcos Gavasa','typo'],['Marcos Gavassa','Marcos Gavaassa','typo'],
  ['Francisco Sanchez','Franicsco Sanchez','typo'],['Javier Lopez','Javeir Lopez','typo'],
  ['Luis Gil-Delgado','Luis Gil Delgado','punctuation'],["Alex O’Connor","Alex O'Connor",'punctuation'],
  ['José Muñoz','Jose Munoz','enye'],['Juan Pérez','Pérez Juan','order'],
  ['José Luis Martín','José Martín','partial'],['Juan Pérez','Juan Pérez','exact']
 ];
 for(const[a,b,reason]of cases)test('DUP names: '+a+' / '+b,()=>{assert.equal(dup.compareNames(a,b)?.reason,reason);assert.equal(dup.compareNames(b,a)?.reason,reason);});
 for(const[a,b]of [['Juan García','Pedro García'],['Juan','Juana'],['Ana López','Juan López'],['Juan Pérez','Javier López'],['A','Áb']]){
  test('DUP conservatively avoids weak-only match: '+a+' / '+b,()=>assert.equal(dup.compareNames(a,b),null));
 }
 // Carlos Marin/Martin is a one-letter surname difference: it remains a suggestion,
 // never an automatic identity match.
 test('DUP never changes original spelling or input objects',()=>{
  const rows=[Object.freeze({name:' JAVIER  LOPEZ ',group:3})],known=[Object.freeze({name:'Javier López',globalId:'g1'})];
  const before=JSON.stringify([rows,known]);const r=dup.reviewData(Object.freeze(rows),Object.freeze(known));assert.equal(r.flagged,1);assert.equal(JSON.stringify([rows,known]),before);assert.equal(r.rows[0].record.name,' JAVIER  LOPEZ ');
 });
 test('DUP same linked identity is not a duplicate profile',()=>assert.equal(dup.scanData([{name:'José López',globalId:'a'},{name:'JOSE LOPEZ',globalId:'a'}]).pairs.length,0));
 test('DUP homonyms with different IDs remain a review, not a fusion',()=>{const r=dup.scanData([{name:'Juan Pérez',globalId:'a'},{name:'Juan Pérez',globalId:'b'}]);assert.equal(r.pairs.length,1);assert.equal(r.pairs[0].reason,'exact');assert.ok(!('probability'in r.pairs[0]));});
 test('DUP detects repetitions within the workbook with original row/group',()=>{const r=dup.reviewData([{name:'Juan Pérez',group:2,row:4},{name:'JUAN PEREZ',group:3,row:9}],[]);assert.equal(r.flagged,1);assert.equal(r.rows[1].matches[0].record.row,4);assert.equal(r.rows[1].matches[0].record.group,2);});
 test('DUP shows multiple candidates without choosing an identity',()=>{const r=dup.reviewData([{name:'Juan Perez'}],[{name:'Juan Pérez',globalId:'a'},{name:'JUAN PEREZ',globalId:'b'}]);assert.equal(r.rows[0].matches.length,2);assert.equal(dup.chooseKept(r,{}),null);assert.deepEqual(dup.chooseKept(r,{0:'keep'}),[0]);assert.deepEqual(dup.chooseKept(r,{0:'skip'}),[]);});
 test('DUP invalid names and system accounts cannot proceed',()=>{const r=dup.reviewData(['', '<img src=x>', '__proto__','superadmin','Juan\u202e Pérez','A'.repeat(121)].map(name=>({name})),[]);assert.equal(r.invalid,6);assert.deepEqual(dup.chooseKept(r,{}),[]);});
 test('DUP file and row bounds are enforced',()=>{assert.ok(dup.canReadFile({size:1}));assert.ok(!dup.canReadFile({size:dup.LIMITS.file+1}));assert.throws(()=>dup.reviewData(Array(1001).fill({name:'Juan Pérez'}),[]));});
 test('DUP a truncated candidate set is labelled partial and cannot be imported',()=>{const known=Array.from({length:10},(_,i)=>({name:'Juan Pérez',globalId:'p'+i}));const r=dup.reviewData([{name:'Juan Perez'}],known);assert.equal(r.limited,true);assert.equal(dup.chooseKept(r,{0:'keep'}),null);});
 test('DUP engine is not a probabilistic confidence percentage',()=>{const r=dup.compareNames('Marcos Gavassa','Marcos Gavasa');assert.deepEqual(Object.keys(r).sort(),['level','reason']);});
 test('DUP ES and EN have the same keys and no empty text',()=>{assert.deepEqual(Object.keys(dup.words.es).sort(),Object.keys(dup.words.en).sort());assert.ok(Object.values(dup.words.en).every(Boolean));});
 test('DUP script is loaded once before its consumers',()=>{const h=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');assert.equal((h.match(/src="player-duplicates\.js\?v=/g)||[]).length,1);assert.ok(h.indexOf('src="player-duplicates.js')<h.indexOf('src="jugadores-perfiles.js'));});
 function importContext(rows,review,role='admin'){
  const users={admin:{role:'admin',name:'Organización'},superadmin:{role:'superadmin',name:'Organización'},'Juan Pérez':{name:'Juan Pérez',role:'player',jugadorId:'id-existing',identityRef:'reference',email:'existing@example.invalid',pass:'KEEP',inactive:true}};
  const api={...dup,reviewRows:async()=>review};let writes=0;
  const c={console,Set,Map,Date,JSON,Array,String,Number,Promise,LANG:'es',currentUser:{role},USERS:users,ALLNAMES:['Juan Pérez'],cycles:[{n:1,status:'active',groups:[{players:[]}]}],activeN:1,window:{SohailDuplicates:api},SohailDuplicates:api,
   esAdmin:u=>u&&['admin','superadmin'].includes(u.role),getActive(){return c.cycles[0];},confirmarModal:async()=>true,confirm:()=>true,toast:()=>{},alert:()=>{},t:s=>s,
   XLSX:{read:()=>({SheetNames:['Jugadores'],Sheets:{Jugadores:{}}}),utils:{sheet_to_json:()=>structuredClone(rows)}},
   addPlayerToCycle(name,g){if(!c.USERS[name])c.USERS[name]={name,role:'player'};if(!c.ALLNAMES.includes(name))c.ALLNAMES.push(name);c.cycles[0].groups[g-1].players.push(name);},
   persist:async()=>{writes++;return true;},ensureDestino:()=>{},DEFAULT_PASS_HASH:'DEFAULT',setTimeout,clearTimeout};
  vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/jugadores-perfiles.js'),'utf8'),c);c.renderPerfil=()=>{};c.initLogin=()=>{};
  const input={files:[{size:5,arrayBuffer:async()=>new ArrayBuffer(0)}],value:'fake'};
  return {c,input,writes:()=>writes};
 }
 test('DUP list import cancelled before mutation or save',async()=>{const {c,input,writes}=importContext([{Nombre:'Juan',Apellido:'Pérez',Grupo:1}],null);const before=JSON.stringify([c.USERS,c.cycles]);await c.importarListaJugadores(input);assert.equal(writes(),0);assert.equal(JSON.stringify([c.USERS,c.cycles]),before);});
 test('DUP stale import review cannot write to a changed league',async()=>{const {c,input,writes}=importContext([{Nombre:'Juan',Apellido:'Pérez',Grupo:1}],{keepIndexes:[0],isCurrent:()=>false});await c.importarListaJugadores(input);assert.equal(writes(),0);assert.equal(c.cycles[0].groups[0].players.length,0);});
 test('DUP keeping an existing ungrouped name preserves identity, contacts and credentials',async()=>{const {c,input,writes}=importContext([{Nombre:'Juan',Apellido:'Pérez',Grupo:1}],{keepIndexes:[0],isCurrent:()=>true});const before=JSON.stringify(c.USERS['Juan Pérez']);await c.importarListaJugadores(input);assert.equal(writes(),1);assert.equal(JSON.stringify(c.USERS['Juan Pérez']),before);assert.deepEqual(c.cycles[0].groups[0].players,['Juan Pérez']);});
 test('DUP skipped rows never get imported',async()=>{const {c,input,writes}=importContext([{Nombre:'Juan',Apellido:'Pérez',Grupo:1},{Nombre:'Carla',Apellido:'Soto',Grupo:1}],{keepIndexes:[1],isCurrent:()=>true});await c.importarListaJugadores(input);assert.equal(writes(),1);assert.deepEqual(c.cycles[0].groups[0].players,['Carla Soto']);assert.ok(!c.USERS['Carla Soto'].jugadorId);});
 test('DUP player cannot invoke list import',async()=>{const {c,input,writes}=importContext([{Nombre:'Juan',Apellido:'Pérez'}],{keepIndexes:[0],isCurrent:()=>true},'player');await c.importarListaJugadores(input);assert.equal(writes(),0);});
 test('DUP legacy superadmin importer waits for review before extending groups',async()=>{
  const {c,input,writes}=importContext([{Nombre:'Carla',Apellido:'Soto',Grupo:4}],null,'superadmin');let pending;
  c.FileReader=class{readAsArrayBuffer(){pending=this.onload({target:{result:new ArrayBuffer(0)}});}};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/admin-ligas-clubes.js'),'utf8'),c);c.renderShell=()=>{};c.showSub=()=>{};
  c.importarJugadoresExcel(input);await pending;assert.equal(writes(),0);assert.equal(c.cycles[0].groups.length,1);
 });
}

{
 const {createDB,fixture:dupFixture,req:dupReq,call:dupCall}=require('./support/mock-db.cjs');
 const handler=require('../api/liga');
 async function withDupDB(fn){const original=global.fetch;const db=createDB();global.fetch=db.fetch;try{return await fn(db);}finally{global.fetch=original;}}
 for(const user of ['admin','superadmin'])test('DUP catalogue: authorised '+user+' reads names/IDs only, no writes',()=>withDupDB(async db=>{
  const before=JSON.stringify(db.tables);const r=await dupCall(handler,dupReq(db,user,{accion:'duplicadosCatalogo',ligaId:'liga-actual'}));
  assert.equal(r.status,200);assert.equal(r.body.complete,true);assert.ok(r.body.jugadores.length>0);
  assert.ok(r.body.jugadores.every(j=>Object.keys(j).sort().join(',')==='jugadorId,nombre'));
  assert.equal(JSON.stringify(db.tables),before);
  assert.ok(db.requests.filter(x=>x.name==='jugadores').every(x=>x.method==='GET'&&x.query.includes('select=id,nombre')));
 }));
 test('DUP catalogue: player is forbidden',()=>withDupDB(async db=>{const r=await dupCall(handler,dupReq(db,'Alicia',{accion:'duplicadosCatalogo',ligaId:'liga-actual'}));assert.equal(r.status,403);assert.ok(!db.requests.some(x=>x.name==='jugadores'));}));
 test('DUP catalogue: unauthenticated request is forbidden',()=>withDupDB(async db=>{const r=await dupCall(handler,{method:'POST',headers:{},body:{accion:'duplicadosCatalogo',ligaId:'liga-actual'}});assert.equal(r.status,401);}));
 test('DUP catalogue: no access to another league via a shared system username',()=>withDupDB(async db=>{const s=dupFixture();s.users.admin._credentialId='another-admin';db.tables.liga_state.push({id:'private-league',data:s});const r=await dupCall(handler,dupReq(db,'admin',{accion:'duplicadosCatalogo',ligaId:'private-league'}));assert.equal(r.status,403);}));
 test('DUP catalogue: database failure is not empty success',()=>withDupDB(async db=>{db.fault=({name})=>name==='jugadores';const r=await dupCall(handler,dupReq(db,'admin',{accion:'duplicadosCatalogo',ligaId:'liga-actual'}));assert.equal(r.status,503);assert.equal(r.body.code,'CATALOG_UNAVAILABLE');assert.equal(r.body.jugadores,undefined);}));
 test('DUP catalogue: reads all pages even when server page size is below request',()=>withDupDB(async db=>{
  db.tables.jugadores=Array.from({length:613},(_,i)=>({id:'p'+String(i).padStart(4,'0'),nombre:'Jugador '+i,email:'private',pass:'secret'}));
  const base=db.fetch;global.fetch=(input,opts)=>{const u=new URL(input);if(u.pathname.endsWith('/jugadores'))u.searchParams.set('limit','100');return base(u.toString(),opts);};
  const r=await dupCall(handler,dupReq(db,'admin',{accion:'duplicadosCatalogo',ligaId:'liga-actual'}));assert.equal(r.status,200);assert.equal(r.body.complete,true);assert.equal(r.body.jugadores.length,613);
 }));
 test('DUP catalogue: cap is explicit, never claims full coverage',()=>withDupDB(async db=>{
  db.tables.jugadores=Array.from({length:2501},(_,i)=>({id:'p'+String(i).padStart(4,'0'),nombre:'Jugador '+i}));const r=await dupCall(handler,dupReq(db,'admin',{accion:'duplicadosCatalogo',ligaId:'liga-actual'}));assert.equal(r.status,200);assert.equal(r.body.complete,false);assert.equal(r.body.jugadores.length,2500);
 }));
}

// v3.9.8 — cross-league history uses an explicit sporting-only read.
// Tests use real controllers, a simulated database and no production requests.
{
 const H=require('../public/history-leagues'),D=require('../public/match-history');
 const M=require('./support/mock-db.cjs'),stateHandler=require('../api/state'),ligaHandler=require('../api/liga');
 const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>structuredClone(body)});
 function setupHistory(){
  const now=M.fixture(),other=M.fixture(),past=M.fixture();
  now.LEAGUE_NAME='Actual';other.LEAGUE_NAME='Otra activa';past.LEAGUE_NAME='Finalizada';
  now.matches=[M.match({status:'confirmed'})];
  other.matches=[M.match({date:'2026-10-01',status:'confirmed'})];other.users.Alicia.inactive=true;
  past.matches=[M.match({date:'2025-06-01',status:'confirmed'}),M.match({id:2,date:'2025-07-01',po:true,poNames:['Alicia','Beto'],which:'cons',status:'confirmed'})];past.cycles[0].status='finished';
  const db=M.createDB([{id:'liga-actual',state:now},{id:'otra-activa',state:other},{id:'anterior',state:past,estado:'finalizada'}]);
  const current=()=>({id:'liga-actual',nombre:'Actual',users:db.state().users,matches:db.state().matches,cycles:db.state().cycles});
  return {db,current};
 }
 async function usingHistory(fn){const h=setupHistory(),original=global.fetch;global.fetch=h.db.fetch;try{return await fn(h);}finally{global.fetch=original;}}
 function bridge(db){return async(url,opts={})=>{const u=new URL(url,'https://app.invalid');const res=await M.call(u.pathname==='/api/liga'?ligaHandler:stateHandler,{method:opts.method||'GET',headers:Object.fromEntries(Object.entries(opts.headers||{}).map(([k,v])=>[k.toLowerCase(),v])),query:Object.fromEntries(u.searchParams),body:opts.body?JSON.parse(opts.body):{}});return response(res.body,res.status);};}
 test('HST01 sporting history reads an inactive target membership but does not grant normal access',()=>usingHistory(async({db})=>{
  const q={liga:'otra-activa'},req=M.req(db,'Alicia',{},q,'GET');assert.equal((await M.call(stateHandler,req)).status,403);
  const r=await M.call(stateHandler,{...req,query:{...q,historial:'1'}});assert.equal(r.status,200);assert.equal(r.body.state.matches.length,1);assert.equal(r.body.readOnly,true);
  assert.equal(r.body.token,undefined);assert.equal(r.body.role,undefined);assert.equal(r.body.name,undefined);
 }));
 test('HST02 sporting projection excludes credentials, contacts, requests and logs even for admin',()=>usingHistory(async({db})=>{
  db.state('otra-activa').LOG=[{secret:'private'}];db.state('otra-activa').JOIN_REQUESTS=[{email:'private@example.invalid'}];
  const before=structuredClone(db.tables);
  const r=await M.call(stateHandler,M.req(db,'admin',{}, {liga:'otra-activa',historial:'1'},'GET'));
  assert.equal(r.status,200);assert.equal(r.body.state.LOG,undefined);assert.equal(r.body.state.JOIN_REQUESTS,undefined);
  for(const u of Object.values(r.body.state.users))for(const key of ['pass','email','tel','_credentialId','identityRef'])assert.equal(u[key],undefined,key);
  assert.deepEqual(db.tables,before);
 }));
 test('HST03 history read cannot also select the destination league',()=>usingHistory(async({db})=>{
  const r=await M.call(stateHandler,M.req(db,'Alicia',{}, {liga:'otra-activa',historial:'1',elegir:'1'},'GET'));assert.equal(r.status,400);assert.equal(r.body.token,undefined);
 }));
 test('HST04 read-only mode does not bypass authentication',()=>usingHistory(async()=>{
  const r=await M.call(stateHandler,{method:'GET',query:{liga:'otra-activa',historial:'1'},headers:{}});assert.equal(r.status,401);
 }));
 test('HST05 revoked source account cannot read history with an old token',()=>usingHistory(async({db})=>{
  const req=M.req(db,'Alicia',{}, {liga:'otra-activa',historial:'1'},'GET');db.state().users.Alicia.inactive=true;assert.equal((await M.call(stateHandler,req)).status,401);
 }));
 test('HST06 history respects mandatory password change',()=>usingHistory(async({db})=>{
  db.tables.sohail_account_security.find(a=>a.id==='g:profile-0').must_change=true;
  assert.equal((await M.call(stateHandler,M.req(db,'Alicia',{}, {liga:'otra-activa',historial:'1'},'GET'))).status,403);
 }));
 test('HST07 unsupported history mode is rejected',()=>usingHistory(async({db})=>{
  assert.equal((await M.call(stateHandler,M.req(db,'Alicia',{}, {liga:'otra-activa',historial:'yes'},'GET'))).status,400);
 }));
 test('HST08 an unindexed league is not silently exposed in history mode',()=>usingHistory(async({db})=>{
  db.tables.liga_index=db.tables.liga_index.filter(l=>l.id!=='otra-activa');assert.equal((await M.call(stateHandler,M.req(db,'Alicia',{}, {liga:'otra-activa',historial:'1'},'GET'))).status,404);
 }));
 test('HST09 all history combines current, inactive membership in active league and finished leagues',()=>usingHistory(async({db,current})=>{
  const before=structuredClone(db.tables),c=H.createController({current,name:'Alicia',token:()=>db.token(),valid:()=>true,fetcher:bridge(db)});
  assert.equal(await c.load(),true);const out=c.snapshot();assert.equal(out.records.length,4);assert.equal(out.leagues.length,3);assert.equal(out.issues.length,0);assert.deepEqual(db.tables,before);
  assert.equal(D.summarize(D.records(out.records,'Alicia'),'Alicia').played,4);
  assert.equal(new Set(out.records.map(m=>m._mhKey)).size,4);
 }));
 test('HST10 renamed linked player keeps old match names without rewriting data',()=>usingHistory(async({db,current})=>{
  const past=db.state('anterior');past.users['Alicia Antigua']=past.users.Alicia;delete past.users.Alicia;past.users['Alicia Antigua'].name='Alicia Antigua';
  past.matches=[M.match({aName:'Alicia Antigua',status:'confirmed',date:'2025-01-01'})];
  const out=await H.collect({current:current(),name:'Alicia',token:db.token(),fetcher:bridge(db)});
  const old=out.records.find(m=>m._mhLeagueId==='anterior');assert.equal(old._mhSubject,'Alicia Antigua');assert.equal(D.summarize(D.records([old],'Alicia'),'Alicia').wins,1);
 }));
 test('HST11 equal names belonging to different profile IDs are never merged',()=>usingHistory(async({db,current})=>{
  db.state('otra-activa').users.Alicia.jugadorId='different-person';
  const out=await H.collect({current:current(),name:'Alicia',token:db.token(),fetcher:bridge(db)});assert.equal(out.records.filter(m=>m._mhLeagueId==='otra-activa').length,0);
 }));
 test('HST12 missing global identity is explicit, not a guessed name match',()=>usingHistory(async({db,current})=>{
  delete db.state().users.Alicia.jugadorId;
  const out=await H.collect({current:current(),name:'Alicia',token:'not-used',fetcher:bridge(db)});assert.equal(out.records.length,0);assert.ok(out.issues.some(i=>i.reason==='no-global-id'));assert.equal(out.index.length,3);
 }));
 test('HST13 read errors are retained when selecting a failed league instead of inventing zero',()=>usingHistory(async({db,current})=>{
  db.fault=({name,url})=>name==='liga_state'&&url.searchParams.get('id')==='eq.otra-activa';
  const c=H.createController({current,name:'Alicia',token:()=>db.token(),valid:()=>true,fetcher:bridge(db)});await c.load();const s=H.selectScope(c.snapshot(),'league:otra-activa','liga-actual');assert.equal(s.unavailable,true);assert.ok(s.issues.length);assert.equal(c.snapshot().index.length,3);
 }));
 test('HST14 individual league selection filters only that league without changing the source',()=>usingHistory(async({db,current})=>{
  const c=H.createController({current,name:'Alicia',token:()=>db.token(),valid:()=>true,fetcher:bridge(db)});await c.load();
  assert.equal(H.selectScope(c.snapshot(),'league:anterior','liga-actual').records.length,2);assert.equal(H.selectScope(c.snapshot(),'current','liga-actual').records.length,1);assert.equal(current().id,'liga-actual');
 }));
 test('HST15 public archived viewer includes closed history but never fetches active states without login',()=>usingHistory(async({db})=>{
  const past=db.state('anterior'),urls=[];const fetcher=bridge(db);
  const c=H.createController({current:()=>({id:'anterior',nombre:'Finalizada',estado:'finalizada',users:past.users,matches:past.matches}),name:'Alicia',token:()=>null,valid:()=>true,fetcher:(url,...args)=>{urls.push(url);return fetcher(url,...args);}});
  await c.load();const out=c.snapshot();assert.equal(out.records.length,2);assert.ok(out.issues.some(i=>i.reason==='login-required'));assert.ok(urls.every(u=>!u.startsWith('/api/state')));
 }));
 test('HST16 three participant playoff is rejected as ambiguous, not truncated to two',()=>{
  const out=H.project({users:{Alicia:{jugadorId:'a'}},matches:[{id:1,po:true,poNames:['Alicia','Beto','Ciro']}]},{id:'old',nombre:'Old'},{id:'a',name:'Alicia'});assert.equal(out.records.length,0);assert.ok(out.issues.includes('ambiguous'));
 });
 test('HST17 league metadata is unique, includes finalized entries and is sorted newest first',()=>{
  const input=[{id:'old',estado:'finalizada',orden:1},{id:'new',estado:'activa',orden:2},{id:'old',orden:1}];const before=structuredClone(input);assert.deepEqual(H.uniqueIndex(input,{id:'old'}).map(e=>e.id),['new','old']);assert.deepEqual(input,before);
 });
 test('HST18 failed controller load is attempted and retryable without automatic request loops',async()=>{
  let calls=0;const c=H.createController({current:()=>({id:'liga',users:{Alicia:{jugadorId:'a'}},matches:[]}),name:'Alicia',token:()=>null,valid:()=>true,fetcher:async()=>{calls++;return response({},503);}});
  await c.load();assert.equal(c.snapshot().attempted,true);assert.equal(c.snapshot().error,true);await c.load();assert.equal(calls,2);
 });
 test('HST19 cancellation discards late history replies and clears cached data',async()=>{
  let resolve;const c=H.createController({current:()=>({id:'liga',users:{Alicia:{jugadorId:'a'}},matches:[]}),name:'Alicia',token:()=>null,valid:()=>true,fetcher:()=>new Promise(r=>resolve=r)});
  const job=c.load();c.cancel();resolve(response({ligas:[{id:'liga'}]}));await job;assert.equal(c.snapshot().ready,false);assert.equal(c.snapshot().busy,false);
 });
 test('HST20 selecting a league never sends session-selection parameters',()=>usingHistory(async({db,current})=>{
  const urls=[],f=bridge(db);await H.collect({current:current(),name:'Alicia',token:db.token(),fetcher:(url,...args)=>{urls.push(url);return f(url,...args);}});
  assert.ok(urls.some(u=>u.endsWith('&historial=1')));assert.ok(urls.every(u=>!u.includes('elegir=')));
 }));
}

// The exact centering implementation with geometry-only test doubles: it must
// never invoke page/ancestor scrolling to keep a group visible.
for(const example of [
 {label:'middle',old:0,left:700,button:70,width:500,total:1600,want:485},
 {label:'first edge',old:500,left:-500,button:70,width:500,total:1600,want:0},
 {label:'last edge',old:500,left:1000,button:70,width:500,total:1600,want:1100},
 {label:'hidden mobile rail',old:20,left:100,button:70,width:0,total:1600,want:20}
])test('GRP centering '+example.label+' changes the rail only',()=>{
 const text=fs.readFileSync(path.join(__dirname,'../public/ui-modern.js'),'utf8');
 const fn=text.slice(text.indexOf(' function centerGroupStrip('),text.indexOf(' function groupControls('));
 assert.ok(fn.includes('centerGroupStrip'));
 const rail={isConnected:true,clientWidth:example.width,clientLeft:0,scrollWidth:example.total,scrollLeft:example.old,
  getBoundingClientRect:()=>({left:0}),querySelector:()=>({getBoundingClientRect:()=>({left:example.left,width:example.button})})};
 const context={rail,Math,document:{},window:{scrollTo:()=>assert.fail('Page must not move')}};
 vm.createContext(context);vm.runInContext(fn+';centerGroupStrip(rail)',context);
 assert.equal(rail.scrollLeft,example.want);
});
