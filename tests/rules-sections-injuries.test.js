'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createDB,fixture,match,req,call,lib}=require('./support/mock-db.cjs');
const liga=require('../api/liga'),save=require('../api/save'),I=require('../api/_injuries'),V=require('../api/_validation');
const B=(s,extra={})=>({ligaId:'liga-actual',expectedVersion:s._v,player:'Alicia',cycle:1,injured:true,opponents:['Beto','Ciro'],...extra});
const q=(db,extra={},name='admin')=>req(db,name,B(db.state(),extra),{operacion:'injuries'});
async function run(fn,states){const db=createDB(states),old=global.fetch;global.fetch=db.fetch;try{return await fn(db);}finally{global.fetch=old;}}
const writes=db=>db.requests.filter(r=>r.name==='sohail_write_state');
for(const actor of ['admin','superadmin'])test('INJ '+actor+' records two absences in one write without scores',()=>run(async db=>{
 const r=await call(liga,q(db,{},actor));assert.equal(r.status,200);assert.equal(writes(db).length,1);assert.equal(db.state().users.Alicia.injured,true);assert.equal(r.body.summary.added,2);
 for(const m of db.state().matches){assert.equal(m.np,true);assert.equal(m.npReason,'injury');assert.equal(m.status,'confirmed');assert.deepEqual(m.sets,[]);assert.equal(m.winner,undefined);assert.equal(m.wo,undefined);assert.equal(m.date,'');assert.equal(I.injuredName(m),'Alicia');}
 assert.equal(r.body.state.users.Alicia.pass,undefined);assert.equal(r.headers['Cache-Control'],'no-store');
}));
test('INJ no token denied',()=>run(async db=>{const r=await call(liga,{...q(db),headers:{}});assert.equal(r.status,401);assert.equal(writes(db).length,0);}));
test('INJ player cannot submit admin request',()=>run(async db=>{assert.equal((await call(liga,q(db,{},'Alicia'))).status,403);assert.equal(writes(db).length,0);}));
test('INJ delegated league admin allowed for others, not own matches',()=>run(async db=>{db.state().users.Diego.isAdmin=true;assert.equal((await call(liga,q(db,{},'Diego'))).status,200);assert.equal((await call(liga,q(db,{opponents:['Beto','Ciro','Diego']},'Diego'))).body.code,'INJURY_OWN_MATCH');}));
test('INJ mark current availability without any match changes',()=>run(async db=>{const r=await call(liga,q(db,{opponents:[]}));assert.equal(r.status,200);assert.equal(db.state().matches.length,0);assert.equal(db.state().users.Alicia.injured,true);}));
test('INJ recovery retains past absences',()=>run(async db=>{await call(liga,q(db));const before=structuredClone(db.state().matches);await call(liga,q(db,{injured:false}));assert.equal(db.state().users.Alicia.injured,false);assert.deepEqual(db.state().matches,before);}));
test('INJ deselect removes only the selected player’s absence in selected cycle',()=>run(async db=>{await call(liga,q(db));const kept=db.state().matches.find(m=>m.bName==='Beto');const r=await call(liga,q(db,{opponents:['Beto']}));assert.equal(r.status,200);assert.equal(r.body.summary.removed,1);assert.deepEqual(db.state().matches,[kept]);}));
test('INJ unchanged selection does not write or duplicate records',()=>run(async db=>{await call(liga,q(db));const count=writes(db).length;const r=await call(liga,q(db));assert.equal(r.status,200);assert.equal(r.body.changed,false);assert.equal(writes(db).length,count);assert.equal(db.state().matches.length,2);}));
test('INJ replay with old version rejected rather than duplicated',()=>run(async db=>{const request=q(db);await call(liga,request);assert.equal((await call(liga,request)).status,409);assert.equal(db.state().matches.length,2);}));
for(const status of ['confirmed','pending','disputed'])test('INJ cannot overwrite '+status+' result, even one selected in a larger batch',()=>run(async db=>{db.state().matches=[match({status})];const before=JSON.stringify(db.state());const r=await call(liga,q(db));assert.equal(r.status,409);assert.equal(JSON.stringify(db.state()),before);assert.equal(writes(db).length,0);}));
for(const extra of [{np:true,sets:[]},{wo:true,sets:[],winner:'Alicia',retiroDe:'Beto'},{wo:true,sets:[[6,2]],winner:'Beto',retiroDe:'Alicia'}])test('INJ existing special result not rewritten '+JSON.stringify(extra),()=>run(async db=>{db.state().matches=[match({status:'confirmed',...extra})];const before=JSON.stringify(db.state());assert.equal((await call(liga,q(db))).status,409);assert.equal(JSON.stringify(db.state()),before);}));
test('INJ another player’s injury on same fixture is protected',()=>run(async db=>{await call(liga,q(db,{player:'Beto',opponents:['Alicia']}));const before=JSON.stringify(db.state());assert.equal((await call(liga,q(db,{opponents:['Beto']}))).status,409);assert.equal(JSON.stringify(db.state()),before);}));
test('INJ finished cycle can record unplayed historical absence in open league',()=>run(async db=>{db.state().cycles[0].status='finished';db.state().activeN=2;assert.equal((await call(liga,q(db))).status,200);}));
test('INJ locked/uncreated cycle rejected',()=>run(async db=>{assert.equal((await call(liga,q(db,{cycle:2}))).status,400);assert.equal(writes(db).length,0);}));
test('INJ finished league remains read-only',()=>run(async db=>{db.tables.liga_index[0].estado='finalizada';assert.equal((await call(liga,q(db))).status,403);assert.equal(writes(db).length,0);}));
test('INJ no group allows flag only with null cycle',()=>run(async db=>{db.state().cycles[0].groups[0].players=db.state().cycles[0].groups[0].players.filter(n=>n!=='Alicia');assert.equal((await call(liga,q(db,{cycle:null,opponents:[]}))).status,200);assert.equal(db.state().users.Alicia.injured,true);}));
for(const extra of [{player:'admin'},{player:'Nobody'},{injured:'true'},{opponents:['Alicia']},{opponents:['Beto','Beto']},{opponents:['Nobody']},{cycle:null},{cycle:'1'},{expectedVersion:-1},{state:{}},{diagnosis:'Do not store medical details'}])test('INJ invalid input fails without writes '+JSON.stringify(extra),()=>run(async db=>{const r=await call(liga,q(db,extra));assert.ok([400,409].includes(r.status),JSON.stringify(r));assert.equal(writes(db).length,0);}));
test('INJ opponent from different group denied',()=>run(async db=>{db.state().cycles[0].groups=[{players:['Alicia','Beto']},{players:['Ciro','Diego','Elena']}];assert.equal((await call(liga,q(db))).status,400);assert.equal(writes(db).length,0);}));
test('INJ duplicate group membership must be resolved first',()=>run(async db=>{db.state().cycles[0].groups.push({players:['Alicia','Elena']});assert.equal((await call(liga,q(db))).status,400);}));
test('INJ foreign league admin cannot mutate target',()=>{const s=fixture(),other=fixture();delete other.users.admin;return run(async db=>{const r=await call(liga,q(db,{ligaId:'other'}));assert.equal(r.status,403);assert.equal(writes(db).length,0);},[{id:'liga-actual',state:s},{id:'other',state:other}]);});
test('INJ failure commits neither flag nor absences',()=>run(async db=>{db.failWrites=1;const before=JSON.stringify(db.state());assert.equal((await call(liga,q(db))).status,503);assert.equal(JSON.stringify(db.state()),before);}));
test('INJ simultaneous writers cannot partially merge state',()=>run(async db=>{const first=q(db),second=q(db,{player:'Diego',opponents:['Elena']});const results=await Promise.all([call(liga,first),call(liga,second)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.ok([1,2].includes(db.state().matches.length));}));
test('INJ revocation before final write denies request',()=>run(async db=>{let n=0;const f=global.fetch;global.fetch=(url,opts)=>{if(String(url).includes('sohail_p2_session')&&++n===2)db.state().users.admin.inactive=true;return f(url,opts);};assert.equal((await call(liga,q(db))).status,401);assert.equal(writes(db).length,0);}));
test('INJ self-adjudication blocked in generic save too',()=>run(async db=>{db.state().users.Alicia.isAdmin=true;const state=structuredClone(db.state());state.matches=[{...match(),np:true,npReason:'injury',injurySide:0,sets:[],status:'confirmed'}];assert.equal((await call(save,req(db,'Alicia',{state,ligaId:'liga-actual'}))).status,403);}));
test('INJ cannot inject played score with injury tag',()=>{const s=fixture();assert.throws(()=>V.validateMatch(match({status:'confirmed',npReason:'injury',injurySide:0}),s,true));});
test('INJ generic old-client save preserves flag omitted by profile editor',()=>run(async db=>{await call(liga,q(db));const s=structuredClone(db.state());delete s.users.Alicia.injured;const r=await call(save,req(db,'admin',{state:s,ligaId:'liga-actual'}));assert.equal(r.status,200);assert.equal(db.state().users.Alicia.injured,true);}));
test('INJ player cannot dispute a non-played injury',()=>run(async db=>{await call(liga,q(db));const s=structuredClone(db.state());s.matches[0].status='disputed';assert.equal((await call(save,req(db,'Alicia',{state:s,ligaId:'liga-actual'}))).status,403);}));
test('INJ does not consume rating window or change any computed player level',()=>run(async db=>{
 db.state().matches=[match({id:77,status:'confirmed',aName:'Diego',bName:'Elena'})];
 const rating=()=>call(liga,req(db,'admin',{}, {operacion:'rating'}));const before=(await rating()).body;
 assert.equal((await call(liga,q(db))).status,200);const after=(await rating()).body;
 assert.equal(after.matchCount,before.matchCount);assert.equal(after.window,50);assert.deepEqual(after.info,before.info);
}));
test('INJ standings: both get zero game/match points, no victories or losses',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../public/core-estado.js'),'utf8');const start=source.indexOf('function computeStats('),end=source.indexOf('\nfunction ',start+1);
 const state=fixture(),session={u:'admin',r:'admin'},p=I.plan(state,session,B(state));const c=vm.createContext({cycles:state.cycles,matches:p.next.matches});vm.runInContext(source.slice(start,end),c);
 const stats=vm.runInContext('computeStats(1,1)',c);for(const s of stats){assert.equal(s.pts,0);assert.equal(s.g,0);assert.equal(s.p,0);assert.equal(s.sg,0);assert.equal(s.gw,0);}assert.equal(stats.find(s=>s.name==='Alicia').nj,2);
});
for(const section of ['horarios','reservas','cancelaciones'])test('RULES admin saves independent '+section+' document without changing legacy content',()=>run(async db=>{const s=structuredClone(db.state()),before=s.REGLAMENTO;s.REGLAMENTO_SECCIONES={[section]:'<p>Text</p>'};assert.equal((await call(save,req(db,'admin',{state:s,ligaId:'liga-actual'}))).status,200);assert.equal(db.state().REGLAMENTO,before);assert.equal(db.state().REGLAMENTO_SECCIONES[section],'<p>Text</p>');}));
test('RULES old-client omission retains published sections',()=>run(async db=>{db.state().REGLAMENTO_SECCIONES={reservas:'<p>Keep me</p>'};const s=structuredClone(db.state());delete s.REGLAMENTO_SECCIONES;assert.equal((await call(save,req(db,'admin',{state:s,ligaId:'liga-actual'}))).status,200);assert.equal(db.state().REGLAMENTO_SECCIONES.reservas,'<p>Keep me</p>');}));
test('RULES players cannot change sections',()=>run(async db=>{const s=structuredClone(db.state());s.REGLAMENTO_SECCIONES={horarios:'Bad'};assert.equal((await call(save,req(db,'Alicia',{state:s,ligaId:'liga-actual'}))).status,403);}));
for(const v of [null,[],{normativa:'wrong key'},{horarios:1},{horarios:'x'.repeat(2*1024*1024+1)}])test('RULES rejects invalid shape '+(typeof v),()=>assert.throws(()=>V.validateRuleSections(v)));
test('RULES public archived projection includes sections, not access credentials',()=>{const s=fixture();s.REGLAMENTO_SECCIONES={cancelaciones:'<p>Rules</p>'};s.users.Alicia.injured=true;const p=lib.filterPublicState(s);assert.deepEqual(p.REGLAMENTO_SECCIONES,s.REGLAMENTO_SECCIONES);assert.equal(p.users.Alicia.pass,undefined);assert.equal(p.users.Alicia.injured,undefined);});
test('RULES full backup restore inspection retains sections and injury metadata',()=>{
 const s=I.plan(fixture(),{u:'admin',r:'admin'},B(fixture())).next;s.REGLAMENTO_SECCIONES={horarios:'<p>Hours</p>'};const before=JSON.stringify(s);require('../api/_restore').inspectArchive(s);assert.equal(JSON.stringify(s),before);
});
test('INJ cross-league history projection retains absence reason without medical data',()=>{
 const s=I.plan(fixture(),{u:'admin',r:'admin'},B(fixture())).next;
 const H=require('../public/history-leagues');const r=H.project(s,{id:'liga-actual',nombre:'Test'},{name:'Alicia',id:'profile-0'},{current:true});
 assert.equal(r.records.length,2);assert.ok(r.records.every(m=>m.npReason==='injury'&&m.injurySide===0&&m.np===true));assert.ok(!JSON.stringify(r).includes('pass_hash'));
});
test('INJ backup rejects fake injury with played sets or winner',()=>{
 const s=I.plan(fixture(),{u:'admin',r:'admin'},B(fixture())).next;s.matches[0].winner='Beto';assert.throws(()=>require('../api/_restore').inspectArchive(s));
});
test('INJ unchanged false flag returns exactly the stored state without a fabricated field',()=>run(async db=>{
 const before=structuredClone(db.state());const r=await call(liga,q(db,{cycle:null,injured:false,opponents:[]}));assert.equal(r.status,200);assert.equal(r.body.changed,false);assert.equal(writes(db).length,0);assert.deepEqual(db.state(),before);assert.equal(Object.hasOwn(r.body.state.users.Alicia,'injured'),false);assert.equal(r.body.version,before._v);
}));
test('INJ generic result editor cannot replace a recorded injury with a win',()=>run(async db=>{
 await call(liga,q(db,{opponents:['Beto']}));const s=structuredClone(db.state());const id=s.matches[0].id;s.matches=[match({id,status:'confirmed'})];const r=await call(save,req(db,'admin',{state:s,ligaId:'liga-actual'}));assert.equal(r.status,403);assert.equal(db.state().matches[0].npReason,'injury');
}));
test('INJ generic administrator save cannot relabel a played result as injury',()=>run(async db=>{
 db.state().matches=[match({id:40,status:'confirmed'})];const s=structuredClone(db.state());s.matches[0]={...s.matches[0],np:true,npReason:'injury',injurySide:0,sets:[]};const r=await call(save,req(db,'admin',{state:s,ligaId:'liga-actual'}));assert.equal(r.status,403);assert.equal(db.state().matches[0].npReason,undefined);
}));
for(const lang of ['es','en'])test('INJ league report does not count absences as played and names the reason '+lang,()=>{
 const s=I.plan(fixture(),{u:'admin',r:'admin'},B(fixture())).next;s.matches.push(match({id:10,status:'confirmed',aName:'Diego',bName:'Elena'}));
 const source=fs.readFileSync(path.join(__dirname,'../public/login-auth-p2.js'),'utf8'),start=source.indexOf('function exportarLigaExcel(){'),end=source.indexOf('\n// Renombrar una passkey',start);
 const sheets={},XLSX={utils:{book_new:()=>({}),aoa_to_sheet:a=>a,book_append_sheet:(w,s,n)=>{sheets[n]=s;}},writeFile:()=>{}};
 const ctx=vm.createContext({XLSX,USERS:s.users,matches:s.matches,cycles:s.cycles,playoff:{},CLUBS:[],LANG:lang,LEAGUE_NAME:'Synthetic league',window:{},toast:()=>{},t:k=>k,findPlayer:()=>null});vm.runInContext(source.slice(start,end)+'\nexportarLigaExcel();',ctx);
 const rows=sheets.export_sheet_jugadores;for(const name of ['Alicia','Beto','Ciro']){const row=rows.find(r=>r[0]===name);assert.equal(row[4],0);assert.equal(row[5],0);assert.equal(row[6],0);assert.equal(row[8],0);assert.equal(row[9],0);}
 const injuries=sheets.export_sheet_partidos.slice(1).filter(r=>r[3]==='Alicia');assert.equal(injuries.length,2);for(const r of injuries){assert.equal(r[5],'');assert.equal(r[6],'');assert.equal(r[7],lang==='en'?'Injury · not played · no points':'Lesión · no jugado · sin puntos');}
});
test('RULES and 491 public modules receive their exact cache version without duplicate loading',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');for(const name of ['core-estado.js','persistencia.js','reglamento.js','shell-render.js','ui-modern.js','ui-modern.css','admin-workspace.js','jugadores-perfiles.js','resultados-y-grupos.js','admin-ciclos-config.js','login-auth-p2.js','history-leagues.js','match-history.js']){
  const tag=['ui-modern.css','jugadores-perfiles.js','resultados-y-grupos.js'].includes(name)?'sohail-v491-passwords-injury-access':'sohail-v480-rules-injuries';
  assert.equal(s.split(name+'?v='+tag).length-1,1,name);
  assert.equal(s.split(name+'?v=').length-1,1,name+' loaded once');
 }
 assert.ok(!fs.existsSync(path.join(__dirname,'../api/injuries.js')),'Reuse an existing Function; no new public function deployment.');
});

test('INJ backup rejects a non-boolean current injury flag',()=>{const s=fixture();s.users.Alicia.injured='diagnosis';assert.throws(()=>require('../api/_restore').inspectArchive(s));});
