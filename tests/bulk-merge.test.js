'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createDB,fixture,match,call,lib}=require('./support/mock-db.cjs');
const handler=require('../api/_identities_route'),O=require('../api/_operations'),I=require('../api/_identities');
const B=require('../api/_bulk-identities');
const ref=(name,ligaId='liga-actual')=>({type:'league',ligaId,name});
function fixtures(){
 const current=fixture(),old=fixture();
 current.users.Alicia.email='';current.users.Alicia.tel='111';current.users.Alicia.preferences={notifications:false,level:0};
 old.users.Alicia.email='historia@example.invalid';old.users.Alicia.tel='222';old.users.Alicia.hand='left';
 current.users.Beto.tags=['actual'];old.users.Beto.tags=['pasado'];
 for(const [n,u]of Object.entries(old.users))if(u.role==='player'){u.jugadorId='old-'+u.jugadorId;u.pass=lib.hashV2('anterior123');}
 current.matches=[match({status:'confirmed'})];old.matches=[match({status:'confirmed',date:'2024-01-01'})];
 old.cycles.forEach(c=>c.status='finished');
 return [{id:'liga-actual',state:current},{id:'liga-pasada',state:old,estado:'finalizada'}];
}
const groups=()=>['Alicia','Beto'].map(n=>({refs:[ref(n),ref(n,'liga-pasada')],choices:{}}));
async function withDB(fn,states=fixtures()){const prev=global.fetch,db=createDB(states);global.fetch=db.fetch;try{await fn(db);}finally{global.fetch=prev;}}
const post=(db,body,name='superadmin',token=null)=>call(handler,{method:'POST',query:{},headers:{authorization:'Bearer '+(token||db.token(name))},body:{ligaId:'liga-actual',...body}});
async function preview(db,batch=groups(),name='superadmin'){
 const r=await post(db,{mode:'bulk-preview',groups:batch},name);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;
}
async function commit(db,batch=groups(),name='superadmin'){
 const p=await preview(db,batch,name),payload={mode:'bulk-commit',groups:batch,digest:p.digest,operationId:crypto.randomUUID()};
 const r=await post(db,payload,name);return {r,p,payload};
}
test('BULK410 preview is read-only, keeps two independent identities and counts matches once per league',()=>withDB(async db=>{
 const before=structuredClone(db.tables);const p=await preview(db);assert.deepEqual(db.tables,before);
 assert.equal(p.summary.cases,2);assert.equal(p.summary.matches,2);assert.equal(p.cases.length,2);
 assert.notEqual(p.cases[0].summary.profileId,p.cases[1].summary.profileId);
 assert.equal(p.cases[0].profile.fields.email,'historia@example.invalid');
 assert.equal(p.cases[0].profile.fields.preferences.notifications,false);assert.equal(p.cases[0].profile.fields.preferences.level,0);
}));
test('BULK410 all cases save in exactly one RPC with one write per league and one operation record',()=>withDB(async db=>{
 const original=structuredClone(db.tables),{r}=await commit(db);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.committed,true);
 const calls=db.requests.filter(q=>q.name==='sohail_apply_data_operation');assert.equal(calls.length,1);assert.equal(calls[0].body.p_kind,'merge');
 assert.equal(calls[0].body.p_states.length,2);assert.equal(db.tables.sohail_data_operations.length,1);
 for(const id of ['liga-actual','liga-pasada']){
  const s=db.state(id),old=original.liga_state.find(r=>r.id===id).data;
  assert.equal(s._v,old._v+1);assert.deepEqual(s.matches,old.matches);assert.deepEqual(s.cycles,old.cycles);
  for(const n of Object.keys(old.users))for(const key of ['pass','role','isAdmin','jugadorId','_credentialId','inactive'])assert.deepEqual(s.users[n][key],old.users[n][key]);
 }
 assert.equal(db.state().users.Alicia.historialId,db.state('liga-pasada').users.Alicia.historialId);
 assert.notEqual(db.state().users.Alicia.historialId,db.state().users.Beto.historialId);
 assert.deepEqual(db.state().users.Beto.tags,['actual','pasado']);
 assert.deepEqual(db.tables.sohail_account_security,original.sohail_account_security);
 assert.deepEqual(db.tables.passkeys,original.passkeys);assert.deepEqual(db.tables.jugadores,original.jugadores);
}));
test('BULK410 per-case conflict choices preserve every alternative and source',()=>withDB(async db=>{
 const batch=groups(),p=await preview(db,batch),key='["tel"]',alts=p.cases[0].profile.alternatives[key].values;
 batch[0].choices[key]=alts.findIndex(x=>x.value==='222');const {r}=await commit(db,batch);assert.equal(r.status,200);
 assert.equal(db.state().users.Alicia.tel,'222');const sid=db.state().users.Alicia.historialId;
 const profile=db.tables.sohail_identity_registry[0].data.profiles[sid];
 assert.deepEqual(profile.alternatives[key].values.map(v=>v.value).sort(),['111','222']);assert.ok(profile.alternatives[key].values.every(v=>v.from.length));
}));
test('BULK410 overlapping aliases and transitive chains reject the whole batch',()=>withDB(async db=>{
 const before=structuredClone(db.tables),batch=groups();batch.push({refs:[ref('Alicia','liga-pasada'),ref('Ciro')],choices:{}});
 const r=await post(db,{mode:'bulk-preview',groups:batch});assert.equal(r.status,409);assert.equal(r.body.code,'BATCH_OVERLAP');assert.match(r.body.error,/Caso 3/);
 assert.deepEqual(db.tables,before);
}));
test('BULK410 overlap through a shared catalogue identity is also rejected',()=>withDB(async db=>{
 const batch=groups();batch[1]={refs:[{type:'catalog',id:'profile-0'},ref('Ciro')],choices:{}};
 const r=await post(db,{mode:'bulk-preview',groups:batch});assert.equal(r.body.code,'BATCH_OVERLAP');
}));
test('BULK410 a self-match in any case prevents all merges',()=>withDB(async db=>{
 const batch=groups();batch[1]={refs:[ref('Ciro'),ref('Diego')],choices:{}};
 db.state().matches.push(match({id:2,aName:'Ciro',bName:'Diego',status:'confirmed'}));
 const before=structuredClone(db.tables);const r=await post(db,{mode:'bulk-preview',groups:batch});
 assert.equal(r.status,409);assert.equal(r.body.code,'SELF_MATCH');assert.deepEqual(db.tables,before);
}));
test('BULK410 distinct-person decisions cannot be bypassed by bulk selection',()=>withDB(async db=>{
 const reg=db.tables.sohail_identity_registry[0];reg.data.decisions.x={keys:groups()[1].refs.map(I.refKey),status:'distinct'};
 const r=await post(db,{mode:'bulk-preview',groups:groups()});assert.equal(r.status,409);assert.equal(r.body.code,'DISTINCT_PLAYERS');assert.equal(db.tables.sohail_data_operations.length,0);
}));
for(const bad of [null,[],Array.from({length:151},()=>groups()[0]),[{}],[{refs:[ref('Alicia')]}],[{refs:groups()[0].refs,choices:[]}],
 [{refs:groups()[0].refs,choices:{'["role"]':0}}],JSON.parse('[{"refs":[],"__proto__":{"x":1}}]')]){
 test('BULK410 malformed, unsafe or oversized batch is rejected '+JSON.stringify(bad).slice(0,90),()=>withDB(async db=>{
  const before=structuredClone(db.tables);const r=await post(db,{mode:'bulk-preview',groups:bad});assert.ok(r.status>=400);assert.deepEqual(db.tables,before);
 }));
}
test('BULK410 a removed record cannot be inferred from a similar name',()=>withDB(async db=>{
 const batch=groups();batch[1].refs[1]=ref('Beto inexistente','liga-pasada');const r=await post(db,{mode:'bulk-preview',groups:batch});assert.equal(r.status,404);assert.equal(r.body.code,'PROFILE_NOT_FOUND');
}));
test('BULK410 normal players and forged token roles cannot preview or commit',()=>withDB(async db=>{
 const t=lib.verifyToken(db.token('Alicia'));t.r='superadmin';
 for(const mode of ['bulk-preview','bulk-commit']){
  const r=await post(db,{mode,groups:groups(),operationId:crypto.randomUUID()},'Alicia',lib.signToken(t));assert.equal(r.status,403);
 }
 assert.equal(db.tables.sohail_data_operations.length,0);
}));
test('BULK410 local admin cannot modify the global catalogue indirectly',()=>withDB(async db=>{
 const r=await post(db,{mode:'bulk-preview',groups:groups()},'admin');assert.equal(r.status,403);assert.equal(r.body.code,'GLOBAL_IDENTITY_REQUIRED');
}));
test('BULK410 local admin can merge two independent pairs of local legacy aliases',()=>withDB(async db=>{
 const s=fixture();for(const[n,u]of Object.entries(s.users))if(u.role==='player'){delete u.jugadorId;u._credentialId=n;}
 for(const n of ['Alicia','Beto'])s.users[n+' Antigua']={...s.users[n],_credentialId:n+'-old',name:n+' Antigua',tel:'999'};
 db.setStates([{id:'liga-actual',state:s}]);const batch=['Alicia','Beto'].map(n=>({refs:[ref(n),ref(n+' Antigua')],choices:{}}));
 assert.equal((await commit(db,batch,'admin')).r.status,200);assert.equal(db.tables.sohail_data_operations.length,1);
}));
test('BULK410 stale preview after any league changes refuses the entire batch',()=>withDB(async db=>{
 const batch=groups(),p=await preview(db,batch);db.state('liga-pasada')._v++;
 const before=structuredClone(db.tables);const r=await post(db,{mode:'bulk-commit',groups:batch,digest:p.digest,operationId:crypto.randomUUID()});
 assert.equal(r.status,409);assert.equal(r.body.code,'PREVIEW_EXPIRED');assert.deepEqual(db.tables,before);
}));
test('BULK410 changing the selected pairs or field choices invalidates the signed preview',()=>withDB(async db=>{
 const batch=groups(),p=await preview(db,batch);batch.pop();const r=await post(db,{mode:'bulk-commit',groups:batch,digest:p.digest,operationId:crypto.randomUUID()});
 assert.equal(r.status,409);assert.equal(r.body.code,'PREVIEW_EXPIRED');assert.equal(db.tables.sohail_data_operations.length,0);
}));
test('BULK410 a transaction failure leaves both leagues, registry and operation log unchanged',()=>withDB(async db=>{
 const batch=groups(),p=await preview(db,batch),before=structuredClone(db.tables);db.failWrites=1;
 const r=await post(db,{mode:'bulk-commit',groups:batch,digest:p.digest,operationId:crypto.randomUUID()});assert.equal(r.status,503);assert.deepEqual(db.tables,before);
}));
test('BULK410 a lost-response retry is idempotent and private status confirms the whole batch',()=>withDB(async db=>{
 const {r,payload}=await commit(db);assert.equal(r.status,200);const before=structuredClone(db.tables);
 const again=await post(db,payload);assert.equal(again.status,200);assert.equal(again.body.committed,true);assert.deepEqual(db.tables,before);
 const status=await post(db,{mode:'status',operationId:payload.operationId});assert.equal(status.body.summary.cases,2);assert.equal(status.body.committed,true);
}));
test('BULK410 a different actor cannot reuse the operation ID or read its status',()=>withDB(async db=>{
 const {payload}=await commit(db);assert.equal((await post(db,payload,'admin')).status,409);
 assert.equal((await post(db,{mode:'status',operationId:payload.operationId},'admin')).status,403);
}));
test('BULK410 revoking the source account between preview and commit prevents writes',()=>withDB(async db=>{
 const batch=groups(),p=await preview(db,batch),token=db.token('superadmin');
 db.tables.sohail_account_security.find(a=>a.id==='i:super').epoch++;
 const r=await post(db,{mode:'bulk-commit',groups:batch,digest:p.digest,operationId:crypto.randomUUID()},'superadmin',token);
 assert.equal(r.status,401);assert.equal(db.tables.sohail_data_operations.length,0);
}));
test('BULK410 undo restores every selected case without resetting credentials or losing matches',()=>withDB(async db=>{
 const before=structuredClone(db.tables),{r,payload}=await commit(db);assert.equal(r.status,200);
 const p=await post(db,{mode:'undo-preview',undoId:payload.operationId});assert.equal(p.status,200,JSON.stringify(p.body));
 const undo=await post(db,{mode:'undo-commit',undoId:payload.operationId,digest:p.body.digest,operationId:crypto.randomUUID()});assert.equal(undo.status,200);
 for(const row of before.liga_state){const now=structuredClone(db.state(row.id));delete now._v;const old=structuredClone(row.data);delete old._v;assert.deepEqual(now,old);}
 assert.deepEqual(db.tables.sohail_account_security,before.sohail_account_security);
 assert.deepEqual(db.tables.sohail_identity_registry[0].data,before.sohail_identity_registry[0].data);
}));
test('BULK410 the complete planner never mutates its input universe or registry',()=>withDB(async db=>{
 const ctx=await O.context({headers:{authorization:'Bearer '+db.token('superadmin')}}),reg=await O.registry(),all=await I.universe(ctx,reg);
 const before=structuredClone({reg,all});B.planBulkMerge(ctx,all,reg,groups());assert.deepEqual({reg,all},before);
}));
test('BULK410 a twenty-case batch keeps twenty identities and every member',()=>withDB(async db=>{
 const current=fixture(),old=fixture(),batch=[];
 for(let i=0;i<20;i++){
  const n='Prueba '+i;
  current.users[n]={...current.users.Alicia,name:n,jugadorId:'new-batch-'+i,email:'',tel:String(i)};
  old.users[n]={...old.users.Alicia,name:n,jugadorId:'old-batch-'+i,email:'p'+i+'@example.invalid',tel:''};
  batch.push({refs:[ref(n),ref(n,'liga-pasada')],choices:{}});
 }
 db.setStates([{id:'liga-actual',state:current},{id:'liga-pasada',state:old,estado:'finalizada'}]);
 const {r}=await commit(db,batch);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.summary.cases,20);
 const ids=new Set();for(let i=0;i<20;i++){
  const n='Prueba '+i,u=db.state().users[n],v=db.state('liga-pasada').users[n];
  assert.equal(u.historialId,v.historialId);ids.add(u.historialId);
  assert.equal(u.email,'p'+i+'@example.invalid');assert.equal(u.tel,String(i));
  assert.equal(u.jugadorId,'new-batch-'+i);assert.equal(v.jugadorId,'old-batch-'+i);
 }
 assert.equal(ids.size,20);assert.equal(db.tables.sohail_data_operations.length,1);
 assert.equal(db.requests.filter(q=>q.name==='sohail_apply_data_operation').length,1);
}));
