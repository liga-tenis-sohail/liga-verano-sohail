'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const E=require('../api/_rating-engine'),X=require('../public/rating-explainer');
const V=require('../scripts/validate-rating.cjs');
const {create}=require('../public/rating-client');
const date=i=>new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10);
const u=n=>({historialId:n}),names=['A','B','C','D','E','F','G','H','I','J'];
const match=(id,a='A',b='B',extra={})=>({id,aName:a,bName:b,sets:[[6,4],[6,4]],status:'confirmed',date:date(id),...extra});
const league=(matches,users=Object.fromEntries(names.map(n=>[n,u(n)])),id='l')=>({id,users,matches,cycles:[]});
const calc=(matches,options={})=>E.calculate(E.prepare([league(matches)]),{asOf:date(300),...options});
const person=(r,n='A')=>r.info[r.byLeague.l[n]];
function balanced(id,a,b){return match(id,a,b,{sets:[[6,4],[4,6],[id%2,1-id%2]]});}
test('RT450 version and mandatory 50-window are explicit',()=>{assert.equal(E.VERSION,'sohail-rating-4.6.0');assert.equal(E.DEFAULTS.window,50);assert.throws(()=>calc([match(1)],{window:49}),e=>e.code==='INVALID_WINDOW');});
test('RT450 own repeated pairing cannot manufacture independent opponent evidence',()=>{const r=calc(Array.from({length:50},(_,i)=>match(i))),a=person(r);assert.equal(a.partidos,50);assert.equal(a.selected.length,50);assert.ok(a.selected.every(m=>m.independentOpponentMatches===0&&m.opponentWeight===1));assert.equal(a.opponentIndependentSupport,0);assert.ok(a.confidenceReasons.includes('limited-opponent-support'));});
test('RT450 independent play raises support while keeping the same target match',()=>{const base=calc([match(100)]),ms=[];for(let i=0;i<30;i++)ms.push(balanced(i,'B',names[2+i%6]));ms.push(match(100));const r=calc(ms),a=person(r);assert.equal(a.partidos,1);assert.equal(a.selected[0].independentOpponentMatches,30);assert.equal(a.selected[0].independentOpponentDiversity,6);assert.ok(a.opponentIndependentSupport>person(base).opponentIndependentSupport);});
test('RT450 all new opponents remain positive evidence, never a hard exclusion',()=>{const r=calc(names.slice(1).map((n,i)=>match(i,'A',n))),a=person(r);assert.equal(a.partidos,9);assert.ok(a.selected.every(m=>m.weight>0));});
test('RT450 very old selected matches remain above the product of positive floors',()=>{const ms=Array.from({length:50},(_,i)=>match(i,'A','B',{date:i?date(i):'1999-01-01'})),a=person(calc(ms));assert.equal(a.partidos,50);assert.ok(a.selected.every(m=>m.weight>=E.DEFAULTS.timeFloor*E.DEFAULTS.opponentFloor));});
test('RT450 support diagnosis does not discard any of the 50 selected record IDs',()=>{const ms=Array.from({length:70},(_,i)=>match(i));const r=person(calc(ms));assert.deepEqual(r.selected.map(m=>JSON.parse(m.key)[1]),Array.from({length:50},(_,i)=>'id:'+(69-i)));});
test('RT450 support uses at most the rival retained window',()=>{const ms=Array.from({length:65},(_,i)=>match(i,'B',names[2+i%6]));ms.push(match(100));assert.equal(person(calc(ms)).selected[0].independentOpponentMatches,49);});
test('RT450 ratings are deterministic under reordered leagues and users',()=>{const a=league([match(1)],{A:u('A'),B:u('B')},'l'),b=league([match(2,'A','C')],{C:u('C'),A:u('A')},'m');const x=E.calculate(E.prepare([a,b])),y=E.calculate(E.prepare([b,a]));assert.deepEqual(x.info,y.info);});
test('RT450 calculator does not mutate the prepared sporting input',()=>{const d=E.prepare([league([match(1),match(2,'B','C')])]),original=JSON.stringify(d);E.calculate(d);assert.equal(JSON.stringify(d),original);});
test('RT450 changing date of evaluation alone does not change numeric skill',()=>{const ms=Array.from({length:40},(_,i)=>match(i,'A',names[1+i%6])),a=person(calc(ms,{asOf:date(50)})),b=person(calc(ms,{asOf:'2035-01-01'}));assert.equal(a.rating,b.rating);assert.ok(a.fiab>=b.fiab);assert.ok(b.confidenceReasons.includes('inactivity'));});
test('RT450 topology identifies a thin link between otherwise dense groups',()=>{const ms=[balanced(1,'A','B'),balanced(2,'B','C'),balanced(3,'C','A'),balanced(4,'D','E'),balanced(5,'E','F'),balanced(6,'F','D'),balanced(7,'C','D')];const r=calc(ms);assert.equal(r.weakBridgeCount,1);for(const n of ['A','B','C','D','E','F'])assert.equal(person(r,n).weakConnections,true);});
test('RT450 a second independent cross-link removes bridge fragility',()=>{const ms=[balanced(1,'A','B'),balanced(2,'B','C'),balanced(3,'C','A'),balanced(4,'D','E'),balanced(5,'E','F'),balanced(6,'F','D'),balanced(7,'C','D'),balanced(8,'B','E')];assert.equal(calc(ms).weakBridgeCount,0);});
test('RT450 disconnected groups stay explicitly distinct even with dense within-group play',()=>{const r=calc([balanced(1,'A','B'),balanced(2,'B','C'),balanced(3,'C','A'),balanced(4,'D','E'),balanced(5,'E','F'),balanced(6,'F','D')]);assert.equal(r.componentCount,2);assert.ok(person(r).confidenceReasons.includes('disconnected'));});
test('RT450 details keep real winner, actual games and the two weight factors',()=>{const r=person(calc([match(1,'A','B',{sets:[[7,5],[3,6],[1,0]]})])),m=r.selected[0];assert.equal(r.vict,1);assert.equal(m.won,true);assert.equal(m.gamesFor,10);assert.equal(m.gamesAgainst,11);assert.equal(m.weight,m.timeWeight*m.opponentWeight);assert.equal(m.opponentKey,'["profile","B"]');});
test('RT450 support is a bounded evidence score, never labelled as probability',()=>{const ms=Array.from({length:50},(_,i)=>match(i,'A',names[1+i%8])),r=calc(ms);for(const p of Object.values(r.info)){assert.ok(p.opponentIndependentSupport>=0&&p.opponentIndependentSupport<=1);assert.ok(p.fiab<=95);}});
for(const floor of [0,-0.2,1.1,Infinity,NaN])test('RT450 rejects invalid opponent floor '+floor,()=>assert.throws(()=>calc([match(1)],{opponentFloor:floor}),e=>e.code==='INVALID_CONFIG'));
test('RT450 browser rejects old engine even when its payload looks complete',async()=>{const c=create({getToken:()=>'',fetcher:async()=>({ok:true,json:async()=>({complete:true,window:50,version:'sohail-rating-4.4.0',snapshot:'old',info:{},byLeague:{},leagues:[]})})});await c.load();assert.equal(c.peek().data,null);assert.match(c.peek().error.message,/versión/);});
for(const lang of ['es','en'])test('RT450 full permanent legend in '+lang,()=>{const html=X.render(E.DEFAULTS,lang);for(const text of lang==='es'?['Cómo funciona el Rating Sohail','50','No es un UTR oficial','8 de Sohail','super','W.O.','V–D','GG–GP','Calc. global','Confianza','Semivida'.toLowerCase()]:['How the Sohail Rating works','50','not an official UTR','Sohail 8','tiebreak','W.O.','W–L','GW–GL','Global calc.','Confidence','half-life'])assert.ok(html.includes(text),text);assert.ok(html.startsWith('<section'));assert.match(html,/aria-labelledby="rating-guide-title"/);assert.equal((html.match(/<details /g)||[]).length,4);});
test('RT450 legend reflects versioned model values, not hardcoded misleading percentages',()=>{const html=X.render({halfLifeDays:480,timeFloor:0.35,opponentFloor:0.85,stbEvidence:0.4});assert.ok(html.includes('480 días'));assert.ok(html.includes('35%'));assert.ok(html.includes('0.85'));assert.ok(html.includes('0.40 unidades'));});
test('RT450 untrusted legend values and reason codes cannot inject HTML',()=>{const html=X.render({halfLifeDays:'<img src=x onerror=alert(1)>'});assert.ok(!html.includes('<img'));assert.deepEqual(X.reasonTexts(['<script>','few-matches','few-matches']),['Menos de 15 partidos: estimación todavía provisional.']);});
test('RT450 repeated rival explanation says diagnostic exclusion, not dropped rating matches',()=>{assert.match(X.render(),/solo de ese diagnóstico/);assert.match(X.render(),/tus partidos siguen en tu cálculo/);});
test('RT450 confidence explanation rejects both win-certainty and official equivalence',()=>{const s=X.render();assert.match(s,/no es una probabilidad de victoria/);assert.match(s,/no demuestra un UTR 8/);});
test('RT450 legend resides below table, outside its internal scroll',()=>{const ui=fs.readFileSync(path.join(__dirname,'../public/rating.js'),'utf8');assert.ok(ui.includes('</div>${guide(d.method)}'));assert.ok(ui.indexOf('guide(d.method)')>ui.indexOf('</tbody></table></div>'));});
test('RT450 new explainer is present before the UI in the shipped page',()=>{const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');assert.ok(html.indexOf('rating-explainer.js?v=sohail-v460-unified-experience')<html.indexOf('rating.js?v=sohail-v460-unified-experience'));assert.ok(html.includes('sohail-v460-unified-experience'));});
test('RT450 reporting stays numerical and never exports personal fields',()=>{const data={leagues:[{...league([match(1),match(5),match(10),match(15)]),users:{A:{...u('A'),email:'private@example.test',pass:'secret'},B:u('B')}}]};const r=V.report(data);const text=JSON.stringify(r);assert.ok(!text.includes('private@example.test'));assert.ok(!text.includes('secret'));assert.equal(r.counts.eligible,4);assert.equal(r.development.candidate.matches+r.holdout.candidate.matches,4);});
test('RT450 development selection never evaluates a holdout date',()=>{const r=V.evaluate({leagues:[league(Array.from({length:10},(_,i)=>match(i)))]},{phase:'development'});assert.equal(r.rows.length,7);assert.ok(r.rows.every(x=>x.split==='development'));});
test('RT450 no look-ahead: modifying a later outcome preserves all earlier predictions',()=>{const input={leagues:[league(Array.from({length:8},(_,i)=>match(i)))]},a=V.evaluate(input);input.leagues[0].matches[7].sets=[[0,6],[0,6]];const b=V.evaluate(input);assert.deepEqual(a.rows.map(x=>[x.newGames,x.oldGames]),b.rows.map(x=>[x.newGames,x.oldGames]));});
test('RT450 same-day results do not train each other',()=>{const input={leagues:[league([match(1),match(2,'A','B',{date:date(1)}),match(3)])]},a=V.evaluate(input);assert.equal(a.rows[0].newGames,a.rows[1].newGames);});
test('RT450 dates cannot be fabricated to obtain a chronological evaluation',()=>{const r=V.evaluate({leagues:[league([match(1,'A','B',{date:''}),match(2)])]});assert.equal(r.counts.eligible,2);assert.equal(r.counts.undated,1);assert.equal(r.rows.length,1);assert.equal(r.rows[0].windowA,0);assert.equal(person(calc([match(1,'A','B',{date:''}),match(2)])).partidos,2);});
test('RT450 global chronology uses confirmed cross-league identity links',()=>{const input={leagues:[league([match(1)]),league([match(5,'A alias','C')],{'A alias':u('A'),C:u('C')},'past')]};const r=V.evaluate(input);assert.equal(r.rows[1].windowA,1);});
test('RT450 manual seeds remain excluded from prediction evaluation without timestamps',()=>{const input={leagues:[{...league([match(1),match(5)]),seeds:{A:16},RATING_SEEDS:{A:16}}]},a=V.evaluate(input);input.leagues[0].seeds.A=1;input.leagues[0].RATING_SEEDS.A=1;assert.deepEqual(a.rows,V.evaluate(input).rows);});
test('RT450 paired date-block audit is deterministic and describes its limits',()=>{const rows=[{date:'2026-01-01',oldGames:0.9,newGames:0.6,games:0.5},{date:'2026-01-01',oldGames:0.9,newGames:0.6,games:0.5},{date:'2026-01-02',oldGames:0.8,newGames:0.6,games:0.5}];const a=V.resample(rows,200);assert.deepEqual(a,V.resample(rows,200));assert.equal(a.blocks,2);assert.ok(a.interval[0]>0);assert.match(a.method,/exploratory/);});

// A failed candidate cannot accidentally become the live rating formula.
test('RT450 live numeric model stays exactly equal to v4.4 while confidence improves',()=>{
 const old=require('./support/rating-v440.cjs');
 const ms=Array.from({length:130},(_,i)=>balanced(i,names[i%10],names[(i+1+(Math.floor(i/10)%8))%10]));
 const data=E.prepare([league(ms)]),a=old.calculate(data,{asOf:date(200)}),b=E.calculate(data,{asOf:date(200)});
 assert.equal(E.DEFAULTS.opponentMode,'count');
 for(const key of Object.keys(a.info)){assert.equal(a.info[key].rating,b.info[key].rating);assert.equal(a.info[key].partidos,b.info[key].partidos);assert.ok(b.info[key].fiab<=a.info[key].fiab);}
});
test('RT450 experimental independence weighting is explicit offline and still keeps all 50',()=>{
 const a=person(calc(Array.from({length:50},(_,i)=>match(i)),{opponentMode:'independent',opponentFloor:0.75}));
 assert.equal(a.partidos,50);assert.ok(a.selected.every(m=>m.opponentWeight===0.75));
});
test('RT450 future or mostly missing dates cannot show medium/high confidence',()=>{
 const r=calc(Array.from({length:50},(_,i)=>match(i,'A',names[1+i%8],{date:''})));
 assert.ok(person(r).fiab<40);assert.equal(person(r).confidence,'low');
});
test('RT450 a newcomer leaf does not mark an established group as fragile',()=>{
 const ms=[balanced(1,'A','B'),balanced(2,'B','C'),balanced(3,'C','A'),balanced(4,'A','D')];
 const r=calc(ms);assert.equal(r.weakBridgeCount,0);assert.equal(person(r).weakConnections,false);assert.equal(person(r,'D').confidence,'low');
});
