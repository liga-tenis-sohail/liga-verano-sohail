'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
// Integrated release: the sporting engine must remain server-only.
const E=require('../api/_rating-engine');
const X=require('../public/rating-explainer'),H=require('../public/match-history');
const u=id=>({jugadorId:id,role:'player'});
const m=(n,a='A',b='B',extra={})=>({id:n,aName:a,bName:b,sets:[[6,3],[6,4]],status:'confirmed',date:'2026-09-01',...extra});
function calculated(n){const data=E.prepare([{id:'league',users:{A:u('A'),B:u('B')},matches:Array.from({length:n},(_,i)=>m(i)),cycles:[]}]);return E.calculate(data,{asOf:'2026-09-22'});}
for(const n of [0,1,14,15,20,43,49,50,60])test(`UX460 provisional criterion is count-only at ${n} matches`,()=>{
 const result=calculated(n).info['["profile","A"]'];assert.equal(result.partidos,Math.min(50,n));assert.equal(result.provisional,n<15);
 assert.equal(result.ratingStatus,n===0?'unrated':n<15?'provisional':'established');assert.equal(result.provisionalMinMatches,15);
 if(n>=15){assert.ok(result.fiab<55,'Repeated opponent keeps confidence conservative');assert.equal(result.provisional,false);}
 assert.ok(result.selected.every(m=>m.weight>0));
});
test('UX460 43 and 49 matches both established with the same threshold',()=>{assert.equal(calculated(43).info['["profile","A"]'].provisional,calculated(49).info['["profile","A"]'].provisional);});
test('UX460 rules do not change the numerical rating or truncate any games',()=>{
 const old=require('./support/rating-v440.cjs');const data=E.prepare([{id:'league',users:{A:u('A'),B:u('B')},matches:Array.from({length:64},(_,i)=>m(i)),cycles:[]}]);
 const a=E.calculate(data,{asOf:'2026-09-22'}),b=old.calculate(data,{asOf:'2026-09-22'});for(const k of Object.keys(a.info)){assert.equal(a.info[k].rating,b.info[k].rating);assert.equal(a.info[k].partidos,b.info[k].partidos);assert.equal(a.info[k].gGanados,b.info[k].gGanados);}
});
for(const language of ['es','en'])test('UX460 legend separates provisional count and confidence '+language,()=>{const s=X.render({},language);assert.match(s,language==='es'?/Desde 15: establecido/:/From 15: established/);assert.ok(!s.includes('evidencia por debajo del umbral'));assert.ok(!s.includes('Having 50 matches does not guarantee an established'));});
const context=()=>({id:'now',nombre:'Liga actual',activeN:1,users:{A:u('a'),B:u('b'),C:u('c'),D:u('d'),E:u('e'),G:u('g')},cycles:[{n:1,groups:[{players:['D']},{players:['E']},{players:['A','B','C','G']}]},{n:2,status:'locked',groups:null}]});
test('UX460 H2H excludes never-played roster entries, prioritizes same-group rivals',()=>{
 const c=context(),result=H.opponentChoices([m(1,'A','D'),m(2,'A','C'),m(3,'A','B')],'A',c);
 assert.deepEqual(result.map(x=>x.name),['B','C','D']);assert.deepEqual(result.map(x=>x.sameGroup),[true,true,false]);assert.equal(result[0].subjectGroup,3);
});
for(const extra of [{sets:[]},{np:true},{wo:true,sets:[]},{status:'pending'},{status:'disputed'},{status:'empty'}])test('UX460 non-playing pairing does not create an H2H option '+JSON.stringify(extra),()=>{assert.equal(H.opponentChoices([m(1,'A','G',extra)],'A',context()).length,0);});
test('UX460 confirmed retirement with games is an actual opponent',()=>{const result=H.opponentChoices([m(1,'A','B',{wo:true,sets:[[6,3]],winner:'B',retiroDe:'A'})],'A',context());assert.equal(result[0].name,'B');});
test('UX460 global aliases produce one current display name, in the current group',()=>{
 const c=context(),old=m(1,'Old A','Old B',{_mhSubject:'Old A',_mhLeagueId:'old',_mhPlayerIds:['a','b'],_mhLeagueName:'Season'});
 const result=H.opponentChoices([old,m(2,'A','B')],'A',c);assert.equal(result.length,1);assert.equal(result[0].name,'B');assert.equal(result[0].sameGroup,true);assert.equal(result[0].played,2);
});
test('UX460 all accessible seasons included; a historical-only rival is retained',()=>{
 const list=['old','older','oldest','another'].map((id,i)=>m(i,'Old A','Historic '+i,{_mhSubject:'Old A',_mhLeagueId:id,_mhLeagueName:id,_mhPlayerIds:['a','historic'+i]}));
 assert.equal(H.opponentChoices(list,'A',context()).length,4);
});
test('UX460 equal names belonging to different identities remain separate',()=>{
 const list=[m(1,'A','B'),m(2,'Old A','B',{_mhSubject:'Old A',_mhLeagueId:'old',_mhPlayerIds:['a','different']})];assert.equal(H.opponentChoices(list,'A',context()).length,2);
});
test('UX460 local names without IDs do not merge across seasons',()=>{
 const c=context();delete c.users.B.jugadorId;const list=[m(1,'A','B'),m(2,'Old A','B',{_mhSubject:'Old A',_mhLeagueId:'old',_mhPlayerIds:['a',null]})];assert.equal(H.opponentChoices(list,'A',c).length,2);
});
test('UX460 changing current group updates priority, not played eligibility',()=>{
 const c=context(),ms=[m(1,'A','D'),m(2,'A','C')];c.cycles[0].groups=[{players:['A','D']},{players:['C']}];assert.deepEqual(H.opponentChoices(ms,'A',c).map(r=>r.name),['D','C']);
});
test('UX460 no group means alphabetical eligible rivals, not a guessed group',()=>{const c=context();c.cycles=[];assert.deepEqual(H.opponentChoices([m(1,'A','D'),m(2,'A','C')],'A',c).map(r=>[r.name,r.sameGroup]),[['C',false],['D',false]]);});
test('UX460 duplicate group assignments do not create false priority',()=>{const c=context();c.cycles[0].groups[0].players.push('A');const rs=H.opponentChoices([m(1,'A','D'),m(2,'A','C')],'A',c);assert.ok(rs.every(r=>!r.sameGroup));});
test('UX460 H2H filter does not delete any history records or change W.O. balance',()=>{
 const c=context(),ms=[m(1),m(2,'A','B',{wo:true,sets:[],winner:'B',retiroDe:'A'}),m(3,'A','B',{np:true})],before=JSON.stringify(ms);
 const rs=H.opponentChoices(ms,'A',c),detail=H.headToHead(ms,'A',rs[0].key,c);assert.equal(rs.length,1);assert.equal(rs[0].played,1);assert.equal(detail.list.length,3);assert.equal(detail.wo,1);assert.equal(JSON.stringify(ms),before);
});
test('UX460 rating reuses standings podium, avatar, me marker, table and group column',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../public/rating.js'),'utf8');for(const fragment of ['class="pos','\'p1\',\'p2\',\'p3\'','class="avatar"','nm-link rating-name','me_label','Grupo actual','Current group','gen-table rt-table'])assert.ok(s.includes(fragment),fragment);
});
test('UX460 root overscroll is disabled without blocking zoom or native touch scrolling',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../public/experience-v460.css'),'utf8');assert.match(s,/html\{overscroll-behavior-y:none\}/);assert.ok(!/touch-action:\s*none|overflow-y:\s*hidden/.test(s));assert.ok(s.includes('body{overscroll-behavior-y:auto}'));assert.ok(s.includes('overscroll-behavior-y:auto'));assert.match(s,/:is\(#view-general,#view-rating\)/);
});
test('UX460 all new UI assets included with one release, cookie helper has no new public Function',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');for(const f of ['experience-v460.css','session-client.js','rating-client.js','rating-explainer.js','rating.js','match-history.js'])assert.ok(s.includes(f+'?v='+(f==='match-history.js'?'sohail-v480-rules-injuries':'sohail-v460-unified-experience')));
 assert.ok(s.indexOf('session-client.js')<s.indexOf('bootstrap.js?v='));assert.ok(!fs.existsSync(path.join(__dirname,'../api/session.js')));
});

test('UX460 malformed or empty group slots do not break played-opponent choices',()=>{
 const H=require('../public/match-history.js');
 const source=[{id:1,status:'confirmed',aName:'A',bName:'B',sets:[[6,4],[6,4]]}];
 const ctx={id:'league',users:{A:{jugadorId:'a'},B:{jugadorId:'b'}},activeN:1,cycles:[{n:1,groups:[null,{}, {players:['A','B']}]}]};
 const found=H.opponentChoices(source,'A',ctx,'en');assert.equal(found.length,1);assert.equal(found[0].sameGroup,true);assert.equal(found[0].group,3);
 ctx.cycles[0].groups={};assert.equal(H.opponentChoices(source,'A',ctx).length,1);
});
