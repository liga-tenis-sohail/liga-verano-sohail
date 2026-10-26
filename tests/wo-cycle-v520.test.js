'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Score=require('../public/score-rules'),Close=require('../public/cycle-close'),V=require('../api/_validation');
const M=require('./support/mock-db.cjs'),save=require('../api/save');
const clone=structuredClone;
function wo(extra={}){return M.match({status:'confirmed',wo:true,sets:[],winner:'Alicia',retiroDe:'Beto',woPolicy:{loserPoints:false,loserPlayed:false},...extra});}
function state(){const s=M.fixture();s.cycles[0].groups=[{players:['Alicia','Beto','Ciro']},{players:['Diego']},{players:['Elena']}];s.DESTINO={1:['G1','G2','G3'],2:['G2'],3:['G3']};s.matches=[wo(),wo({id:2,bName:'Ciro',retiroDe:'Ciro'})];return s;}
function pick(p){return Close.decision(p,p.ties.flatMap(t=>t.players.map((r,i)=>({group:r.group,name:r.name,destination:t.slots[t.slots.length-1-i]}))));}
function closing(s){const p=Close.plan(s),d=pick(p),i=clone(s);i.cycles[0].status='finished';if(p.to){i.cycles[0].zeroPointDecision=d;i.cycles[1].groups=Close.nextGroups(p,d);i.cycles[1].status='active';i.activeN=p.to;}return i;}
async function post(s,actor,change,options={}){const db=M.createDB([{id:'liga-actual',state:s}]),old=global.fetch;global.fetch=db.fetch;try{const incoming=clone(s);change(incoming,db);if(options.failWrites)db.failWrites=options.failWrites;const r=await M.call(save,M.req(db,actor,{state:incoming,ligaId:'liga-actual'}));return {db,r,incoming};}finally{global.fetch=old;}}
for(const loserPoints of [false,true])for(const loserPlayed of [false,true])for(const winner of ['Alicia','Beto']){
 test(`WO520 standings independent flags ${loserPoints}/${loserPlayed} winner ${winner}`,()=>{
  const s=M.fixture(),m=wo({winner,retiroDe:winner==='Alicia'?'Beto':'Alicia',woPolicy:{loserPoints,loserPlayed}}),before=clone(m);
  const stats=Score.standings(1,1,s.cycles,[m]),w=stats.find(x=>x.name===winner),l=stats.find(x=>x.name===m.retiroDe);
  assert.equal(w.pts,3);assert.equal(w.g,1);assert.equal(w.p,0);assert.equal(l.pts,loserPoints?1:0);assert.equal(l.g,0);assert.equal(l.p,loserPlayed?1:0);
  for(const x of stats)for(const k of ['sg','sp','gw','gl'])assert.equal(x[k],0);
  assert.deepEqual(m,before);
 });
 for(const actor of ['admin','superadmin'])test(`WO520 API ${actor} saves ${loserPoints}/${loserPlayed} winner ${winner}`,async()=>{
  const s=M.fixture(),{db,r}=await post(s,actor,i=>i.matches=[wo({winner,retiroDe:winner==='Alicia'?'Beto':'Alicia',woPolicy:{loserPoints,loserPlayed}})]);
  assert.equal(r.status,200,JSON.stringify(r.body));assert.deepEqual(db.state().matches[0].woPolicy,{loserPoints,loserPlayed});assert.equal(db.state()._v,s._v+1);
 });
}
test('WO520 old WO without policy retains original 3/1 points and G/P',()=>{const s=M.fixture(),m=wo();delete m.woPolicy;const st=Score.standings(1,1,s.cycles,[m]);assert.equal(st.find(x=>x.name==='Beto').pts,1);assert.equal(st.find(x=>x.name==='Beto').p,1);});
test('WO520 real-game retirement is unchanged',()=>{const s=M.fixture(),m=wo({sets:[[4,0]]});delete m.woPolicy;const st=Score.standings(1,1,s.cycles,[m]);assert.equal(st.find(x=>x.name==='Beto').p,1);assert.equal(st.find(x=>x.name==='Beto').pts,1);assert.equal(st.find(x=>x.name==='Alicia').gw,4);});
for(const status of ['pending','disputed'])test('WO520 unvalidated result has no scoring effect '+status,()=>{const s=M.fixture(),st=Score.standings(1,1,s.cycles,[wo({status})]);assert.ok(st.every(x=>x.pts===0&&x.g===0&&x.p===0));});
test('WO520 player can report only conservative default, not confirm it',async()=>{const s=M.fixture(),{db,r}=await post(s,'Alicia',i=>i.matches=[wo({status:'pending',locked:false})]);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(db.state().matches[0].status,'pending');});
for(const policy of [{loserPoints:true,loserPlayed:false},{loserPoints:false,loserPlayed:true},{loserPoints:true,loserPlayed:true}])test('WO520 player cannot choose absence credit '+JSON.stringify(policy),async()=>{const s=M.fixture(),{db,r}=await post(s,'Alicia',i=>i.matches=[wo({status:'pending',woPolicy:policy})]);assert.equal(r.status,403);assert.deepEqual(db.state(),s);});
test('WO520 player cannot confirm conservative WO',async()=>{const s=M.fixture(),{db,r}=await post(s,'Alicia',i=>i.matches=[wo()]);assert.equal(r.status,403);assert.deepEqual(db.state(),s);});
test('WO520 old client new WO receives conservative explicit policy from server',async()=>{const s=M.fixture(),{db,r}=await post(s,'Alicia',i=>{const m=wo({status:'pending'});delete m.woPolicy;i.matches=[m];});assert.equal(r.status,200);assert.deepEqual(db.state().matches[0].woPolicy,{loserPoints:false,loserPlayed:false});assert.deepEqual(r.body.woPolicies[0].policy,db.state().matches[0].woPolicy);});
test('WO520 unrelated save does not migrate historical WOs',async()=>{const s=M.fixture(),m=wo();delete m.woPolicy;s.matches=[m];const {db,r}=await post(s,'admin',i=>i.LEAGUE_NAME='Otro título');assert.equal(r.status,200);assert.deepEqual(db.state().matches,s.matches);});
test('WO520 admin edits policy on existing match without duplicating it',async()=>{const s=M.fixture();s.matches=[wo()];const {db,r}=await post(s,'admin',i=>i.matches[0].woPolicy={loserPoints:true,loserPlayed:false});assert.equal(r.status,200);assert.equal(db.state().matches.length,1);assert.equal(db.state().matches[0].id,1);assert.equal(Score.standings(1,1,s.cycles,db.state().matches).find(x=>x.name==='Beto').p,0);});
for(const bad of [null,[],true,0,{},'yes',{loserPoints:1,loserPlayed:true},{loserPoints:true},{loserPoints:true,loserPlayed:false,extra:true}])test('WO520 malformed policy rejected '+JSON.stringify(bad),()=>assert.throws(()=>V.validateMatch(wo({woPolicy:bad}),M.fixture(),true),e=>e.status===400));
for(const extra of [{wo:false,sets:[[6,1],[6,2]]},{sets:[[4,0]]},{np:true},{po:true,poNames:['Alicia','Beto'],which:'main',ti:0,ri:0,mi:0}])test('WO520 policy cannot modify other result kinds '+JSON.stringify(extra),()=>assert.throws(()=>V.validateMatch(wo(extra),M.fixture(),true),e=>e.status===400));

test('CLOSE520 exact zero ties use group Pts, not overall classification or rating',()=>{const s=state();s.AJUSTES_PUNTOS={1:{1:{Beto:99}}};const p=Close.plan(s);assert.equal(p.ties.length,1);assert.deepEqual(p.ties[0].players.map(x=>x.name),['Beto','Ciro']);assert.deepEqual(p.ties[0].slots,['G2','G3']);});
test('CLOSE520 admin may swap the zero players destinations, preserving quotas and nonzero players',()=>{const s=state(),p=Close.plan(s),groups=Close.nextGroups(p,pick(p));assert.deepEqual(groups.map(g=>g.players.slice().sort()),[['Alicia'],['Ciro','Diego'],['Beto','Elena']]);assert.equal(s.cycles[1].status,'locked');});
test('CLOSE520 0-point tie includes zero players with different played counts',()=>{const s=state();s.matches[0].woPolicy.loserPlayed=true;const p=Close.plan(s);assert.equal(p.ties[0].players.length,2);assert.equal(p.ties[0].players.find(r=>r.name==='Beto').played,1);});
test('CLOSE520 inactive players never occupy a reviewed or next-cycle place',()=>{const s=state();s.users.Ciro.inactive=true;const p=Close.plan(s);assert.equal(p.ties.length,0);assert.ok(!Close.nextGroups(p).flatMap(g=>g.players).includes('Ciro'));});
test('CLOSE520 identical destination slots still require explicit acknowledgement',()=>{const s=state();s.DESTINO[1]=['G1','G2','G2'];const p=Close.plan(s);assert.throws(()=>Close.nextGroups(p),e=>e.code==='ZERO_TIE_REQUIRED');assert.doesNotThrow(()=>Close.nextGroups(p,pick(p)));});
for(const actor of ['admin','superadmin'])test('CLOSE520 API persists audited decision and destinations atomically '+actor,async()=>{const s=state(),{db,r}=await post(s,actor,i=>Object.assign(i,closing(s)));assert.equal(r.status,200,JSON.stringify(r.body));const after=db.state();assert.equal(after.activeN,2);assert.equal(after.cycles[0].status,'finished');assert.equal(after.cycles[0].zeroPointDecision.decidedBy,actor);assert.ok(Date.parse(after.cycles[0].zeroPointDecision.decidedAt));assert.deepEqual(after.cycles[1].groups,closing(s).cycles[1].groups);assert.deepEqual(after.matches,s.matches);assert.equal(r.body.cycleDecisions[0].n,1);});
for(const [label,change,code] of [
 ['missing decision',i=>delete i.cycles[0].zeroPointDecision,'ZERO_TIE_REQUIRED'],
 ['unchecked review',i=>i.cycles[0].zeroPointDecision.accepted=false,'ZERO_TIE_REQUIRED'],
 ['stale version',i=>i.cycles[0].zeroPointDecision.sourceVersion--,'ZERO_TIE_REQUIRED'],
 ['incomplete choices',i=>i.cycles[0].zeroPointDecision.assignments.pop(),'ZERO_TIE_INVALID'],
 ['duplicate player',i=>i.cycles[0].zeroPointDecision.assignments[1]=clone(i.cycles[0].zeroPointDecision.assignments[0]),'ZERO_TIE_INVALID'],
 ['nonzero player',i=>i.cycles[0].zeroPointDecision.assignments[0].name='Alicia','ZERO_TIE_INVALID'],
 ['unconfigured destination',i=>i.cycles[0].zeroPointDecision.assignments[0].destination='G1','ZERO_TIE_CAPACITY'],
 ['too many in same destination',i=>i.cycles[0].zeroPointDecision.assignments.forEach(r=>r.destination='G2'),'ZERO_TIE_CAPACITY'],
 ['tampered next groups',i=>i.cycles[1].groups[0].players.push('Beto'),'CYCLE_DESTINATIONS_MISMATCH'],
 ['simultaneous match correction',i=>i.matches[0].woPolicy.loserPoints=true,'CYCLE_REVIEW_CHANGED'],
 ['simultaneous destination edit',i=>i.DESTINO[1][2]='G2','CYCLE_REVIEW_CHANGED'],
 ['skip close',i=>i.cycles[0].status='active','CYCLE_TRANSITION_INVALID'],
 ['skip a cycle',i=>i.activeN=3,'CYCLE_TRANSITION_INVALID']
])test('CLOSE520 API rejects '+label+' without writes',async()=>{const s=state(),{db,r}=await post(s,'admin',i=>{Object.assign(i,closing(s));change(i);});assert.equal(r.status,400,JSON.stringify(r.body));assert.equal(r.body.code,code);assert.deepEqual(db.state(),s);});
for(const status of ['pending','disputed'])test('CLOSE520 unvalidated match blocks closure '+status,async()=>{const s=state(),incoming=closing(s);s.matches[0].status=status;incoming.matches[0].status=status;const {db,r}=await post(s,'admin',i=>Object.assign(i,incoming));assert.equal(r.status,400);assert.equal(r.body.code,'CYCLE_PENDING_RESULTS');assert.deepEqual(db.state(),s);});
test('CLOSE520 player cannot submit or forge a cycle decision',async()=>{const s=state(),{db,r}=await post(s,'Beto',i=>Object.assign(i,closing(s)));assert.equal(r.status,403);assert.deepEqual(db.state(),s);});
test('CLOSE520 delegated player-admin cannot escalate existing structural privileges',async()=>{const s=state();s.users.Beto.isAdmin=true;const {db,r}=await post(s,'Beto',i=>Object.assign(i,closing(s)));assert.equal(r.status,403);assert.deepEqual(db.state(),s);});
test('CLOSE520 failed database write does not open next cycle or save decision',async()=>{const s=state(),{db,r}=await post(s,'admin',i=>Object.assign(i,closing(s)),{failWrites:1});assert.equal(r.status,503);assert.deepEqual(db.state(),s);});
test('CLOSE520 two concurrent admins cannot overwrite first accepted closure',async()=>{const s=state(),{db,r}=await post(s,'admin',(i,db)=>{Object.assign(i,closing(s));db.state()._v++;});assert.equal(r.status,409);assert.equal(db.state().activeN,1);assert.equal(db.state().cycles[1].status,'locked');});
test('CLOSE520 final cycle closes without artificial destination choice',async()=>{const s=state();s.cycles.length=1;const {db,r}=await post(s,'admin',i=>Object.assign(i,closing(s)));assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(db.state().cycles[0].status,'finished');assert.equal(db.state().activeN,1);assert.equal(db.state().cycles[0].zeroPointDecision,undefined);});
test('CLOSE520 no-zero-tie closure still follows configured destinations',async()=>{const s=state();s.matches[0].woPolicy.loserPoints=true;const p=Close.plan(s);assert.equal(p.ties.length,0);const {db,r}=await post(s,'admin',i=>Object.assign(i,closing(s)));assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(db.state().activeN,2);});
test('CLOSE520 server checks same algorithm used by browser',()=>{const src=fs.readFileSync('public/core-estado.js','utf8');const f=src.slice(src.indexOf('function computeStats('),src.indexOf('function findMatch('));const s=state(),c={SohailScore:Score,cycles:s.cycles,matches:s.matches};vm.createContext(c);vm.runInContext(f,c);assert.deepEqual(c.computeStats(1,1),Score.standings(1,1,s.cycles,s.matches));});
test('CLOSE520 shipped scripts include both closing modules once and load before bootstrap',()=>{const s=fs.readFileSync('public/index.html','utf8');for(const n of ['cycle-close.js','cycle-close-ui.js']){assert.equal(s.split(n+'?v=').length-1,1);assert.ok(s.indexOf(n+'?v=')<s.indexOf('bootstrap.js?v='));}const assets=JSON.parse(fs.readFileSync('scripts/public-assets.json')).assets;assert.ok(assets.includes('cycle-close.js'));assert.ok(assets.includes('cycle-close-ui.js'));});
module.exports={state,closing};

// Cross-cutting regression: archive, historical projection, export, renaming.
for(const loserPoints of [false,true])for(const loserPlayed of [false,true]){
 test(`WO520 archive and historical projection preserve ${loserPoints}/${loserPlayed}`,()=>{
  const s=M.fixture();s.matches=[wo({woPolicy:{loserPoints,loserPlayed}})];
  const roundtrip=JSON.parse(JSON.stringify(s));require('../api/_restore').inspectArchive(roundtrip);
  assert.deepEqual(roundtrip.matches[0].woPolicy,{loserPoints,loserPlayed});
  const history=require('../public/history-leagues').project(roundtrip,{id:'liga-actual',nombre:'Prueba'},{name:'Alicia',id:s.users.Alicia.jugadorId},{current:true});
  assert.deepEqual(history.records[0].woPolicy,{loserPoints,loserPlayed});history.records[0].woPolicy.loserPoints=!loserPoints;
  assert.equal(roundtrip.matches[0].woPolicy.loserPoints,loserPoints,'projection is a copy, never a shared mutation');
 });
 test(`WO520 league Excel export agrees with standings ${loserPoints}/${loserPlayed}`,()=>{
  const s=M.fixture();s.matches=[wo({woPolicy:{loserPoints,loserPlayed}})];
  const sheets={},XLSX={utils:{book_new:()=>({}),aoa_to_sheet:a=>a,book_append_sheet:(_,s,n)=>sheets[n]=s},writeFile:()=>{}};
  const source=fs.readFileSync('public/login-auth-p2.js','utf8');const start=source.indexOf('function exportarLigaExcel(){'),end=source.indexOf('\n// Renombrar una passkey',start);
  const ctx={XLSX,SohailScore:Score,USERS:s.users,matches:s.matches,cycles:s.cycles,playoff:{},CLUBS:s.CLUBS,LANG:'es',LEAGUE_NAME:'Synthetic',window:{},toast:()=>{},t:k=>k,findPlayer:()=>null};vm.createContext(ctx);vm.runInContext(source.slice(start,end)+'\nexportarLigaExcel();',ctx);
  const winner=sheets.export_sheet_jugadores.find(r=>r[0]==='Alicia'),absent=sheets.export_sheet_jugadores.find(r=>r[0]==='Beto');
  assert.equal(winner[4],1);assert.equal(winner[5],1);assert.equal(absent[4],Number(loserPlayed));assert.equal(absent[6],Number(loserPlayed));
  const m=sheets.export_sheet_partidos[1];assert.equal(m[5],'W.O.');assert.equal(m[6],'Alicia');assert.equal(m[8],'Sohail');assert.equal(m[9],'Beto');assert.equal(m[10],Number(loserPoints));assert.equal(m[11],Number(loserPlayed));
 });
}
for(const policy of [null,{},'yes',{loserPoints:true,loserPlayed:1},{loserPoints:false,loserPlayed:true,extra:true}])test('WO520 backup rejects invalid policy '+JSON.stringify(policy),()=>{
 const s=M.fixture();s.matches=[wo({woPolicy:policy})];assert.throws(()=>require('../api/_restore').inspectArchive(s),e=>e.code==='INVALID_BACKUP');
});
test('CLOSE520 renaming a player keeps decided destinations and audit references',()=>{
 const s=closing(state());s.LOG=[{detail:{zeroPointAssignments:clone(s.cycles[0].zeroPointDecision.assignments)}}];
 const source=fs.readFileSync('public/jugadores-perfiles.js','utf8'),start=source.indexOf('function renamePlayerEverywhere('),end=source.indexOf('\n// Separa un nombre',start);
 const ctx={USERS:s.users,cycles:s.cycles,matches:s.matches,ALLNAMES:s.ALLNAMES,RATING_SEEDS:{},RATING_OVERRIDES:{},AJUSTES_PUNTOS:{},JOIN_REQUESTS:[],LOG:s.LOG,playoff:s.playoff};vm.createContext(ctx);vm.runInContext(source.slice(start,end)+'\nrenamePlayerEverywhere("Beto","Roberto");',ctx);
 assert.equal(ctx.cycles[0].zeroPointDecision.assignments.find(r=>r.destination==='G3').name,'Roberto');assert.equal(ctx.LOG[0].detail.zeroPointAssignments.find(r=>r.destination==='G3').name,'Roberto');
 assert.ok(ctx.cycles[1].groups[2].players.includes('Roberto'));assert.equal(ctx.matches[0].retiroDe,'Roberto');assert.deepEqual(ctx.matches[0].woPolicy,{loserPoints:false,loserPlayed:false});
});
test('CLOSE520 rejects a future cycle activated without closing the current cycle',async()=>{
 const s=state();s.cycles.push({n:3,status:'locked',groups:null});const {db,r}=await post(s,'admin',i=>i.cycles[2].status='active');assert.equal(r.status,400);assert.equal(r.body.code,'CYCLE_TRANSITION_INVALID');assert.deepEqual(db.state(),s);
});
test('CLOSE520 rejects reactivating an excluded player during the same close request',async()=>{
 const s=state();s.users.Ciro.inactive=true;const {db,r}=await post(s,'admin',i=>{Object.assign(i,closing(s));i.users.Ciro.inactive=false;});assert.equal(r.status,400);assert.equal(r.body.code,'CYCLE_REVIEW_CHANGED');assert.deepEqual(db.state(),s);
});
test('CLOSE520 complete backup keeps the exact saved zero-point decision',()=>{
 const s=closing(state()),copy=JSON.parse(JSON.stringify(s));require('../api/_restore').inspectArchive(copy);assert.deepEqual(copy.cycles[0].zeroPointDecision,s.cycles[0].zeroPointDecision);assert.deepEqual(copy.cycles[1].groups,s.cycles[1].groups);
});
