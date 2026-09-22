'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createDB,fixture,req,call,lib}=require('./support/mock-db.cjs');
const handler=require('../api/liga'),O=require('../public/league-order');
const league=(id,orden,estado='finalizada')=>({id,nombre:'Temporada '+id,orden,estado});
const index=[league('old',1),league('middle',2),league('new',3),league('active',4,'activa')];
const states=()=>[{id:'liga-actual',state:fixture()},...['old','middle','new','four','five','six'].map(id=>({id,state:{...fixture(),LEAGUE_NAME:'Temporada '+id},estado:'finalizada'}))];
async function dbRun(run){const db=createDB(states()),old=global.fetch;global.fetch=db.fetch;try{return await run(db);}finally{global.fetch=old;}}
const ids=db=>db.tables.liga_index.filter(l=>l.estado==='finalizada').map(l=>l.id);
const post=(db,body,who='admin')=>call(handler,req(db,who,body,{operacion:'login-order'}));
const list=()=>call(handler,{method:'POST',headers:{},query:{},body:{accion:'listar'}});
const config=db=>db.tables.sohail_login_order[0];
const saved=db=>config(db).league_ids;

test('ORDER430 default shows every closed league newest first, no active league',()=>{
 assert.deepEqual(O.closed(index).map(l=>l.id),['new','middle','old']);
 assert.equal(O.closed(Array.from({length:50},(_,i)=>league('x'+i,i))).length,50);
});
test('ORDER430 saved order is independent of chronological orden and inputs are immutable',()=>{
 const before=structuredClone(index),decorated=O.apply(index,['old','new','middle']);
 assert.deepEqual(O.closed(decorated).map(l=>l.id),['old','new','middle']);assert.deepEqual(index,before);
 assert.deepEqual(decorated.map(l=>l.orden),[1,2,3,4]);assert.ok(!('ordenLogin' in decorated[3]));
});
test('ORDER430 new closures append, reopened/deleted leagues disappear without sorting active choices',()=>{
 const ordered=O.apply([...index,league('recent',7)],['old','middle','new','deleted','active']);
 assert.deepEqual(O.closed(ordered).map(l=>l.id),['old','middle','new','recent']);
 ordered[1].estado='activa';assert.deepEqual(O.closed(ordered).map(l=>l.id),['old','new','recent']);
 assert.deepEqual(lib.postLoginLeagueChoices([{ligaId:'active',nombre:'A'},{ligaId:'middle',nombre:'B'}],ordered).map(l=>l.id),['active','middle']);
});
test('ORDER430 invalid ranks do not poison comparator; equal dates retain stable fallback',()=>{
 assert.deepEqual(O.closed([{...league('a',0),ordenLogin:NaN},league('b',0),{...league('c',0),ordenLogin:0}]).map(l=>l.id),['c','a','b']);
});
test('ORDER430 move supports up/down/first/last and never mutates or duplicates IDs',()=>{
 const a=['a','b','c'];assert.deepEqual(O.move(a,'c',0),['c','a','b']);assert.deepEqual(O.move(a,'a',2),['b','c','a']);
 for(const n of [-1,3,NaN,1.2])assert.deepEqual(O.move(a,'b',n),a);
 assert.deepEqual(O.move(a,'missing',1),a);assert.deepEqual(a,['a','b','c']);
});
for(const who of ['admin','superadmin'])test('ORDER430 '+who+' can read, reorder all closed leagues and expose the saved order publicly',()=>dbRun(async db=>{
 const before=structuredClone(db.tables.liga_state),oldIndex=structuredClone(db.tables.liga_index);
 const r=await post(db,{accion:'leer'},who);assert.equal(r.status,200);assert.equal(r.body.ligas.length,6);
 const order=['middle','old','six','new','five','four'];const s=await post(db,{accion:'guardar',version:r.body.version,ids:order},who);
 assert.equal(s.status,200);assert.deepEqual(s.body.ids,order);assert.equal(s.body.version,1);
 assert.deepEqual(O.closed((await list()).body.ligas).map(l=>l.id),order);
 assert.deepEqual(db.tables.liga_state,before);assert.deepEqual(db.tables.liga_index,oldIndex);assert.equal(config(db).updated_by,who);
 assert.ok(!JSON.stringify((await list()).body).includes('v2:'));
}));
test('ORDER430 delegated current admin can set cosmetic global order without acquiring access to foreign states',()=>dbRun(async db=>{
 db.state().users.Alicia.role='admin';for(const l of db.tables.liga_state.slice(1))l.data.users.Alicia.role='player';
 const r=await post(db,{accion:'guardar',version:0,ids:ids(db)},'Alicia');assert.equal(r.status,200);
 assert.ok(db.tables.liga_state.slice(1).every(l=>l.data.users.Alicia.role==='player'));
}));
test('ORDER430 player cannot read management view or save, even by supplying admin fields',()=>dbRun(async db=>{
 for(const accion of ['leer','guardar']){const r=await post(db,{accion,version:0,ids:ids(db),role:'superadmin',u:'admin',ligaId:'old'},'Alicia');assert.equal(r.status,403);}
 assert.deepEqual(saved(db),[]);assert.equal(config(db).version,0);
}));
test('ORDER430 unauthenticated client cannot manage; public listing remains readable',()=>dbRun(async()=>{
 const r=await call(handler,{method:'POST',headers:{},query:{operacion:'login-order'},body:{accion:'leer'}});assert.equal(r.status,401);assert.equal((await list()).status,200);
}));
test('ORDER430 removed, inactive, credential-swapped and revoked sessions cannot save',()=>dbRun(async db=>{
 for(const mutate of [()=>db.state().users.admin.inactive=true,()=>delete db.state().users.admin,()=>db.state().users.admin._credentialId='different',()=>db.tables.sohail_account_security.find(a=>a.id==='i:org').epoch++]){
  db.setStates(states());const request=req(db,'admin',{accion:'guardar',version:0,ids:ids(db)},{operacion:'login-order'});mutate();assert.equal((await call(handler,request)).status,401);
 }
}));
test('ORDER430 role removed from a valid session is checked live rather than trusting token claims',()=>dbRun(async db=>{
 const request=req(db,'admin',{accion:'guardar',version:0,ids:ids(db)},{operacion:'login-order'});db.state().users.admin.role='player';assert.equal((await call(handler,request)).status,403);
}));
test('ORDER430 mandatory password change blocks reorder',()=>dbRun(async db=>{
 db.tables.sohail_account_security.find(a=>a.id==='i:org').must_change=true;
 const r=await post(db,{accion:'leer'});assert.equal(r.status,403);assert.equal(r.body.code,'PASSWORD_CHANGE_REQUIRED');
}));
for(const value of [null,{},['old','old'],['../api'],['<img>'],[12],Array.from({length:5001},(_,i)=>'l'+i)])test('ORDER430 invalid ID array rejects '+(Array.isArray(value)?value.length:typeof value),()=>dbRun(async db=>{
 const r=await post(db,{accion:'guardar',version:0,ids:value});assert.equal(r.status,400);assert.deepEqual(saved(db),[]);
}));
for(const version of [-1,'0',null,0.5,Number.MAX_SAFE_INTEGER+1])test('ORDER430 invalid version rejects '+String(version),()=>dbRun(async db=>{
 assert.equal((await post(db,{accion:'guardar',version,ids:ids(db)})).status,400);
}));
test('ORDER430 omitted/unknown/active league IDs cannot publish an incomplete or foreign list',()=>dbRun(async db=>{
 for(const order of [ids(db).slice(1),[...ids(db),'missing'],[...ids(db),'liga-actual']]){
  const r=await post(db,{accion:'guardar',version:0,ids:order});assert.equal(r.status,409);assert.equal(r.body.code,'LEAGUES_CHANGED');
 }assert.equal(config(db).version,0);
}));
test('ORDER430 concurrent changes use version conflict instead of last-write-wins',()=>dbRun(async db=>{
 const a=ids(db),b=ids(db).reverse();const results=await Promise.all([post(db,{accion:'guardar',version:0,ids:a}),post(db,{accion:'guardar',version:0,ids:b},'superadmin')]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(config(db).version,1);assert.deepEqual(saved(db),a);
}));
test('ORDER430 no-op with current version does not invent another revision',()=>dbRun(async db=>{
 await post(db,{accion:'guardar',version:0,ids:ids(db)});const r=await post(db,{accion:'guardar',version:1,ids:ids(db)});assert.equal(r.status,200);assert.equal(config(db).version,1);
}));
test('ORDER430 DB rechecks privileges between API authorization and transaction',()=>dbRun(async db=>{
 const original=global.fetch;global.fetch=async(u,o)=>{if(String(u).endsWith('/sohail_set_login_league_order'))db.state().users.admin.role='player';return original(u,o);};
 const r=await post(db,{accion:'guardar',version:0,ids:ids(db)});assert.equal(r.status,403);assert.deepEqual(saved(db),[]);
}));
test('ORDER430 DB closure/reopening between load and save requires fresh list',()=>dbRun(async db=>{
 const order=ids(db);db.tables.liga_index.find(l=>l.id==='old').estado='activa';const r=await post(db,{accion:'guardar',version:0,ids:order});assert.equal(r.body.code,'LEAGUES_CHANGED');assert.deepEqual(saved(db),[]);
}));
test('ORDER430 database save failure cannot report success or change league data',()=>dbRun(async db=>{
 const before=structuredClone(db.tables);db.failWrites=1;
 assert.equal((await post(db,{accion:'guardar',version:0,ids:ids(db)})).status,503);assert.deepEqual(db.tables,before);
}));
test('ORDER430 missing optional settings never prevents public listing/login, management explains SQL requirement',()=>dbRun(async db=>{
 delete db.tables.sohail_login_order;const l=await list();assert.equal(l.status,200);assert.equal(l.body.loginOrderAvailable,false);assert.equal(O.closed(l.body.ligas).length,6);
 const r=await post(db,{accion:'leer'});assert.equal(r.status,503);assert.equal(r.body.code,'LOGIN_ORDER_SCHEMA_REQUIRED');assert.match(r.body.error,/06_login_league_order.sql/);
}));
test('ORDER430 invalid persisted settings fail closed for editing and use historical fallback publicly',()=>dbRun(async db=>{
 config(db).league_ids=['old','old'];assert.equal((await post(db,{accion:'leer'})).status,503);assert.equal((await list()).body.loginOrderAvailable,false);
}));
test('ORDER430 paginates league metadata beyond 1000, including lower server max_rows',()=>dbRun(async db=>{
 db.tables.liga_index=Array.from({length:1005},(_,i)=>league('league-'+String(i).padStart(4,'0'),i));
 const original=global.fetch;global.fetch=async(u,o)=>{if(String(u).includes('/liga_index?'))u=String(u).replace('limit=250','limit=47');return original(u,o);};
 const r=await list();assert.equal(r.status,200);assert.equal(r.body.ligas.length,1005);
 assert.ok(db.requests.filter(r=>r.name==='liga_index').length>20);
}));
test('ORDER430 failing index read cannot masquerade as an empty successful list',()=>dbRun(async db=>{
 db.fault=x=>x.name==='liga_index';assert.equal((await list()).status,503);assert.equal((await post(db,{accion:'leer'})).status,503);
}));
test('ORDER430 only declared POST operation is accepted; no added public Function',()=>dbRun(async db=>{
 assert.equal((await post(db,{accion:'delete'})).status,400);
 const r=req(db,'admin',{accion:'leer'},{operacion:'login-order'},'GET');assert.equal((await call(handler,r)).status,405);
 assert.ok(!fs.existsSync(path.join(__dirname,'../api/login-order.js')));
}));
test('ORDER430 migration static security contract and full delivery wiring',()=>{
 const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 const sql=read('06_login_league_order.sql');assert.match(sql,/SECURITY DEFINER SET search_path=pg_catalog,public/);
 for(const word of ['ENABLE ROW LEVEL SECURITY','FOR SHARE','FOR UPDATE','LEAGUES_CHANGED','p_expected','p_actor_key','must_change']){assert.ok(sql.includes(word),word);}
 assert.match(sql,/FROM PUBLIC,anon,authenticated/);assert.ok(!/UPDATE public\.liga_(?:state|index)\b|DELETE FROM public\.liga_(?:state|index)\b|TRUNCATE|DROP TABLE/i.test(sql));
 const html=read('public/index.html');for(const f of ['league-order.js','login-league-order.js','login-league-order.css'])assert.ok(html.includes(f+'?v=sohail-v430-login-league-order'));
 assert.ok(html.indexOf('league-order.js?')<html.indexOf('login-auth.js?'));
 assert.ok(html.indexOf('login-league-order.js?')<html.indexOf('bootstrap.js?'));
 assert.match(read('api/backup.js'),/\['sohail_login_order','order=id.asc'\]/);
 assert.ok(read('07_verify_login_league_order.sql').includes('11_dependencia_04_instalada'));
});
