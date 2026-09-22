'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createDB,fixture,match,call,lib}=require('./support/mock-db.cjs');
const handler=require('../api/_identities_route'),I=require('../api/_identities'),B=require('../api/_bulk-identities'),O=require('../api/_operations');
const ref=(name,ligaId)=>({type:'league',ligaId,name});
function states(people=3,leagues=6){
 const proto=fixture();return Array.from({length:leagues},(_,l)=>{
  const s=fixture();s.users={admin:proto.users.admin,superadmin:proto.users.superadmin};s.ALLNAMES=[];s.LEAGUE_NAME='Temporada '+l;
  for(let n=0;n<people;n++){const name='Persona '+n;s.users[name]={...proto.users.Alicia,name,jugadorId:'person-'+n+'-'+(l%3),email:l===0?'':n+'@example.invalid',tel:l===0?'tel-'+n:'',seasonData:{['season'+l]:l},preferences:{notifications:false,rating:0}};s.ALLNAMES.push(name);}
  s.cycles[0].groups=[{players:s.ALLNAMES}];s.matches=people>1?[match({aName:'Persona 0',bName:'Persona 1',status:'confirmed'})]:[];
  return {id:l===0?'liga-actual':'liga-'+l,state:s,estado:['activa','finalizada','archivada'][l%3]};
 });
}
const batch=(people=3)=>Array.from({length:people},(_,n)=>({refs:[ref('Persona '+n,'liga-actual'),ref('Persona '+n,'liga-1'),ref('Persona '+n,'liga-2')],choices:{}}));
async function withDB(fn,initial=states()){const prior=global.fetch,db=createDB(initial);global.fetch=db.fetch;try{await fn(db);}finally{global.fetch=prior;}}
const post=(db,body,name='superadmin')=>call(handler,{method:'POST',headers:{authorization:'Bearer '+db.token(name)},body:{ligaId:'liga-actual',...body}});
async function commit(db,groups){const p=await post(db,{mode:'bulk-preview',groups});assert.equal(p.status,200,JSON.stringify(p.body));const payload={mode:'bulk-commit',groups,digest:p.body.digest,operationId:crypto.randomUUID()},r=await post(db,payload);return {p:p.body,r,payload};}
test('ALL420 directory includes every active, finished and archived league and every league profile',()=>withDB(async db=>{
 const before=structuredClone(db.tables),r=await post(db,{mode:'directory'});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.complete,true);assert.equal(r.body.maxProfiles,300);
 assert.equal(r.body.leagues.length,6);assert.equal(r.body.records.filter(r=>r.source==='league').length,18);
 assert.deepEqual(new Set(r.body.leagues.map(l=>l.estado)),new Set(['activa','finalizada','archivada']));assert.deepEqual(db.tables,before);
}));
test('ALL420 server pagination continues after a capped two-row page for index, states and catalogue',()=>withDB(async db=>{
 const fetch=db.fetch;global.fetch=(url,opts)=>{const u=new URL(url);if((opts?.method||'GET')==='GET'&&u.searchParams.has('offset')&&['liga_index','liga_state','jugadores'].includes(u.pathname.split('/').at(-1)))u.searchParams.set('limit','2');return fetch(u.toString(),opts);};
 const r=await post(db,{mode:'directory'});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.leagues.length,6);assert.equal(r.body.records.filter(r=>r.source==='league').length,18);
 for(const table of ['liga_index','liga_state','jugadores'])assert.ok(db.requests.some(r=>r.name===table&&r.query.includes('offset=4')),table);
}));
test('ALL420 a missing league state is an explicit error, never a complete partial directory',()=>withDB(async db=>{
 db.tables.liga_state=db.tables.liga_state.filter(r=>r.id!=='liga-5');const before=structuredClone(db.tables),r=await post(db,{mode:'directory'});
 assert.equal(r.status,503);assert.equal(r.body.code,'MISSING_LEAGUE_STATE');assert.deepEqual(db.tables,before);
}));
test('ALL420 failure on later pages aborts the read rather than losing seasons',()=>withDB(async db=>{
 const fetch=db.fetch;global.fetch=(url,opts)=>{const u=new URL(url);if(u.pathname.endsWith('/liga_index')&&u.searchParams.has('offset'))u.searchParams.set('limit','2');return fetch(u.toString(),opts);};
 db.fault=({name,url})=>name==='liga_index'&&url.searchParams.get('offset')==='4';const before=structuredClone(db.tables),r=await post(db,{mode:'directory'});
 assert.equal(r.status,503);assert.deepEqual(db.tables,before);
}));
test('ALL420 three selected profiles combine six seasons and every field without changing credentials or sport records',()=>withDB(async db=>{
 const before=structuredClone(db.tables),{p,r}=await commit(db,batch());assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(p.summary.selectedProfiles,9);assert.equal(p.summary.cases,3);assert.equal(p.summary.leagues.length,6);
 const identities=new Set();for(let n=0;n<3;n++){
  const name='Persona '+n,u=db.state().users[name];identities.add(u.historialId);
  for(const l of before.liga_state){const next=db.state(l.id);assert.equal(next.users[name].historialId,u.historialId);assert.equal(next.users[name].tel,'tel-'+n);assert.equal(next.users[name].preferences.notifications,false);assert.equal(next.users[name].preferences.rating,0);
   assert.equal(Object.keys(next.users[name].seasonData).length,6);for(const key of ['pass','role','isAdmin','inactive','jugadorId','_credentialId'])assert.deepEqual(next.users[name][key],l.data.users[name][key]);
   assert.deepEqual(next.matches,l.data.matches);assert.deepEqual(next.cycles,l.data.cycles);assert.equal(next._v,l.data._v+1);
  }
 }assert.equal(identities.size,3);assert.deepEqual(db.tables.jugadores,before.jugadores);assert.deepEqual(db.tables.sohail_account_security,before.sohail_account_security);assert.deepEqual(db.tables.passkeys,before.passkeys);
 assert.equal(db.requests.filter(r=>r.name==='sohail_apply_data_operation').length,1);
}));
test('ALL420 300 selected profiles in 100 independent groups commit once across six leagues',()=>withDB(async db=>{
 const groups=batch(100),before=structuredClone(db.tables);const {p,r}=await commit(db,groups);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(p.summary.selectedProfiles,300);assert.equal(p.summary.cases,100);assert.equal(p.summary.members,900);
 assert.equal(new Set(Object.values(db.state().users).map(u=>u.historialId).filter(Boolean)).size,100);
 for(const old of before.liga_state){const next=db.state(old.id);assert.equal(next._v,old.data._v+1);assert.deepEqual(next.matches,old.data.matches);assert.deepEqual(next.cycles,old.data.cycles);for(let n=0;n<100;n++)assert.equal(next.users['Persona '+n].historialId,db.state().users['Persona '+n].historialId);}
 const rpc=db.requests.filter(r=>r.name==='sohail_apply_data_operation');assert.equal(rpc.length,1);assert.equal(rpc[0].body.p_states.length,6);
 assert.equal(db.tables.sohail_data_operations.length,1);
},states(100)));
test('ALL420 300 profiles of one person across 300 leagues are supported by the planner',()=>withDB(async db=>{
 // Distinct sporting IDs ensure this really exercises 300 references, not one identity expanded.
 for(let l=0;l<300;l++)db.state(l===0?'liga-actual':'liga-'+l).users['Persona 0'].jugadorId='unique-'+l;
 const ctx=await O.context({headers:{authorization:'Bearer '+db.token('superadmin')}}),reg=await O.registry(),all=await I.universe(ctx,reg),before=structuredClone({all,reg});
 const refs=Array.from({length:300},(_,l)=>ref('Persona 0',l===0?'liga-actual':'liga-'+l)),plan=B.planBulkMerge(ctx,all,reg,[{refs,choices:{}}]);
 assert.equal(plan.summary.selectedProfiles,300);assert.equal(plan.summary.cases,1);assert.equal(plan.states.length,300);assert.deepEqual({all,reg},before);
},states(1,300)));
test('ALL420 more than 300 profiles is rejected before writes in single and bulk modes',()=>withDB(async db=>{
 const groups=batch(101),before=structuredClone(db.tables);
 const r=await post(db,{mode:'bulk-preview',groups});assert.equal(r.status,400);assert.equal(r.body.code,'BATCH_PROFILE_LIMIT');
 const p=await post(db,{mode:'preview',kind:'merge',refs:groups.flatMap(g=>g.refs)});assert.equal(p.status,400);assert.equal(p.body.code,'INVALID_REFERENCE');
 assert.deepEqual(db.tables,before);assert.equal(db.requests.filter(r=>r.name==='sohail_apply_data_operation').length,0);
},states(101)));
test('ALL420 a distinct-person decision on the third member prevents the entire batch',()=>withDB(async db=>{
 const groups=batch();db.tables.sohail_identity_registry[0].data.decisions.x={status:'distinct',keys:[I.refKey(groups[0].refs[0]),I.refKey(groups[0].refs[2])]};
 const before=structuredClone(db.tables),r=await post(db,{mode:'bulk-preview',groups});assert.equal(r.status,409);assert.equal(r.body.code,'DISTINCT_PLAYERS');assert.deepEqual(db.tables,before);
}));
test('ALL420 groups sharing a third profile are rejected rather than merging unrelated cases',()=>withDB(async db=>{
 const groups=batch();groups[1].refs.push(groups[0].refs[2]);const r=await post(db,{mode:'bulk-preview',groups});assert.equal(r.status,409);assert.equal(r.body.code,'BATCH_OVERLAP');assert.equal(db.tables.sohail_data_operations.length,0);
}));
test('ALL420 arbitrary same-person refs do not weaken the self-match guard',()=>withDB(async db=>{
 const refs=[ref('Persona 0','liga-actual'),ref('Persona 0','liga-1'),ref('Persona 1','liga-actual')],before=structuredClone(db.tables),r=await post(db,{mode:'preview',kind:'link',refs});
 assert.equal(r.status,409);assert.equal(r.body.code,'SELF_MATCH');assert.deepEqual(db.tables,before);
}));
test('ALL420 a selected reference cannot appear twice within a single group',()=>withDB(async db=>{
 const g=batch()[0];g.refs.push(g.refs[0]);const r=await post(db,{mode:'bulk-preview',groups:[g]});assert.equal(r.status,400);assert.equal(r.body.code,'DUPLICATE_REFERENCE');
}));
test('ALL420 an implicitly expanded sixth league changing invalidates the full preview',()=>withDB(async db=>{
 const groups=batch(),p=await post(db,{mode:'bulk-preview',groups});assert.equal(p.status,200);db.state('liga-5')._v++;
 const before=structuredClone(db.tables),r=await post(db,{mode:'bulk-commit',groups,digest:p.body.digest,operationId:crypto.randomUUID()});assert.equal(r.status,409);assert.equal(r.body.code,'PREVIEW_EXPIRED');assert.deepEqual(db.tables,before);
}));
test('ALL420 a local administrator cannot use all-league selection to gain global permissions',()=>withDB(async db=>{
 const r=await post(db,{mode:'bulk-preview',groups:batch()},'admin');assert.equal(r.status,403);assert.equal(r.body.code,'GLOBAL_IDENTITY_REQUIRED');assert.equal(db.tables.sohail_data_operations.length,0);
}));
test('ALL420 grouped 3-profile linking retains all conflicting values and supports undo',()=>withDB(async db=>{
 for(let l=0;l<6;l++)db.state(l===0?'liga-actual':'liga-'+l).users['Persona 0'].tel='variant-'+l;
 const groups=[batch()[0]],p=await post(db,{mode:'bulk-preview',groups});assert.equal(p.status,200);
 groups[0].choices['["tel"]']=p.body.cases[0].profile.alternatives['["tel"]'].values.findIndex(v=>v.value==='variant-5');
 const before=structuredClone(db.tables),{r,payload}=await commit(db,groups);assert.equal(r.status,200);const id=db.state().users['Persona 0'].historialId,profile=db.tables.sohail_identity_registry[0].data.profiles[id];
 assert.equal(db.state().users['Persona 0'].tel,'variant-5');assert.equal(profile.alternatives['["tel"]'].values.length,6);
 const up=await post(db,{mode:'undo-preview',undoId:payload.operationId});assert.equal(up.status,200);
 const undo=await post(db,{mode:'undo-commit',undoId:payload.operationId,digest:up.body.digest,operationId:crypto.randomUUID()});assert.equal(undo.status,200);
 for(const old of before.liga_state){const now=db.state(old.id);assert.deepEqual(now.users,old.data.users);assert.deepEqual(now.matches,old.data.matches);}
}));
test('ALL420 profiles exclusive to three historical leagues can be unified without being in the current league',()=>withDB(async db=>{
 for(let l=1;l<=3;l++){const u=db.state('liga-'+l).users['Persona 0'];db.state('liga-'+l).users['Jugador histórico']={...u,name:'Jugador histórico',jugadorId:'historical-'+l};}
 const refs=[1,2,3].map(l=>ref('Jugador histórico','liga-'+l)),directory=await post(db,{mode:'directory'});
 assert.equal(directory.body.records.filter(r=>r.name==='Jugador histórico').length,3);
 const {r}=await commit(db,[{refs,choices:{}}]);assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(new Set([1,2,3].map(l=>db.state('liga-'+l).users['Jugador histórico'].historialId)).size,1);
 assert.equal(db.state().users['Jugador histórico'],undefined);
}));
test('ALL420 the exact 301-profile boundary is rejected in both merge entry points',()=>withDB(async db=>{
 const refs=batch(101).flatMap(g=>g.refs).slice(0,301),before=structuredClone(db.tables);
 for(const body of [{mode:'preview',kind:'link',refs},{mode:'bulk-preview',groups:[{refs,choices:{}}]}]){const r=await post(db,body);assert.equal(r.status,400);}
 assert.deepEqual(db.tables,before);
},states(101)));
