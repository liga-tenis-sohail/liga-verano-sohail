'use strict';
// Focused v5.1.2 regression tests. Synthetic people/scores only; no network,
// credentials, Supabase writes or extra dependencies. Runs with npm test.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Score=require('../public/score-rules');
const History=require('../public/match-history');
const Validation=require('../api/_validation');
const Policy=require('../public/result-policy');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const json=value=>JSON.parse(JSON.stringify(value));
const completeScores=[];
for(let n=0;n<=4;n++)completeScores.push([6,n],[n,6]);
completeScores.push([7,5],[5,7],[7,6],[6,7]);
const completeKeys=new Set(completeScores.map(s=>s.join(':')));
const key=s=>s.join(':');
// Independent oracle: traverse reachable scores without playing on after a set
// has ended. A second set can start only after a completed first set.
const reachable=new Set(['0:0']),unfinished=new Set();
const queue=[[0,0]];
for(let i=0;i<queue.length;i++){
 const s=queue[i];
 if(completeKeys.has(key(s)))continue;
 unfinished.add(key(s));
 for(const next of [[s[0]+1,s[1]],[s[0],s[1]+1]]){
  const k=key(next);
  if(!reachable.has(k)){reachable.add(k);queue.push(next);}
 }
}
function oracle(sets){
 if(!Array.isArray(sets)||sets.length>2)return false;
 for(let i=0;i<sets.length;i++){
  const s=sets[i];
  if(!Array.isArray(s)||s.length!==2||!Number.isSafeInteger(s[0])||!Number.isSafeInteger(s[1])||!reachable.has(key(s)))return false;
  if(i<sets.length-1&&!completeKeys.has(key(s)))return false;
 }
 if(sets.length===2&&sets.every(s=>completeKeys.has(key(s)))&&(sets[0][0]>sets[0][1])===(sets[1][0]>sets[1][1]))return false;
 return true;
}
function fixture(){return {
 _v:3,users:{admin:{name:'Organización',role:'admin'},superadmin:{name:'Super Administrador',role:'superadmin'},Alicia:{name:'Alicia',role:'player'},Beto:{name:'Beto',role:'player'},Ciro:{name:'Ciro',role:'player'}},
 cycles:[{n:1,status:'active',groups:[{players:['Alicia','Beto','Ciro']}]}],activeN:1,
 matches:[],matchId:1,playoff:{started:false,tramos:[]},CLUBS:[{name:'Sohail'}],LOG:[]
};}
function match(sets,extra={}){return {
 id:1,aName:'Alicia',bName:'Beto',cycle:1,g:1,club:'Sohail',date:'2026-10-08',
 status:'confirmed',sets:json(sets),...extra
};}
const ret=(sets,extra={})=>match(sets,{wo:true,retiroDe:'Beto',winner:'Alicia',...extra});
function ui(){
 const base=fixture(),c={
 TRANSLATIONS:{es:{},en:{}},console,structuredClone,Map,Set,Date,
 currentUser:{name:'Alicia',role:'player'},_ligaActual:'liga-test',_ligaReadOnly:false,_loadOK:true,
 _saveSessionKey:()=> 'session-test',cycles:base.cycles,matches:[],activeN:1,playoff:base.playoff,CLUBS:base.CLUBS,USERS:base.users,
 SohailScore:Score,SohailResultPolicy:Policy,esAdmin:u=>!!u&&(['admin','superadmin'].includes(u.role)||!!u.isAdmin),
 attr:v=>String(v),t:k=>k,document:{getElementById:()=>null},addEventListener(){},window:null
 };
 c.window=c;vm.createContext(c);vm.runInContext(read('public/result-editor.js'),c);
 return c;
}
function model(sets=[['4','0'],['','']],extra={}){return {
 id:'re-page',c:{po:false,cycle:1,gid:1,a:'Alicia',b:'Beto'},original:null,
 key:'session-test',league:'liga-test',club:'Sohail',date:'2026-10-08',sets:json(sets),
 stb:['',''],mode:'ret',loser:'Beto',dirty:true,saving:false,...extra
};}
function groupStats(list){
 const src=read('public/core-estado.js'),start=src.indexOf('function computeStats(cycN,gid){'),end=src.indexOf('function findMatch(',start);
 assert.ok(start>=0&&end>start,'real production computeStats must be present');
 const c={cycles:fixture().cycles,matches:json(list),validSet:Score.validSet};
 vm.createContext(c);vm.runInContext(src.slice(start,end),c);
 return json(c.computeStats(1,1));
}

for(const s of completeScores)test('RET512 normal set remains valid: '+key(s),()=>assert.equal(Score.validSet(...s),true));
for(const sets of [ [[6,0],[6,4]], [[5,7],[6,7]], [[6,2],[2,6],[1,0]], [[6,7],[7,5],[0,1]] ]){
 test('RET512 normal completed match accepted: '+JSON.stringify(sets),()=>assert.equal(Score.validMatch(sets).ok,true));
}
for(const sets of [ [[4,0],[6,2]], [[6,3],[4,0]], [[5,5],[6,0]], [[6,5],[6,0]], [[7,0],[6,0]], [[7,7],[6,0]], [[6,4]], [[6,3],[6,2],[1,0]], [[6,3],[3,6]], [[6,3],[3,6],[10,8]] ]){
 test('RET512 without retirement incomplete/invalid match refused: '+JSON.stringify(sets),()=>assert.equal(Score.validMatch(sets).ok,false));
}
for(const sets of [ [], [[4,0]], [[0,4]], [[3,2]], [[5,5]], [[6,5]], [[5,6]], [[6,6]], [[0,0]], [[6,3]], [[3,6]], [[6,4],[4,0]], [[2,6],[5,5]], [[6,3],[3,6]], [[6,3],[0,0]] ]){
 test('RET512 permitted retirement sequence: '+JSON.stringify(sets),()=>assert.equal(Score.validRetirement(sets),true));
}
for(const sets of [ [[4,0],[6,0]], [[3,2],[1,0]], [[0,0],[4,0]], [[6,3],[6,2]], [[3,6],[2,6]], [[7,0]], [[7,4]], [[7,7]], [[8,6]], [[-1,0]], [[1.5,0]], [[6,3],[3,6],[1,0]] ]){
 test('RET512 impossible retirement sequence refused: '+JSON.stringify(sets),()=>assert.equal(Score.validRetirement(sets),false));
}
for(const [label,sets] of [ ['null',null],['object',{}],['string','4-0'],['missing',undefined],['non-pair',[4,0]],['extra value',[[4,0,0]]],['missing value',[[4]]],['string value',[['4',0]]],['boolean',[[true,0]]],['null value',[[4,null]]],['NaN',[[NaN,0]]],['infinite',[[Infinity,0]]],['unsafe integer',[[Number.MAX_SAFE_INTEGER+1,0]]],['sparse rows',new Array(2)],['sparse pair',[new Array(2)]] ]){
 test('RET512 malformed retirement handled without crash: '+label,()=>assert.equal(Score.validRetirement(sets),false));
}
test('RET512 all 6,643 zero/one/two-set integer combinations match reachable-score oracle and history',()=>{
 const candidates=[];for(let a=0;a<=8;a++)for(let b=0;b<=8;b++)candidates.push([a,b]);
 let count=0;
 function verify(sets){
  count++;const want=oracle(sets),message=JSON.stringify(sets);
  assert.equal(Score.validRetirement(sets),want,'input '+message);
  assert.equal(History.winner(ret(sets)),want?'Alicia':null,'history '+message);
 }
 verify([]);for(const first of candidates){verify([first]);for(const second of candidates)verify([first,second]);}
 assert.equal(count,6643);
});
test('RET512 complete and RET grammars cannot both accept the same finished match',()=>{
 for(const a of completeScores)for(const b of completeScores){
  const split=(a[0]>a[1])!==(b[0]>b[1]);
  const m=split?[a,b,[1,0]]:[a,b];
  assert.equal(Score.validMatch(m).ok,true);assert.equal(Score.validRetirement(m),false);
 }
});
test('RET512 validators never modify input arrays',()=>{
 const sets=Object.freeze([Object.freeze([6,4]),Object.freeze([4,0])]);
 assert.equal(Score.validRetirement(sets),true);assert.deepEqual(sets,[[6,4],[4,0]]);
});

for(const role of ['player','admin','superadmin'])for(const po of [false,true]){
 const name=role==='player'?'Alicia':role;
 test('RET512 server accepts actual 4-0 RET for '+role+' / '+(po?'playoff':'groups'),()=>{
  const state=fixture(),incoming=structuredClone(state),record=ret([[4,0]],{status:role==='player'?'pending':'confirmed',reporter:name,locked:role!=='player'});
  if(po){state.playoff={started:true,tramos:[{label:'Cuadro 1',main:[[{a:'Alicia',b:'Beto'}]],cons:[]}]};incoming.playoff=structuredClone(state.playoff);Object.assign(record,{po:true,poNames:['Alicia','Beto'],ti:0,which:'main',ri:0,mi:0});}
  incoming.matches=[record];Validation.protectState(state,incoming,{u:name,r:role},role!=='player',role!=='player');
  assert.deepEqual(incoming.matches[0].sets,[[4,0]]);assert.equal(incoming.matches[0].winner,'Alicia');
 });
 test('RET512 server rejects same partial without RET for '+role+' / '+(po?'playoff':'groups'),()=>{
  const state=fixture(),record=match([[4,0],[6,2]],{wo:false,winner:'Alicia'});
  if(po){state.playoff={started:true,tramos:[{main:[[{a:'Alicia',b:'Beto'}]],cons:[]}]};Object.assign(record,{po:true,poNames:['Alicia','Beto'],ti:0,which:'main',ri:0,mi:0});}
  assert.throws(()=>Validation.validateMatch(record,state,role!=='player'),e=>e.status===400);
 });
}
for(const [label,extra] of [['missing retiring player',{retiroDe:undefined}],['outsider retires',{retiroDe:'Ciro'}],['retiring player also wins',{winner:'Beto'}],['outsider wins',{winner:'Ciro'}],['only retiring name without flag',{wo:false}],['string flag',{wo:'false'}],['numeric flag',{wo:1}]]){
 test('RET512 server refuses '+label,()=>assert.throws(()=>Validation.validateMatch(ret([[4,0]],extra),fixture(),true),e=>e.status===400));
}
test('RET512 a leader who retires loses, without altering the recorded games',()=>{
 const m=ret([[4,0]],{retiroDe:'Alicia',winner:'Beto'});Validation.validateMatch(m,fixture(),true);assert.deepEqual(m.sets,[[4,0]]);assert.equal(History.winner(m),'Beto');
});
test('RET512 player cannot confirm a RET by using the partial-score exception',()=>{
 const s=fixture(),incoming=structuredClone(s);incoming.matches=[ret([[4,0]],{status:'confirmed'})];
 assert.throws(()=>Validation.protectState(s,incoming,{u:'Alicia',r:'player'},false,false),e=>e.status===403);
});
test('RET512 player cannot submit a RET between other people',()=>{
 const s=fixture(),incoming=structuredClone(s);incoming.matches=[ret([[4,0]],{aName:'Beto',bName:'Ciro',retiroDe:'Ciro',winner:'Beto',status:'pending'})];
 assert.throws(()=>Validation.protectState(s,incoming,{u:'Alicia',r:'player'},false,false),e=>e.status===403);
});
test('RET512 existing saved partial cannot be silently rewritten by a player',()=>{
 const s=fixture();s.matches=[ret([[4,0]],{status:'pending'})];const incoming=structuredClone(s);incoming.matches[0].sets=[[5,0]];
 assert.throws(()=>Validation.protectState(s,incoming,{u:'Alicia',r:'player'},false,false));
});
test('RET512 unchanged historical records survive an unrelated save',()=>{
 const s=fixture();s.matches=[ret([[4,0]])];const incoming=structuredClone(s);
 assert.doesNotThrow(()=>Validation.protectState(s,incoming,{u:'Alicia',r:'player'},false,false));assert.deepEqual(incoming.matches,s.matches);
});
test('RET512 admin corrects a RET with the same match ID',()=>{
 const s=fixture();s.matches=[ret([[3,0]])];const incoming=structuredClone(s);incoming.matches[0].sets=[[4,0]];
 Validation.protectState(s,incoming,{u:'admin',r:'admin'},true,true);assert.equal(incoming.matches[0].id,1);assert.deepEqual(incoming.matches[0].sets,[[4,0]]);
});
test('RET512 W.O. still has no games and no played-match/rating evidence implied',()=>{
 const m=ret([]);Validation.validateMatch(m,fixture(),true);assert.equal(History.kind(m),'wo');const summary=History.summarize([m],'Alicia');
 assert.equal(summary.wo,1);assert.equal(summary.played,0);assert.equal(summary.games,0);
});
test('RET512 not-played injury still forbids a score and awards no decision',()=>{
 const s=fixture(),m=match([],{np:true,npReason:'injury',injurySide:0});
 Validation.validateMatch(m,s,true);assert.equal(History.winner(m),null);
 assert.throws(()=>Validation.validateMatch({...m,sets:[[4,0]]},s,true),e=>e.status===400);
});

for(const [label,sets]of [['first-set retirement',[['4','0'],['','']]],['second-set retirement',[['6','4'],['3','2']]],['tie at retirement',[['5','5'],['','']]],['six-all in progress',[['6','6'],['','']]],['trailing zero row',[['4','0'],['0','0']]]]){
 test('RET512 current editor accepts '+label,()=>{const c=ui(),m=model(sets),v=c.SohailResults.validation(m);assert.equal(v.ok,true);assert.equal(v.winner,'Alicia');assert.equal(v.sets[0][0],Number(sets[0][0]));});
}
for(const [label,sets]of [['one score missing',[['4',''],['','']]],['spaces instead of zero',[['4',' '],['','']]],['skipped first row',[['',''],['4','0']]],['zero first row then play',[['0','0'],['4','0']]],['partial before complete',[['4','0'],['6','2']]],['two unfinished sets',[['4','0'],['2','1']]],['match already ended',[['6','2'],['6','3']]],['impossible score',[['7','0'],['','']]],['fraction',[['4.5','0'],['','']]]]){
 test('RET512 current editor refuses '+label,()=>{const c=ui();assert.equal(c.SohailResults.validation(model(sets)).key,'re_ret_error');});
}
test('RET512 switching RET off restores completed-match checks without erasing inputs',()=>{
 const c=ui(),m=model(),before=json(m.sets);assert.equal(c.SohailResults.validation(m).ok,true);m.mode='normal';assert.equal(c.SohailResults.validation(m).ok,undefined);assert.deepEqual(m.sets,before);
});
test('RET512 current editor requires who retired even when the score is valid',()=>{
 const c=ui();assert.equal(c.SohailResults.validation(model(undefined,{loser:''})).key,'re_special_need');
});
test('RET512 current editor sets the non-retiring winner even when losing games',()=>{
 const c=ui(),v=c.SohailResults.validation(model(undefined,{loser:'Alicia'}));assert.equal(v.ok,true);assert.equal(v.winner,'Beto');assert.deepEqual(json(v.sets),[[4,0]]);
});
test('RET512 ordinary match still needs a 1-0/0-1 STB after split sets',()=>{
 const c=ui(),m=model([['6','3'],['2','6']],{mode:'normal',loser:'',stb:['','']});
 assert.equal(c.SohailResults.validation(m).key,'valid_need_stb');m.stb=['10','8'];assert.equal(c.SohailResults.validation(m).key,'valid_stb_only');m.stb=['1','0'];assert.equal(c.SohailResults.validation(m).ok,true);
});
test('RET512 current editor does not hide a missing club or changed session',()=>{
 const c=ui();assert.equal(c.SohailResults.validation(model(undefined,{club:''})).key,'re_club_error');assert.equal(c.SohailResults.validation(model(undefined,{key:'other'})).key,'re_session');
});
test('RET512 current editor W.O. never sends entered game scores',()=>{
 const c=ui(),v=c.SohailResults.validation(model(undefined,{mode:'wo'}));assert.equal(v.ok,true);assert.deepEqual(json(v.sets),[]);
});
test('RET512 both languages describe the exception, real games and the last-set constraint',()=>{
 const c=ui();for(const lang of ['es','en']){for(const k of ['re_ret_help','re_ret_error','re_format'])assert.ok(c.TRANSLATIONS[lang][k]?.length>20);assert.match(c.TRANSLATIONS[lang].re_ret_help,/4–0/);}
 assert.match(c.TRANSLATIONS.es.re_ret_help,/último/);assert.match(c.TRANSLATIONS.en.re_ret_help,/last/);
});

for(const [sets,expect]of [[[ [4,0] ],{games:4,for:4,against:0,full:0,setsFor:0,setsAgainst:0}],[[ [6,4],[3,2] ],{games:15,for:9,against:6,full:1,setsFor:1,setsAgainst:0}],[[ [2,6],[5,5] ],{games:18,for:7,against:11,full:1,setsFor:0,setsAgainst:1}]]){
 test('RET512 history counts actual games but not unfinished sets: '+JSON.stringify(sets),()=>{
  const s=History.summarize([ret(sets)],'Alicia');assert.equal(s.played,1);assert.equal(s.wins,1);assert.equal(s.unresolved,0);assert.equal(s.games,expect.games);assert.equal(s.gamesFor,expect.for);assert.equal(s.gamesAgainst,expect.against);assert.equal(s.fullSets,expect.full);assert.equal(s.setsFor,expect.setsFor);assert.equal(s.setsAgainst,expect.setsAgainst);
  const other=History.summarize([ret(sets)],'Beto');assert.equal(other.losses,1);assert.equal(other.gamesFor,expect.against);assert.equal(other.gamesAgainst,expect.for);assert.equal(other.setsFor,expect.setsAgainst);assert.equal(other.setsAgainst,expect.setsFor);
 });
}
test('RET512 history does not treat a bare incomplete normal score as a decided match',()=>{
 const m=match([[4,0]]),s=History.summarize([m],'Alicia');assert.equal(History.winner(m),null);assert.equal(s.played,0);assert.equal(s.unresolved,1);assert.equal(s.games,0);
});
test('RET512 history ignores pending RET for wins/games until confirmed',()=>{
 const s=History.summarize([ret([[4,0]],{status:'pending'})],'Alicia');assert.equal(s.pending,1);assert.equal(s.played,0);assert.equal(s.games,0);
});
test('RET512 H2H counts the confirmed retirement and preserves its score',()=>{
 const m=ret([[4,0]],{retiroDe:'Alicia',winner:'Beto'}),context={id:'liga-test',users:{Alicia:{jugadorId:'a'},Beto:{jugadorId:'b'}}};
 const h=History.headToHead([m],'Alicia',History.person('Beto',context).key,context);assert.equal(h.losses,1);assert.equal(h.wins,0);assert.equal(h.unresolved,0);assert.deepEqual(h.list[0].sets,[[4,0]]);
});
test('RET512 linked cross-league retirement keeps the historical subject and correct H2H identity',()=>{
 const m=ret([[4,0]],{aName:'Alicia Antigua',winner:'Alicia Antigua',_mhSubject:'Alicia Antigua',_mhLeagueId:'old',_mhPlayerIds:['a','b']});
 const s=History.summarize([m],'Alicia');assert.equal(s.wins,1);assert.equal(s.gamesFor,4);assert.equal(History.opponent(m,'Alicia',{id:'now'}).id,'b');
});
test('RET512 league table gives existing 3/1 points and no made-up set for 4-0 RET',()=>{
 const stats=groupStats([ret([[4,0]],{retiroDe:'Alicia',winner:'Beto'})]),a=stats.find(s=>s.name==='Alicia'),b=stats.find(s=>s.name==='Beto');
 assert.deepEqual([a.pts,a.g,a.p,a.sg,a.sp,a.gw,a.gl],[1,0,1,0,0,4,0]);assert.deepEqual([b.pts,b.g,b.p,b.sg,b.sp,b.gw,b.gl],[3,1,0,0,0,0,4]);
});
test('RET512 league table preserves a completed set and adds real games of the partial second set',()=>{
 const s=groupStats([ret([[6,4],[3,2]])]).find(s=>s.name==='Alicia');assert.deepEqual([s.sg,s.sp,s.gw,s.gl],[1,0,9,6]);
});
test('RET512 tied group uses completed sets only in H2H tiebreaks too',()=>{
 const list=[ret([[4,0]]),ret([[0,4]],{id:2,aName:'Beto',bName:'Ciro',winner:'Beto',retiroDe:'Ciro'}),ret([[2,2]],{id:3,aName:'Ciro',bName:'Alicia',winner:'Ciro',retiroDe:'Alicia'})];
 const st=groupStats(list);assert.ok(st.every(s=>s.sg===0&&s.sp===0&&s.pts===4));assert.deepEqual(st.map(s=>s.name),['Ciro','Alicia','Beto']);
});
test('RET512 confirmed W.O. and not-played injury retain their distinct point behavior',()=>{
 const s=groupStats([ret([]),match([],{id:2,aName:'Alicia',bName:'Ciro',np:true,npReason:'injury',injurySide:0})]);
 const a=s.find(s=>s.name==='Alicia'),c=s.find(s=>s.name==='Ciro');assert.equal(a.pts,3);assert.equal(a.gw,0);assert.equal(a.sg,0);assert.equal(a.nj,1);assert.equal(c.pts,0);assert.equal(c.nj,1);
});
