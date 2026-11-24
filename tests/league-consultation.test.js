'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createDB,fixture,match,call,protectedTables}=require('./support/mock-db.cjs');
const P=require('../api/_public-results'),Score=require('../public/score-rules'),Client=require('../public/league-consultation'),users=require('../api/users');
const entry={id:'liga-actual',nombre:'Liga visible',estado:'activa',orden:1};
const snapshot=(s=fixture(),e=entry)=>P.project(s,e,0);
function resultFixture(){const s=fixture();s.matches=[match({status:'confirmed',reporter:'PRIVATE_REPORTER',vBy:'PRIVATE_VALIDATOR',comment:'PRIVATE_COMMENT'})];return s;}
function prohibited(value){if(!value||typeof value!=='object')return;for(const [k,v]of Object.entries(value)){assert.ok(!['state','users','pass','email','tel','role','token','jugadorId','identityRef','_credentialId','LOG','JOIN_REQUESTS','reporter','vBy','RATING_SEEDS','passwordTemporary','zeroPointDecision','acceptedBy','audit'].includes(k),'private key '+k);prohibited(v);}}
test('CONSULT projection is an allowlist, never a serialized state',()=>{
 const s=resultFixture();s.LOG=[{secret:'PRIVATE_LOG'}];s.JOIN_REQUESTS=[{secret:'PRIVATE_JOIN'}];s.LOGIN_HEADER={links:[{url:'PRIVATE_LINK'}]};s.RATING_SEEDS={Alicia:999};
 Object.assign(s.users.Alicia,{tel:'PRIVATE_PHONE',email:'PRIVATE_EMAIL',pass:'PRIVATE_HASH',identityRef:'PRIVATE_ID',_credentialId:'PRIVATE_CREDENTIAL'});
 const before=JSON.stringify(s),out=snapshot(s);prohibited(out);assert.ok(!JSON.stringify(out).includes('PRIVATE_'));assert.equal(JSON.stringify(s),before);assert.equal(out.readOnly,true);assert.equal(out.schema,1);assert.equal(out.cycles[0].groups[0].results.length,1);
});
test('CONSULT private nested extras cannot leak through sets or cycles',()=>{const s=resultFixture();s.matches[0].sets[0].secret='PRIVATE_SET';s.cycles[0].groups[0].secret='PRIVATE_GROUP';s.cycles[0].acceptedBy='PRIVATE_ADMIN';assert.ok(!JSON.stringify(snapshot(s)).includes('PRIVATE_'));});
for(const status of ['pending','disputed','rejected','draft'])test('CONSULT excludes '+status+' results',()=>{const s=fixture();s.matches=[match({status})];const o=snapshot(s);assert.equal(o.cycles[0].groups[0].results.length,0);assert.equal(o.cycles[0].groups[0].rows[0].points,0);});
test('CONSULT hides future locked cycles and their fixtures',()=>{const s=resultFixture();s.cycles[1].groups=[{players:['Alicia','Beto']}];s.matches.push(match({id:2,cycle:2,status:'confirmed'}));const o=snapshot(s);assert.equal(o.cycles.length,1);assert.equal(o.standings[0].cycles.length,1);assert.equal(o.cycles[0].groups[0].results.length,1);});
for(const loserPoints of [false,true])for(const loserPlayed of [false,true])test(`CONSULT W.O. follows shared policy points=${loserPoints} played=${loserPlayed}`,()=>{
 const s=fixture();s.matches=[match({status:'confirmed',sets:[],wo:true,winner:'Alicia',retiroDe:'Beto',woPolicy:{loserPoints,loserPlayed}})];const o=snapshot(s),rows=o.cycles[0].groups[0].rows,w=rows.find(r=>r.name==='Alicia'),l=rows.find(r=>r.name==='Beto');assert.equal(w.points,3);assert.equal(w.played,1);assert.equal(l.points,Number(loserPoints));assert.equal(l.played,Number(loserPlayed));assert.equal(o.cycles[0].groups[0].results[0].kind,'walkover');
});
test('CONSULT historical W.O. keeps prior one point and one played for absent player',()=>{const s=fixture();s.matches=[match({status:'confirmed',sets:[],wo:true,winner:'Alicia',retiroDe:'Beto'})];const b=snapshot(s).cycles[0].groups[0].rows.find(r=>r.name==='Beto');assert.equal(b.points,1);assert.equal(b.played,1);});
test('CONSULT retirement uses declared winner, not incomplete set lead',()=>{const s=fixture();s.matches=[match({status:'confirmed',sets:[[6,2],[4,1]],wo:true,winner:'Beto',retiroDe:'Alicia'})];const o=snapshot(s);assert.equal(o.cycles[0].groups[0].results[0].winner,'Beto');assert.equal(o.cycles[0].groups[0].rows[0].name,'Beto');});
test('CONSULT absence reveals neither medical reason nor identity metadata',()=>{const s=fixture();s.matches=[match({status:'confirmed',sets:[],np:true,npReason:'injury',injurySide:0})];const o=snapshot(s);assert.equal(o.cycles[0].groups[0].results[0].kind,'not-played');assert.ok(!JSON.stringify(o).includes('injury'));assert.equal(o.cycles[0].groups[0].rows[0].played,0);});
test('CONSULT scores, positions and manual points agree with authenticated general calculation',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../public/core-estado.js'),'utf8');
 const extract=name=>{const a=source.indexOf('function '+name+'('),b=source.indexOf('\nfunction ',a+1);assert.ok(a>=0&&b>a);return source.slice(a,b);};
 for(let k=0;k<30;k++){
  const s=fixture();s.cycles[0].status='finished';s.cycles[1]={n:2,status:'active',groups:[{players:['Beto','Alicia','Ciro']},{players:['Diego','Elena']}]};s.activeN=2;s.PUNTOS[2]=[3,2];
  s.matches=[match({id:1,status:'confirmed',sets:[[6,2],[6,1]]}),match({id:2,cycle:2,status:'confirmed',aName:k%2?'Ciro':'Alicia',bName:'Beto',sets:[[6,4],[4,6],[1,0]]})];
  s.AJUSTES_PUNTOS={1:{1:{Beto:k-12},0:{Elena:k%4}},2:{2:{Diego:k%3}}};if(k%3===0)s.users.Beto.inactive=true;
  const c=vm.createContext({cycles:s.cycles,activeN:s.activeN,USERS:s.users,PUNTOS:s.PUNTOS,AJUSTES_PUNTOS:s.AJUSTES_PUNTOS,poDrawDeJugador:()=>null,computeStats:(n,g)=>Score.standings(n,g,s.cycles,s.matches),console});
  vm.runInContext(extract('findLoc')+'\n'+extract('ptsForPos')+'\n'+extract('computeGeneral'),c);
  const expected=JSON.parse(JSON.stringify(vm.runInContext('computeGeneral()',c))),actual=snapshot(s).standings;
  assert.deepEqual(actual.map(r=>[r.name,r.total]),expected.map(r=>[r.name,r.total]));
 }
});
test('CONSULT open cycle always displays configured destinations at zero points',()=>{const s=fixture();s.DESTINO[1]=['G1','G1','G2','G2','G3'];const d=snapshot(s).cycles[0].groups[0].rows.map(r=>r.destination);assert.deepEqual(d,[1,1,2,2,3]);});
test('CONSULT closed cycle uses confirmed destinations without exposing reviewer',()=>{const s=fixture();s.cycles[0].status='finished';s.cycles[0].zeroPointDecision={accepted:true,acceptedBy:'PRIVATE_ADMIN',assignments:[{name:'Beto',group:1,destination:'G3'}]};const o=snapshot(s);assert.equal(o.cycles[0].groups[0].rows.find(r=>r.name==='Beto').destination,3);assert.ok(!JSON.stringify(o).includes('PRIVATE_ADMIN'));prohibited(o);});
test('CONSULT unpublished destination decision is ignored',()=>{const s=fixture();s.cycles[0].zeroPointDecision={accepted:true,assignments:[{name:'Beto',group:1,destination:'G3'}]};assert.equal(snapshot(s).cycles[0].groups[0].rows.find(r=>r.name==='Beto').destination,1);});
test('CONSULT only started playoff results are public',()=>{const s=fixture();s.matches=[match({po:true,poNames:['Alicia','Beto'],status:'confirmed'})];assert.equal(snapshot(s).playoffResults.length,0);s.playoff.started=true;assert.equal(snapshot(s).playoffResults.length,1);});
test('CONSULT names are preserved as data, even HTML-looking input',()=>{const s=fixture(),name='<img src=x onerror=alert(1)>';s.cycles[0].groups[0].players.push(name);s.users[name]={role:'player'};assert.equal(snapshot(s).standings.find(r=>r.name===name).name,name);const js=fs.readFileSync(path.join(__dirname,'../public/league-consultation.js'),'utf8');assert.ok(!js.includes('innerHTML'));assert.ok(!/eval\s*\(|new Function/.test(js));});
test('CONSULT empty league returns readable empty lists',()=>{const s=fixture();s.cycles=[];s.activeN=1;const o=snapshot(s);assert.equal(o.activeCycle,null);assert.deepEqual(o.cycles,[]);assert.deepEqual(o.standings,[]);});
test('CONSULT catalogue contains only minimal public league metadata',()=>{const d=P.directory([{...entry,email:'PRIVATE'}, {...entry,id:'old',estado:'finalizada',orden:4},{...entry,id:'draft',estado:'borrador'}, {...entry,id:'hidden',estado:'oculta'}]);assert.deepEqual(d,[{id:'liga-actual',name:'Liga visible',status:'activa'},{id:'old',name:'Liga visible',status:'finalizada'}]);});
for(const state of ['oculta','borrador','eliminada',''])test('CONSULT denies league state '+JSON.stringify(state),()=>assert.throws(()=>snapshot(fixture(),{...entry,estado:state}),e=>e.code==='LEAGUE_NOT_PUBLIC'));
let counter=0;
async function api(fn,alter=()=>{}){const id='public-test-'+(++counter),db=createDB([{id,state:resultFixture()}]);alter(db,id);const old=global.fetch;global.fetch=db.fetch;try{await fn(db,id);}finally{global.fetch=old;}}
const request=(query,method='GET')=>({method,query,headers:{host:'sohail.test'},socket:{remoteAddress:'192.0.2.18'}});
test('CONSULT anonymous GET returns sporting data without session, credentials or writes',()=>api(async(db,id)=>{const before=JSON.stringify(protectedTables(db));const r=await call(users,request({consulta:'resultados',liga:id}));assert.equal(r.status,200);assert.equal(r.body.readOnly,true);prohibited(r.body);assert.equal(JSON.stringify(protectedTables(db)),before);assert.equal(r.headers['Set-Cookie'],undefined);assert.equal(r.headers['Cache-Control'],'no-store');assert.equal(r.headers['X-Robots-Tag'],'noindex, nofollow');}));
for(const method of ['POST','PUT','PATCH','DELETE'])test('CONSULT cannot write via '+method,()=>api(async(db,id)=>{const r=await call(users,request({consulta:'resultados',liga:id},method));assert.equal(r.status,405);assert.equal(db.state(id).matches.length,1);}));
for(const q of [{consulta:'other'},{consulta:'resultados'},{consulta:'resultados',liga:'../other'},{consulta:'ligas',liga:'liga-actual'},{consulta:'resultados',liga:'liga-actual',admin:'true'},{consulta:'resultados',liga:['a','b']},{consulta:'ligas',state:'all'}])test('CONSULT invalid query cannot fall back to a default '+JSON.stringify(q),()=>api(async()=>{assert.equal((await call(users,request(q))).status,400);}));
test('CONSULT missing and hidden league is denied before reading its state',()=>api(async(db,id)=>{db.tables.liga_index[0].estado='borrador';const r=await call(users,request({consulta:'resultados',liga:id}));assert.equal(r.status,404);assert.ok(!db.requests.some(r=>r.name==='liga_state'));}));
test('CONSULT invalid publication is rechecked even with a warm cache',()=>api(async(db,id)=>{assert.equal((await call(users,request({consulta:'resultados',liga:id}))).status,200);db.tables.liga_index[0].estado='oculta';assert.equal((await call(users,request({consulta:'resultados',liga:id}))).status,404);}));
test('CONSULT repeated successful reads share cached sporting projection',()=>api(async(db,id)=>{await call(users,request({consulta:'resultados',liga:id}));const count=db.requests.filter(r=>r.name==='liga_state').length;await call(users,request({consulta:'resultados',liga:id}));assert.equal(db.requests.filter(r=>r.name==='liga_state').length,count);}));
test('CONSULT two leagues never share cached results',async()=>{const a=fixture(),b=fixture();a.matches=[match({status:'confirmed'})];b.matches=[];const db=createDB([{id:'pub-cache-a',state:a},{id:'pub-cache-b',state:b}]),old=global.fetch;global.fetch=db.fetch;try{const ra=await call(users,request({consulta:'resultados',liga:'pub-cache-a'})),rb=await call(users,request({consulta:'resultados',liga:'pub-cache-b'}));assert.equal(ra.body.cycles[0].groups[0].results.length,1);assert.equal(rb.body.cycles[0].groups[0].results.length,0);}finally{global.fetch=old;}});
test('CONSULT origin and request limits remain enforced by existing API wrapper',()=>api(async(db,id)=>{const r=await call(users,{...request({consulta:'resultados',liga:id}),headers:{host:'sohail.test',origin:'https://other.invalid'}});assert.equal(r.status,403);assert.equal(r.body.code,'REQUEST_ORIGIN');}));
test('CONSULT generic save still rejects anonymous viewers',()=>api(async(db,id)=>{const save=require('../api/save'),before=JSON.stringify(db.state(id));const r=await call(save,{...request({},'POST'),body:{ligaId:id,state:structuredClone(db.state(id))}});assert.equal(r.status,401);assert.equal(JSON.stringify(db.state(id)),before);}));
test('CONSULT no new publicly callable Vercel function is added',()=>{const files=fs.readdirSync(path.join(__dirname,'../api')).filter(n=>n.endsWith('.js')&&!n.startsWith('_'));assert.ok(files.length<=12);assert.ok(!files.includes('consulta.js'));});
test('CONSULT client only uses GET without credentials',async()=>{const requests=[],reader=Client.createReader(async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({readOnly:true,leagues:[]})};});await reader.read('ligas');assert.equal(requests[0].options.method,'GET');assert.equal(requests[0].options.credentials,'omit');assert.equal(requests[0].options.headers.Authorization,undefined);assert.equal(requests[0].url,'/api/users?consulta=ligas');});
test('CONSULT client checks the response belongs to the requested league',async()=>{const r=Client.createReader(async()=>({ok:true,json:async()=>({schema:1,readOnly:true,league:{id:'other'},cycles:[],standings:[],playoffResults:[]})}));await assert.rejects(r.read('resultados','liga-actual'),/INVALID_PUBLIC_RESPONSE/);});
test('CONSULT invalid league id creates no client request',async()=>{let calls=0;const r=Client.createReader(async()=>{calls++;});await assert.rejects(r.read('resultados','../../other'));assert.equal(calls,0);});
test('CONSULT retry-after prevents a new request until the server pause expires',async()=>{let at=1000,calls=0;const r=Client.createReader(async()=>{calls++;if(calls===1)return {status:429,ok:false,headers:new Headers({'Retry-After':'49'}),json:async()=>({code:'REQUEST_RATE_LIMIT',error:'Pause'})};return {ok:true,json:async()=>({readOnly:true,leagues:[]})};},()=>at);await assert.rejects(r.read('ligas'),e=>e.retryAfter===49);await assert.rejects(r.read('ligas'));assert.equal(calls,1);at+=49000;await r.read('ligas');assert.equal(calls,2);});
test('CONSULT scoreboard reverses score to the row player without changing results',()=>{const r={kind:'played',a:'A',b:'B',sets:[[6,2],[7,6]]};assert.equal(Client.score(r,'A'),'6–2 / 7–6');assert.equal(Client.score(r,'B'),'2–6 / 6–7');assert.deepEqual(r.sets,[[6,2],[7,6]]);});
test('CONSULT login has no search field, native dropdown is retained',()=>{const s=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');assert.match(s,/<select id="login-user"/);assert.doesNotMatch(s,/id="login-user-search"/);assert.match(s,/id="login-consult-league"/);assert.ok(s.indexOf('league-consultation.js')<s.indexOf('excel-loader.js'));});
test('CONSULT public modules are loaded once and present in build allowlist',()=>{const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8'),manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../scripts/public-assets.json')));for(const file of ['league-consultation.js','league-consultation.css']){assert.equal(html.split(file+'?v=').length-1,1);assert.equal(manifest.assets.filter(f=>f===file).length,1);}});
test('CONSULT 85 percent zoom is scoped to tables and can switch to 100',()=>{const css=fs.readFileSync(path.join(__dirname,'../public/league-consultation.css'),'utf8');assert.match(css,/--sohail-table-zoom:\.85/);assert.match(css,/data-sohail-table-size="100"/);assert.ok(!/(?:body|html)\s*\{[^}]*zoom\s*:/.test(css));assert.match(css,/width:1%;min-width:0;max-width:none/);assert.match(css,/--sohail-name-max:min\(220px,46vw\)/);assert.match(css,/@media print/);});

// Branding is public presentation only. No club IDs, links or arbitrary CSS.
test('CONSULT palette contains only validated colors of the selected league and visible clubs',()=>{
 const s=resultFixture();s.LEAGUE_COLOR_PRI='#234567';s.LEAGUE_COLOR_ACC='#ABCDEF';s.LEAGUE_COLOR_HL='#123456';
 s.LEAGUE_TEXT_COLORS={light:'#112233',dark:'#fff000',header:'#ffffff',email:'PRIVATE_EMAIL'};
 s.matches[0].club='Sohail';s.CLUBS=[{name:'Sohail',bg:'#21ABC0',id:'PRIVATE_ID',url:'PRIVATE_LINK'}, {name:'Hidden Club',bg:'#aabbcc'}];
 const out=snapshot(s);assert.deepEqual(out.appearance,{primary:'#234567',accent:'#abcdef',highlight:'#123456',textColors:{light:'#112233',dark:'#fff000',header:'#ffffff'},clubs:[{name:'Sohail',color:'#21abc0'}]});
 prohibited(out);assert.ok(!JSON.stringify(out).includes('PRIVATE_'));assert.ok(!JSON.stringify(out).includes('Hidden Club'));
});
test('CONSULT unsafe CSS colors are rejected at the projection boundary and in the client',()=>{
 const s=resultFixture();s.LEAGUE_COLOR_PRI='url(https://example.invalid)';s.LEAGUE_COLOR_ACC='#ABC';s.LEAGUE_COLOR_HL={hex:'#ffffff'};
 s.LEAGUE_TEXT_COLORS={header:'red; color:blue'};s.matches[0].club='Sohail';s.CLUBS=[{name:'Sohail',bg:'url(javascript:alert(1))'}];
 const o=snapshot(s);assert.deepEqual(o.appearance,{primary:'#1b4f9c',accent:'#f5c518',highlight:'#ffedd5',textColors:{},clubs:[]});
 for(const x of ['red','#abc','url(x)','#000000; color:red',null,{},'#ffffff\n'])assert.equal(Client.safeColor(x),null);
 assert.equal(Client.safeColor('#12ABcd'),'#12abcd');
});
test('CONSULT no closed/unpublished result reveals club palette',()=>{
 const s=fixture();s.CLUBS=[{name:'Private Club',bg:'#fedcba'}];s.matches=[match({status:'pending',club:'Private Club'}),match({id:2,cycle:2,status:'confirmed',club:'Private Club'})];
 assert.deepEqual(snapshot(s).appearance.clubs,[]);
});
test('CONSULT theme tokens are scoped to dialog, not the login or root theme',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../public/league-consultation.js'),'utf8');assert.ok(src.includes('dialog.style.setProperty(k,v)'));assert.doesNotMatch(src,/\.setBrand\s*\(/);assert.doesNotMatch(src,/documentElement\.style/);assert.equal(Client.initials('José Fernández de la Torre'),'JF');
});

// The full matrix is presentation only: a match occupies two cells with
// opposite perspectives, but the result list/count still contains it once.
function renderMatrixFixture(results,names=['A','B','C','D']){
 const src=fs.readFileSync(path.join(__dirname,'../public/league-consultation.js'),'utf8');
 const start=src.indexOf('  function renderResults(c,g){'),end=src.indexOf('\n  function render(){',start);
 assert.ok(start>=0&&end>start,'Use the real renderer');
 const node=(tag,text,cls)=>({tag,textContent:text==null?'':String(text),className:cls||'',children:[],append(...items){this.children.push(...items);},setAttribute(){}});
 const ctx=vm.createContext({node,T:(es)=>es,heading:(a,b)=>node('h3',a+' · '+b),playerName:n=>node('span',n),score:Client.score,clubColor:n=>n,setClubColor:(el,color)=>{el.club=color;},clubBadge:n=>node('span',n),table:(h,rows)=>{const t=node('list');t.rows=rows;return t;}});
 vm.runInContext(src.slice(start,end),ctx);
 const section=ctx.renderResults({}, {number:1,rows:names.map(name=>({name})),results});
 const matrix=section.children.find(n=>n.className==='consult-table-scroll').children[0];
 return {cells:matrix.children.find(n=>n.tag==='tbody').children.map(r=>r.children.slice(1)),section};
}
test('CONSULT full matrix mirrors normal matches and supertiebreak, never duplicates records',()=>{
 const results=[{a:'A',b:'B',kind:'played',sets:[[6,2],[4,6],[1,0]],winner:'A',club:'Sohail',date:'2026-11-24'},{a:'C',b:'A',kind:'played',sets:[[6,1],[6,3]],winner:'C',club:'Haza'}];
 const before=JSON.stringify(results),{cells,section}=renderMatrixFixture(results);
 assert.equal(cells[0][1].textContent,'6–2 / 4–6 / 1–0');assert.equal(cells[1][0].textContent,'2–6 / 6–4 / 0–1');
 assert.equal(cells[0][2].textContent,'1–6 / 3–6');assert.equal(cells[2][0].textContent,'6–1 / 6–3');
 assert.equal(cells[0][1].club,'Sohail');assert.equal(cells[1][0].club,'Sohail');assert.equal(cells[0][1].title,cells[1][0].title);
 for(let i=0;i<4;i++)assert.equal(cells[i][i].className,'consult-diagonal');
 assert.equal(cells[0][3].textContent,'·');assert.equal(cells[3][0].textContent,'·');
 assert.equal(cells.flat().filter(c=>c.className==='consult-result').length,4);
 assert.equal(section.children.find(n=>n.tag==='list').rows.length,2);assert.match(section.children[0].textContent,/2 confirmados/);assert.equal(JSON.stringify(results),before);
});
test('CONSULT full matrix mirrors W.O., no-play and retirements without changing winners',()=>{
 const results=[{a:'A',b:'B',kind:'walkover',sets:[],winner:'A',club:'Sohail'}, {a:'C',b:'A',kind:'not-played',sets:[],winner:''}, {a:'D',b:'A',kind:'retired',sets:[[6,2],[3,4]],winner:'A',club:'Haza'}];
 const {cells}=renderMatrixFixture(results);for(const [i,j]of [[0,1],[1,0],[0,2],[2,0]])assert.equal(cells[i][j].className,'consult-result consult-special');
 assert.equal(cells[0][1].textContent,'W.O.');assert.equal(cells[1][0].textContent,'W.O.');assert.equal(cells[0][2].textContent,'—');assert.equal(cells[2][0].textContent,'—');
 assert.equal(cells[3][0].textContent,'6–2 / 3–4 · RET');assert.equal(cells[0][3].textContent,'2–6 / 4–3 · RET');assert.equal(cells[3][0].title,cells[0][3].title);assert.match(cells[3][0].title,/Ganador: A/);
});
test('CONSULT classification padding is separate from restored original matrix sizing',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/league-consultation.css'),'utf8');
 assert.doesNotMatch(css,/\.ui-v3 #view-grupos table\.res-table tr>:first-child/);
 assert.doesNotMatch(css,/:is\(\.cls-table,\.res-table\) \.nm-link/);
 assert.match(css,/\.consult-matrix tr>:first-child\{width:150px;min-width:132px;max-width:160px/);
 assert.match(css,/\.consult-group-table tr>:first-child\{padding-inline:12px 14px\}/);
 assert.match(css,/\.consult-group-table tr>:nth-child\(2\)\{padding-inline:14px\}/);
 assert.doesNotMatch(css,/\.consult-upper/);
});
