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
   cycles:base.cycles,matches:[],matchId:1,activeN:1,playoff:base.playoff,DESTINO:{},FECHAS:{},PO_FECHAS:{},ALLNAMES:base.ALLNAMES,USERS:base.users,PUNTOS:{},AJUSTES_PUNTOS:{},LOG:[],LEAGUE_NAME:'Prueba',LEAGUE_SUBTITLE:'',LOGIN_TITLE:'',LEAGUE_COLOR_PRI:'#123456',LEAGUE_COLOR_ACC:'#123456',LEAGUE_COLOR_HL:'#123456',CLUBS:base.CLUBS,COLOR_DISPUTA:'#123456',RATING_SEEDS:{},RATING_OVERRIDES:{},REGLAMENTO:'',LOGIN_HEADER:{},JOIN_REQUESTS:[]};
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
  assert.deepEqual(Object.keys(snapshot.tables).sort(),['admin_notify_channels','audit_log','jugadores','liga_index','liga_state','mensajes','passkeys','sohail_account_security']);
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
