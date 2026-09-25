'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../api/_rating-engine');
const user=id=>({historialId:id});
const match=(id,sets=[[6,3],[6,2]],extra={})=>({id,aName:'Ana',bName:'Beto',status:'confirmed',sets,date:'2026-09-01',...extra});
const league=(id='l',matches=[match(1)],users={Ana:user('a'),Beto:user('b')},extra={})=>({id,users,matches,...extra});
const get=(r,n='Ana',l='l')=>r.info[r.byLeague[l][n]];
const calc=(ls,opts={})=>E.calculate(E.prepare(ls),{asOf:'2026-09-22',...opts});
const date=i=>new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10);
test('RT440 identity: merged aliases use ONE 50-match window across all leagues',()=>{
 const a=league('a',Array.from({length:32},(_,i)=>match(i,undefined,{date:date(i)})));
 const b=league('b',Array.from({length:30},(_,i)=>match(i,undefined,{aName:'Ana histórica',date:date(i+32)})),{'Ana histórica':user('a'),Beto:user('b')});
 const r=calc([a,b]),x=get(r,'Ana','a');assert.equal(x.partidos,50);assert.equal(x.totalMatches,62);assert.equal(x,get(r,'Ana histórica','b'));assert.equal(x.selected.length,50);
});
test('RT440 identity: equal names with different IDs stay separate',()=>{const r=calc([league('a'),league('b',[match(1)],{Ana:user('different'),Beto:user('b')})]);assert.notEqual(r.byLeague.a.Ana,r.byLeague.b.Ana);assert.equal(get(r,'Ana','a').partidos,1);});
test('RT440 identity: unlinked historical names never guess a match across leagues',()=>{const r=calc([league('a',[match(1)],{Ana:{},Beto:{}}),league('b',[match(1)],{Ana:{},Beto:{}})]);assert.equal(Object.keys(r.info).length,4);assert.equal(get(r,'Ana','a').unlinked,true);});
test('RT440 identity: jugadorId fallback and historialId priority',()=>{assert.equal(E.identity('x','A',{historialId:'sport',jugadorId:'login'}),'["profile","sport"]');assert.equal(E.identity('x','A',{jugadorId:'p'}),'["profile","p"]');});
test('RT440 identity: self-match after an invalid merge blocks publication',()=>{assert.throws(()=>calc([league('l',[match(1)],{Ana:user('a'),Beto:user('a')})]),e=>e.code==='SELF_MATCH');});
test('RT440 provenance: same ID/date/score in different leagues both survive',()=>{const r=calc([league('one'),league('two')]);assert.equal(r.matchCount,2);assert.equal(get(r,'Ana','one').partidos,2);});
test('RT440 provenance: different IDs with identical scores and dates survive',()=>{assert.equal(calc([league('l',[match(1),match(2)])]).matchCount,2);});
test('RT440 provenance: identical repeated source ID is counted once',()=>{assert.equal(calc([league('l',[match(1),match(1)])]).matchCount,1);});
test('RT440 provenance: conflicting source ID fails rather than picking one score',()=>{assert.throws(()=>calc([league('l',[match(1),match(1,[[6,0],[6,0]])])]),e=>e.code==='DUPLICATE_CONFLICT');});
test('RT440 provenance: missing IDs retain separate rows with a visible warning',()=>{const r=calc([league('l',[match(null),match(null)])]);assert.equal(r.matchCount,2);assert.equal(r.issues.filter(x=>x.code==='missing-id').length,2);});
test('RT440 dates: supported calendar dates do not depend on timezone',()=>{assert.equal(E.dateKey('15/09/2026'),'2026-09-15');assert.equal(E.dateKey('2026-09-15T01:00:00+02:00'),'2026-09-15');assert.equal(E.dateKey('2026-02-30'),'');assert.equal(E.dateKey('2024-02-29'),'2024-02-29');});
test('RT440 dates: missing dates remain included and visibly marked',()=>{const r=calc([league('l',[match(1,undefined,{date:''}),match(2)])]);assert.equal(get(r).partidos,2);assert.equal(get(r).missingDates,1);assert.equal(get(r).selected.at(-1).date,'');});
test('RT440 window: 51st match never reduces the required 50',()=>{const r=calc([league('l',Array.from({length:51},(_,i)=>match(i,undefined,{date:date(i)})))]);assert.equal(get(r).partidos,50);assert.ok(!get(r).selected.some(x=>JSON.parse(x.key)[1]==='id:0'));});
test('RT440 window: A still uses its match when B has 50 newer matches',()=>{const ms=[match(1)];for(let i=0;i<55;i++)ms.push(match(i+2,undefined,{aName:'Beto',bName:'Ciro',date:date(i+250)}));const r=calc([league('l',ms,{Ana:user('a'),Beto:user('b'),Ciro:user('c')})]);assert.equal(get(r).partidos,1);assert.equal(get(r,'Beto').partidos,50);});
test('RT440 window: no configuration can silently lower it',()=>{assert.throws(()=>calc([league()],{window:30}),e=>e.code==='INVALID_WINDOW');});
for(const [name,sets,winner]of [['STB win with fewer games',[[0,6],[6,4],[1,0]],0],['equal total games',[[7,5],[3,6],[1,0]],0],['reverse STB winner',[[5,7],[6,3],[0,1]],1],['two sets',[[6,4],[6,4]],0],['three full sets',[[6,2],[1,6],[6,4]],0]]){
 test('RT440 actual winner: '+name,()=>{const r=calc([league('l',[match(1,sets)])]);assert.equal(get(r).vict,winner===0?1:0);assert.equal(get(r).der,winner===1?1:0);assert.equal(get(r,'Beto').vict+get(r).vict,1);assert.equal(get(r,'Beto').der+get(r).der,1);});
}
test('RT440 STB: normal games not converted into tiebreak points or reduced to 40%',()=>{const r=calc([league('l',[match(1,[[6,3],[4,6],[1,0]])])]),a=get(r);assert.equal(a.gGanados,10);assert.equal(a.gPerdidos,9);assert.equal(a.stbWins,1);assert.equal(a.selected[0].weight,0.6+0.4/15);assert.equal(a.selected[0].gamesEvidence,19/(1+18*E.DEFAULTS.gameCorrelation));assert.equal(a.selected[0].stbEvidence,E.DEFAULTS.stbEvidence);});
test('RT440 STB: changing winner preserves evidence from the preceding sets',()=>{const a=get(calc([league('l',[match(1,[[6,3],[4,6],[1,0]])])])),b=get(calc([league('l',[match(1,[[6,3],[4,6],[0,1]])])]));assert.equal(a.selected[0].gamesEvidence,b.selected[0].gamesEvidence);assert.ok(a.rating>b.rating);});
test('RT440 RET: real partial play remains; a longer match has more evidence',()=>{const x=get(calc([league('l',[match(1,[[6,0]],{wo:true,winner:'Beto',retiroDe:'Ana'})])])),y=get(calc([league('l',[match(1,[[6,0],[6,0]])])]));assert.equal(x.partidos,1);assert.equal(x.der,1);assert.ok(x.evidence<y.evidence);assert.ok(x.rating<y.rating);});
test('RT440 RET: partial games plus explicit winner are retained',()=>{const a=get(calc([league('l',[match(1,[[6,4],[4,3]],{wo:true,winner:'Beto',retiroDe:'Ana'})])]));assert.equal(a.gGanados,10);assert.equal(a.der,1);});
test('RT440 RET: unresolved winner does not invent a loss for either side',()=>{const r=calc([league('l',[match(1,[[6,3]],{wo:true})])]);assert.equal(get(r).partidos,1);assert.equal(get(r).unresolved,1);assert.equal(get(r).vict+get(r).der,0);assert.equal(get(r,'Beto').vict+get(r,'Beto').der,0);});
test('RT440 W.O./NJ/pending: only already unplayed/unconfirmed records are omitted',()=>{const r=calc([league('l',[match(1,[],{wo:true}),match(2,undefined,{np:true}),match(3,undefined,{status:'pending'}),match(4,[[6,4]],{wo:true,winner:'Ana'})])]);assert.equal(r.matchCount,1);});
test('RT440 invalid score: never silently publish a subset',()=>{assert.throws(()=>calc([league('l',[match(1),match(2,[[-1,6],[6,0]])])]),e=>e.code==='INVALID_SCORE');});
test('RT440 all 50: old, repeated and weaker-opponent matches have positive weight',()=>{const ms=Array.from({length:50},(_,i)=>match(i,[[6,0],[6,0]],{date:i===0?'2000-01-01':date(i)}));const a=get(calc([league('l',ms)]));assert.equal(a.partidos,50);assert.ok(a.selected.every(m=>m.weight>0&&m.gamesEvidence>0));assert.equal(a.selected.at(-1).weight,E.DEFAULTS.timeFloor);});
test('RT440 time: real gaps change relative weight, not just match rank',()=>{const ms=[match(1,undefined,{date:'2000-01-01'}),match(2,undefined,{date:'2026-01-01'}),match(3,undefined,{date:'2026-01-02'})];const a=get(calc([league('l',ms)]));assert.ok(a.selected[1].weight>a.selected[2].weight);});
test('RT440 inactivity: same sporting data keep skill, while confidence decreases',()=>{const ms=Array.from({length:50},(_,i)=>match(i,undefined,{date:date(i)}));const a=get(calc([league('l',ms)],{asOf:date(50)})),b=get(calc([league('l',ms)],{asOf:'2030-09-22'}));assert.equal(a.rating,b.rating);assert.ok(a.fiab>b.fiab);});
test('RT440 confidence: 50 matches is not 100% certainty',()=>{const a=get(calc([league('l',Array.from({length:50},(_,i)=>match(i)))]));assert.equal(a.partidos,50);assert.ok(a.fiab<100);assert.equal(a.uniqueOpponents,1);});
test('RT440 confidence: diverse equally established opponents improve evidence index',()=>{
 const users={Ana:user('a')},ms=[];for(let k=0;k<10;k++){users['R'+k]=user('r'+k);for(let j=0;j<20;j++)ms.push(match(1000+k*20+j,[[6,4],[4,6],[1,0]],{aName:'R'+k,bName:'R'+((k+1)%10),date:'2026-08-01'}));}for(let i=0;i<50;i++)ms.push(match(i,undefined,{bName:'R'+(i%10),date:'2026-09-01'}));
 const a=get(calc([league('l',ms,users)])),b=get(calc([league('l',Array.from({length:50},(_,i)=>match(i)))]));assert.ok(a.fiab>b.fiab);assert.equal(a.uniqueOpponents,10);
});
test('RT440 seed: current league order, active cycle and current groups do not redefine global level',()=>{
 const l=league('l',[match(1,undefined,{g:1,cycle:1})],undefined,{cycles:[{n:1,groups:[{},{}]},{n:2,groups:[{}]}],activeN:1});const a=calc([l,league('z')]);l.activeN=2;l.cycles[1].groups=Array.from({length:25},()=>({}));const b=calc([league('z'),l]);assert.equal(get(a).rating,get(b).rating);assert.equal(get(a).prior,14);
});
test('RT440 seed: conflicting manual seeds are explicit, never whichever league is open',()=>{const r=calc([league('a',undefined,undefined,{seeds:{Ana:5}}),league('b',undefined,undefined,{seeds:{Ana:12}})]);assert.equal(get(r,'Ana','a').seed,null);assert.equal(get(r,'Ana','a').seedConflict,true);});
test('RT440 seed: consistent explicit seed is a transparent weak prior',()=>{const a=get(calc([league('l',undefined,undefined,{seeds:{Ana:10}})]));assert.equal(a.seed,10);assert.equal(a.priorSource,'manual-consistent');});
test('RT440 manual: fixed presentation values never change opponent estimates',()=>{const a=calc([league()]),b=calc([league('l',undefined,undefined,{overrides:{Ana:16}})]);assert.equal(get(a).rating,get(b).rating);assert.equal(get(a,'Beto').rating,get(b,'Beto').rating);});
test('RT440 symmetry: swapping every side reverses the same sporting result',()=>{const a=calc([league()]),b=calc([league('l',[match(1,[[3,6],[2,6]],{aName:'Beto',bName:'Ana'})])]);assert.equal(get(a).rating,get(b).rating);});
test('RT440 disconnected network: separate components remain finite and are marked',()=>{const r=calc([league('a'),league('b',[match(1)],{Ana:user('c'),Beto:user('d')})]);assert.equal(r.componentCount,2);assert.ok(Object.values(r.info).every(x=>x.isolated&&Number.isFinite(x.rating)));});
test('RT440 convergence: cannot publish a stopped unconverged calculation',()=>{assert.throws(()=>calc([league()],{maxIterations:1}),e=>e.code==='NO_CONVERGENCE');});
test('RT440 no result: not fabricated confidence or wins',()=>{const a=get(calc([league('l',[])]));assert.equal(a.partidos,0);assert.equal(a.rating,8);assert.equal(a.fiab,0);assert.equal(a.provisional,true);});
test('RT440 reproducible: serialized input gives deterministic snapshot computation',()=>{const ls=[league()];assert.deepEqual(calc(ls),calc(JSON.parse(JSON.stringify(ls))));});
test('RT440 prototype names: own records are handled without prototype pollution',()=>{const u=JSON.parse('{"__proto__":{"historialId":"a"},"constructor":{"historialId":"b"}}');const r=calc([league('l',[match(1,undefined,{aName:'__proto__',bName:'constructor'})],u)]);assert.equal(Object.keys(r.info).length,2);assert.equal({}.historialId,undefined);});

test('RT440 unplayed playoff bye: missing opponent does not invalidate played results',()=>{const r=calc([league('l',[match(1),{id:99,po:true,poNames:['Ana',null],wo:true,sets:[],status:'confirmed'}])]);assert.equal(r.matchCount,1);assert.equal(get(r).partidos,1);});
