'use strict';
// The admission policy is shared; API tests below use real handlers with a
// simulated database. No test reads credentials or sends traffic to Supabase.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const P=require('../public/result-policy');
const V=require('../api/_validation');
const {fixture,match,createDB,lib,req,call}=require('./support/mock-db.cjs');
const clone=structuredClone;
function project(s,name='Alicia'){return lib.filterForSession(clone(s),{u:name});}
async function apiCase(s,name,change){
 const db=createDB([{id:'liga-actual',state:s}]),incoming=project(db.state(),name);change(incoming);
 const old=global.fetch;global.fetch=db.fetch;
 try{return {db,response:await call(require('../api/save'),req(db,name,{ligaId:'liga-actual',state:incoming}))};}finally{global.fetch=old;}
}
for(const role of ['Alicia','admin','superadmin']){
 test('GUARD new active match is still allowed: '+role,async()=>{
  const {db,response}=await apiCase(fixture(),role,s=>{s.matches=[match()];});
  assert.equal(response.status,200);assert.equal(db.state().matches.length,1);
 });
 for(const status of ['finished','locked'])test('GUARD closed/locked stage refuses new results including editMode: '+role+' '+status,async()=>{
  const s=fixture();s.cycles[0].status=status;s.cycles[0].editMode=true;
  const {db,response}=await apiCase(s,role,i=>{i.matches=[match()];});
  assert.equal(response.status,403);assert.equal(response.body.code,'RESULT_STAGE_CLOSED');assert.deepEqual(db.state(),s);
 });
 for(const status of ['pending','disputed','confirmed'])test('GUARD duplicate pair/inverted names cannot be loaded under a new ID: '+role+' '+status,async()=>{
  const s=fixture();s.matches=[match({status})];
  const {db,response}=await apiCase(s,role,i=>{i.matches.push(match({id:2,aName:'Beto',bName:'Alicia'}));});
  assert.ok([400,409].includes(response.status));assert.deepEqual(db.state(),s);
 });
 test('GUARD delete + recreate does not bypass duplicate protection: '+role,async()=>{
  const s=fixture();s.matches=[match()];
  const {db,response}=await apiCase(s,role,i=>{i.matches=[match({id:2})];});
  assert.equal(response.status,409);assert.equal(response.body.code,'RESULT_ALREADY_SAVED');assert.deepEqual(db.state(),s);
 });
}
for(const role of ['admin','superadmin'])test('GUARD administrator corrects SAME record in closed cycle, without reopening: '+role,async()=>{
 const s=fixture();s.cycles[0].status='finished';s.matches=[match({status:'confirmed',locked:true})];
 const {db,response}=await apiCase(s,role,i=>{i.matches[0].sets=[[6,4],[7,5]];});
 assert.equal(response.status,200);assert.equal(db.state().matches[0].id,1);assert.deepEqual(db.state().matches[0].sets,[[6,4],[7,5]]);assert.equal(db.state().cycles[0].status,'finished');
});
test('GUARD incoming same-request reopening cannot authorize new closed-cycle load',async()=>{
 const s=fixture();s.cycles[0].status='finished';
 const {db,response}=await apiCase(s,'admin',i=>{i.cycles[0].status='active';i.matches=[match()];});
 assert.equal(response.status,403);assert.deepEqual(db.state(),s);
});
test('GUARD previous cycle flagged active is not the currently active cycle',()=>{
 const s=fixture();s.activeN=2;s.cycles[1]={n:2,status:'active',groups:clone(s.cycles[0].groups)};
 assert.equal(P.phaseOpen(s,{cycle:1}),false);assert.equal(P.phaseOpen(s,{cycle:2}),true);
});
test('GUARD active group new match still allowed when another pair is recorded',()=>{
 const s=fixture();s.matches=[match()];assert.equal(P.newBlock(s,{cycle:1,gid:1,a:'Alicia',b:'Ciro'}),'');
});
test('GUARD saved pending result cannot be edited/deleted by a player',async()=>{
 const s=fixture();s.matches=[match()];
 for(const f of [i=>i.matches[0].sets=[[6,4],[6,1]],i=>i.matches=[]]){
  const {db,response}=await apiCase(s,'Alicia',f);assert.equal(response.status,403);assert.deepEqual(db.state(),s);
 }
});
test('GUARD player can still request review of own pending result in active stage',async()=>{
 const s=fixture();s.matches=[match()];const {db,response}=await apiCase(s,'Alicia',i=>{i.matches[0].status='disputed';});
 assert.equal(response.status,200);assert.equal(db.state().matches[0].status,'disputed');
});
test('GUARD closed cycle player cannot dispute or alter saved result',async()=>{
 const s=fixture();s.cycles[0].status='finished';s.matches=[match()];
 const {db,response}=await apiCase(s,'Alicia',i=>{i.matches[0].status='disputed';});
 assert.equal(response.status,403);assert.deepEqual(db.state(),s);
});
test('GUARD administrator validation of pending record remains allowed',async()=>{
 const s=fixture();s.matches=[match()];const {db,response}=await apiCase(s,'admin',i=>{Object.assign(i.matches[0],{status:'confirmed',vBy:'Organización',locked:true});});
 assert.equal(response.status,200);assert.equal(db.state().matches[0].status,'confirmed');
});
function poState(started=true){const s=fixture();s.cycles[0].status='finished';s.playoff={started,preview:!started,tramos:[{label:'A',main:[[{a:'Alicia',b:'Beto',sets:[],locked:false},{a:'Ciro',b:'Diego',sets:[],locked:false}]],cons:[]}],results:{}};return s;}
function poMatch(extra={}){const m=match({po:true,poNames:['Alicia','Beto'],ti:0,which:'main',ri:0,mi:0,winner:'Alicia',...extra});delete m.cycle;delete m.g;delete m.aName;delete m.bName;return m;}
for(const who of ['Alicia','admin','superadmin'])test('GUARD playoffs preview rejects a new score: '+who,async()=>{
 const s=poState(false);const {db,response}=await apiCase(s,who,i=>{i.matches=[poMatch()];});assert.equal(response.status,403);assert.deepEqual(db.state(),s);
});
test('GUARD playoffs started accepts an empty real slot',async()=>{
 const {db,response}=await apiCase(poState(),'Alicia',i=>{i.matches=[poMatch()];});assert.equal(response.status,200);assert.equal(db.state().matches.length,1);
});
test('GUARD stored slot blocks duplicate even if submitted names changed',async()=>{
 const s=poState();s.matches=[poMatch()];const {db,response}=await apiCase(s,'admin',i=>{i.matches.push(poMatch({id:2,poNames:['Ciro','Diego'],winner:'Ciro'}));});
 assert.equal(response.status,409);assert.deepEqual(db.state(),s);
});
test('GUARD legacy draw-only score cannot be silently overwritten',async()=>{
 const s=poState();Object.assign(s.playoff.tramos[0].main[0][0],{locked:true,winner:'Alicia',sets:[[6,3],[6,1]]});
 const {db,response}=await apiCase(s,'admin',i=>{i.matches=[poMatch()];});assert.equal(response.status,409);assert.deepEqual(db.state(),s);
});
test('GUARD new group result refused after playoffs started',async()=>{
 const s=poState();s.cycles[0].status='active';const {db,response}=await apiCase(s,'admin',i=>{i.matches=[match()];});assert.equal(response.status,403);assert.deepEqual(db.state(),s);
});
test('GUARD new No jugado refused in closed cycle',async()=>{
 const s=fixture();s.cycles[0].status='finished';const {db,response}=await apiCase(s,'admin',i=>{i.matches=[match({np:true,sets:[],status:'confirmed'})];});assert.equal(response.status,403);assert.deepEqual(db.state(),s);
});
test('GUARD historical records remain untouched during unrelated settings save',async()=>{
 const s=fixture();s.cycles[0].status='finished';s.matches=[match({sets:[null]})];const {db,response}=await apiCase(s,'admin',i=>{i.LEAGUE_NAME='Nuevo título';});assert.equal(response.status,200);assert.deepEqual(db.state().matches,s.matches);
});
test('GUARD automatic close without new results is still permitted',async()=>{
 const s=fixture();s.matches=[match({status:'confirmed',locked:true})];const {db,response}=await apiCase(s,'admin',i=>{i.cycles[0].status='finished';i.cycles[1]={n:2,status:'active',groups:clone(i.cycles[0].groups)};i.activeN=2;});assert.equal(response.status,200);assert.equal(db.state().activeN,2);
});
test('GUARD concurrent close: stale form cannot save or silently adopt newer version',async()=>{
 const s=fixture(),db=createDB([{id:'liga-actual',state:s}]);const incoming=project(db.state());incoming.matches=[match()];db.state().cycles[0].status='finished';db.state()._v++;
 const old=global.fetch;global.fetch=db.fetch;
 try{const r=await call(require('../api/save'),req(db,'Alicia',{ligaId:'liga-actual',state:incoming}));assert.equal(r.status,409);assert.equal(db.state().matches.length,0);assert.equal(db.state().cycles[0].status,'finished');}finally{global.fetch=old;}
});
test('GUARD mobile fixed-name styles preserve all table columns and include header layering',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/ui-modern.css'),'utf8');assert.match(css,/#view-general,#view-rating/);assert.match(css,/thead th:nth-child\(2\)\{top:0;z-index:7/);
 assert.match(css,/gen-table tbody tr\.me-row>td:nth-child\(2\)/);
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');assert.ok(html.indexOf('result-policy.js?')<html.indexOf('result-editor.js?'));
});
test('GUARD admin categories no longer promise a closed-cycle upload override',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../public/admin-workspace.js'),'utf8');
 assert.doesNotMatch(src,/Reporting is enabled for a closed cycle|Hay un ciclo cerrado con carga habilitada/);
 const admin=fs.readFileSync(path.join(__dirname,'../public/admin-ciclos-config.js'),'utf8');
 assert.doesNotMatch(admin,/onclick="toggleEditMode/);
});
test('GUARD delegated admin can correct existing closed result without gaining structure rights',async()=>{
 const s=fixture();s.users.Alicia.isAdmin=true;s.cycles[0].status='finished';s.matches=[match({status:'confirmed'})];
 const {response,db}=await apiCase(s,'Alicia',i=>{i.matches[0].sets=[[6,1],[6,0]];});
 assert.equal(response.status,200);assert.equal(db.state().cycles[0].status,'finished');assert.equal(db.state().users.Alicia.role,'player');
});
