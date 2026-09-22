'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const S=require('../public/identity-selection'),D=require('../public/player-duplicates'),B=require('../api/_bulk-identities');
function record(name,league,id=''){
 const ref={type:'league',ligaId:league,name};return {ref,key:S.refKey(ref),name,source:'league',leagueId:league,leagueName:league,globalId:id,editable:true};
}
function rows(people=100,seasons=3){return Array.from({length:seasons},(_,l)=>Array.from({length:people},(_,n)=>record('Persona '+String(n).padStart(3,'0'),'liga-'+l))).flat();}
test('SELECT420 the browser and server enforce 300 selected profiles, not 20 pairs',()=>{
 assert.equal(S.MAX_PROFILES,300);assert.equal(B.MAX_PROFILES,300);assert.equal(B.MAX_CASES,150);
});
test('SELECT420 one candidate combines six league profiles without merging other people',()=>{
 const input=rows(3,6),report=S.scan(input,D);assert.equal(report.groups.length,3);assert.equal(report.records,18);
 for(const group of report.groups){assert.equal(group.profiles,6);assert.equal(new Set(group.nodes.map(n=>n.name)).size,1);assert.equal(group.refs.length,6);}
});
test('SELECT420 select all includes unrendered pages and exactly 300 profiles',()=>{
 const report=S.scan(rows(100,3),D),result=S.selectAll(report.groups);
 assert.equal(report.groups.length,100);assert.equal(result.selection.size,100);assert.equal(result.profiles,300);assert.equal(result.omitted,0);
 assert.equal(S.batches(result.selection).length,100);assert.equal(S.batches(result.selection).at(-1).refs.length,3);
});
test('SELECT420 select all never silently splits a person at the 300-profile boundary',()=>{
 const report=S.scan(rows(101,3),D),result=S.selectAll(report.groups);assert.equal(result.profiles,300);assert.equal(result.omitted,1);
 assert.equal(S.count(result.selection),300);assert.equal([...result.selection.values()].every(g=>g.refs.length===3),true);
});
test('SELECT420 a single 301-profile candidate is left for explicit review, not truncated',()=>{
 const report=S.scan(rows(1,301),D),result=S.selectAll(report.groups);assert.equal(report.groups[0].profiles,301);
 assert.equal(result.profiles,0);assert.equal(result.omitted,1);assert.equal(report.records,301);
});
test('SELECT420 repeated select all is stable, bounded and has no duplicated cases',()=>{
 const groups=S.scan(rows(120,3),D).groups,a=S.selectAll(groups),b=S.selectAll(groups,a.selection);
 assert.deepEqual(S.batches(a.selection),S.batches(b.selection));assert.equal(b.profiles,300);assert.equal(b.omitted,20);
});
test('SELECT420 an existing sporting identity carries every season and alias as one selectable profile',()=>{
 const input=[record('Raúl Pérez','liga-actual','id-current'),record('Raul Perez','liga-old','id-current'),record('R. Pérez','liga-older','id-current'),record('Raúl Pérez','liga-archive','id-archive')];
 const report=S.scan(input,D,'liga-actual');assert.equal(report.groups.length,1);assert.equal(report.groups[0].profiles,2);assert.equal(report.groups[0].records.length,4);
 assert.equal(report.groups[0].nodes.find(n=>n.id==='sport:id-current').representative.leagueId,'liga-actual');
});
test('SELECT420 distinct-person decisions block transitive suggested groups and select all',()=>{
 const input=[record('Juan Pérez','liga-a'),record('Juan Perez','liga-b'),record('Juan Perez','liga-c')];
 const report=S.scan(input,D,'',{one:{status:'distinct',keys:[input[0].key,input[2].key]}});
 assert.equal(report.groups.length,1);assert.equal(report.groups[0].eligible,false);
 const result=S.selectAll(report.groups);assert.equal(result.profiles,0);assert.equal(result.blocked,1);
});
test('SELECT420 read-only global catalogue membership cannot be selected by a local admin',()=>{
 const a=record('Ana Pérez','liga-a','one'),b=record('Ana Perez','liga-b','two');
 const cat={name:'Ana Pérez',key:'cat1',ref:{type:'catalog',id:'one'},source:'catalog',globalId:'one',editable:false};
 const group=S.scan([a,b,cat],D).groups[0];assert.equal(group.profiles,2);assert.equal(group.eligible,false);assert.equal(S.selectAll([group]).blocked,1);
});
test('SELECT420 all 600 candidate groups remain after the old 500-pair and 2500-record limits',()=>{
 const report=S.scan(rows(600,5),D);assert.equal(report.groups.length,600);assert.equal(report.records,3000);assert.equal(report.complete,true);assert.equal(report.limited,false);
 assert.equal(report.groups.at(-1).refs.length,5);
});
test('SELECT420 whitespace, accents, punctuation, ñ, order, typo and partial rules remain covered',()=>{
 const examples=[['Raúl Pérez','Raul Perez'],[' ANA PEREZ ','Ana Perez'],["O’Connor José","O'Connor José"],['Peña Luis','Pena Luis'],['Juan Pérez','Pérez Juan'],['Marcos Gavassa','Marcos Gavasa'],['Juan Pérez','Juan Carlos Pérez']];
 for(const pair of examples){assert.ok(D.compareNames(...pair),pair.join('/'));const report=S.scan(pair.map((n,i)=>record(n,'liga-'+i)),D);assert.equal(report.groups.length,1,pair.join('/'));}
});
test('SELECT420 blocking index preserves components of a full pairwise comparison',()=>{
 const names=['Juan Pérez','Juan Carlos Pérez','Juan Perez','Pérez Juan','Peña Luis','Pena Luis','Marcos Gavassa','Marcos Gavasa','Ana Gómez','Ana Gòmez','Persona 001','Persona 002','Pedro López','Pedro Lopez','José de Li','Jose de Li','Li de Jose','Jose Mario Li','José Li','Raúl','Raul','A. B','A B','Sin Duplicado'];
 const input=names.map((n,i)=>record(n,'liga-'+i)),p=input.map((_,i)=>i);
 const find=i=>p[i]===i?i:(p[i]=find(p[i]));
 for(let i=0;i<input.length;i++)for(let j=i+1;j<input.length;j++)if(D.compareNames(input[i].name,input[j].name))p[find(j)]=find(i);
 const expected=new Map();input.forEach((r,i)=>{const k=find(i);if(!expected.has(k))expected.set(k,[]);expected.get(k).push(r.key);});
 const want=[...expected.values()].filter(g=>g.length>1).map(g=>g.sort()).sort();
 const actual=S.scan(input,D).groups.map(g=>g.records.map(r=>r.key).sort()).sort();assert.deepEqual(actual,want);
});
test('SELECT420 scan and select all never mutate the directory',()=>{
 const input=rows(5,4),before=structuredClone(input);S.selectAll(S.scan(input,D).groups);assert.deepEqual(input,before);
});
test('SELECT420 asynchronous scan completes all records and can cancel between chunks',async()=>{
 const input=rows(600,5),report=await S.scanAsync(input,D);assert.equal(report.records,3000);assert.equal(report.groups.length,600);
 let cancelled=false;await assert.rejects(S.scanAsync(input,D,'',{}, {progress:()=>{cancelled=true;},cancelled:()=>cancelled}),e=>e.code==='SCAN_CANCELLED');
});
test('SELECT420 full replacement modules are loaded before use with new cache versions',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 assert.ok(html.includes('content="sohail-v440-rating"'));
 for(const f of ['identity-selection.js','identity-selection.css','player-identity.js'])assert.ok(html.includes(f+'?v=sohail-v420-all-leagues-300'),f);
 assert.ok(html.indexOf('identity-selection.js?v=')<html.indexOf('player-identity.js?v='));
 const source=fs.readFileSync(path.join(__dirname,'../public/player-identity.js'),'utf8');
 assert.match(source,/Seleccionar todos/);assert.match(source,/S\.selectAll\(cases,bulkSelection\)/);assert.doesNotMatch(source,/scanData\(dir\.records\)|bulkSelection\.size\s*[<>]=?\s*20/);
 assert.match(source,/S\.nodes\(records,ctx\.ligaId\)/);
});
test('SELECT420 profiles found only in past leagues are suggested without a current-league counterpart',()=>{
 const input=[record('Ana Gómez','liga-2022'),record('Ana Gomez','liga-2023'),record('Ana Gómez','liga-2024')];
 const report=S.scan(input,D,'liga-actual');assert.equal(report.groups.length,1);assert.equal(report.groups[0].refs.length,3);
 assert.equal(S.selectAll(report.groups).profiles,3);
});
test('SELECT420 the current league is preferred for the proposed primary spelling',()=>{
 const report=S.scan([record('Jorge Perez','liga-old'),record('Jorge Pérez','liga-actual')],D,'liga-actual');
 assert.equal(report.groups[0].refs[0].ligaId,'liga-actual');assert.equal(report.groups[0].nodes[0].name,'Jorge Pérez');
});

// Exercise the complete browser module, including navigation out of the new
// directory. The operations response is deliberately not a directory response.
function identityUIHarness(operations){
 const vm=require('node:vm'),calls=[],saved=[];let dialog;
 function element(tag,cls='',copy=''){
  return {tag,cls,textContent:copy,children:[],dataset:{},classList:{toggle(){}},
   append(...children){this.children.push(...children);},replaceChildren(...children){this.children=[...children];},
   setAttribute(){},addEventListener(){},remove(){},querySelectorAll(){return [];}};
 }
 const U={el:element,text:es=>es,button(label,fn){return {...element('button','',label),fn};},
  begin:async()=>({ligaId:'liga-actual'}),end(){},
  modal(){dialog={body:element('div'),foot:element('footer'),status:element('p'),closed:false,close(){},busy(){}};return dialog;},
  async post(url,body){calls.push(body);if(body.mode==='directory')return {complete:true,superadmin:true,records:[],decisions:{},leagues:[]};
   if(body.mode==='operations')return {operations};if(body.mode==='undo-preview')return {ok:true,digest:'proof'};throw Error('Unexpected request: '+body.mode);},
  async committed(url,body){calls.push(body);return {committed:true,operationId:'undo-op'};},applied(d,result){saved.push(result);}};
 const window={SohailDataUI:U,SohailIdentitySelection:{...S,scanAsync:async()=>({groups:[]})},SohailDuplicates:D};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/player-identity.js'),'utf8'),{window,crypto:{randomUUID:()=> 'test-operation-id'},toast(){}});
 function find(label,nodes=[dialog.body,dialog.foot]){for(const n of nodes){if(n.tag==='button'&&n.textContent===label)return n;const found=find(label,n.children||[]);if(found)return found;}}
 return {window,calls,saved,get dialog(){return dialog;},find};
}
test('SELECT420 operations navigation accepts its own response shape, not directory metadata',async()=>{
 const h=identityUIHarness([]);await h.window.SohailIdentity.open();await h.find('Operaciones y deshacer').fn();
 assert.equal(h.calls.at(-1).mode,'operations');assert.equal(h.dialog.status.textContent,'');
 assert.ok(h.dialog.body.children.some(n=>n.textContent==='Todavía no hay operaciones de esta versión.'));
});
test('SELECT420 the new directory still offers previewed undo of a completed bulk merge',async()=>{
 const h=identityUIHarness([{id:'merged-op',kind:'merge',createdAt:'2026-09-22',summary:{bulk:true,cases:100}}]);
 await h.window.SohailIdentity.open();await h.find('Operaciones y deshacer').fn();
 assert.equal(h.dialog.status.textContent,'');await h.find('Revisar cómo deshacer').fn();assert.equal(h.saved.length,0);
 assert.equal(h.calls.at(-1).undoId,'merged-op');await h.find('Confirmar deshacer').fn();
 assert.equal(h.calls.at(-1).mode,'undo-commit');assert.equal(h.calls.at(-1).digest,'proof');assert.equal(h.saved.length,1);
});
