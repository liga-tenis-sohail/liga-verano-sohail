'use strict';
// Offline navigation contract. Runs the full current UI module with a minimal
// DOM. Server authorization is covered by the existing regression/security suites.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/ui-modern.js'),'utf8');
function harness(role='player'){
 class Element{
  constructor(){this.style={};this.dataset={};this.children=[];this.attrs={};this.innerHTML='';this.textContent='';this.className='';}
  setAttribute(k,v){this.attrs[k]=String(v);}
  append(...els){for(const e of els){e.parent=this;this.children.push(e);}}
  prepend(e){e.parent=this;this.children.unshift(e);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this);}
 }
 const ids=Object.fromEntries(['tabs','view-cargar','view-pendientes','pend-list','pend-title'].map(k=>[k,new Element()]));
 const doc={getElementById:id=>ids[id]||null,addEventListener(){},createElement:()=>new Element(),querySelectorAll:selector=>{
  const out=[];function walk(e){if(selector==='.ui-league-results-nav'&&e.className===selector.slice(1))out.push(e);e.children.forEach(walk);}
  Object.values(ids).forEach(walk);return out;
 }};
 const ctx={document:doc,TRANSLATIONS:{es:{},en:{}},currentUser:role?{key:'Alicia',name:'Alicia',role}:null,_ligaReadOnly:false,_ligaActual:'liga-a',subView:'grupos',viewCycle:1,activeN:1,selGroup:1,RATING_ON:true,REGLAMENTO:'<p>Reglas</p>',playoff:{started:false,preview:false},matches:[],cycles:[{n:1,groups:[{players:['Alicia','Beto']}]}],LANG:'es',attr:v=>String(v),esAdmin:u=>!!u&&['admin','superadmin'].includes(u.role),updateBadge(){},toast(){},groupName:n=>'Grupo '+n,canLeaveResult:true,SohailResults:{isSaving:()=>false,canLeave:()=>ctx.canLeaveResult}};
 ctx.t=k=>ctx.TRANSLATIONS[ctx.LANG][k]||k;
 ctx.window=ctx;ctx.showSub=n=>{ctx.subView=n;ctx.SohailUI.tabDefs();if(n==='pendientes')ctx.SohailUI.renderPending();ctx.SohailUI.afterView();};
 vm.createContext(ctx);vm.runInContext(source,ctx,{filename:'public/ui-modern.js'});
 const tabs=()=>{ctx.SohailUI.tabDefs();return [...ids.tabs.innerHTML.matchAll(/data-ui-route="([^"]+)"/g)].map(m=>m[1]);};
 return{ctx,ids,tabs,subnav:()=>doc.querySelectorAll('.ui-league-results-nav')[0]};
}
for(const role of ['player','admin','superadmin'])for(const po of [false,true])test(`NAV tabs: ${role}, playoffs ${po}, Rules last`,()=>{
 const h=harness(role);h.ctx.playoff.started=po;
 assert.deepEqual(h.tabs(),['grupos','general','rating',...(po?['po']:[]),'liga-resultados','reglamento']);
 assert.equal(h.ctx.SohailUI.allowed('liga-resultados'),true);
 h.ctx.SohailUI.openLeagueResults();assert.equal(h.ctx.subView,'cargar');
 assert.equal(h.tabs().at(-1),'reglamento');assert.equal(h.subnav().children[0].dataset.uiLeagueResult,'cargar');
 h.ctx.SohailUI.openLeagueResults('pendientes');assert.equal(h.ctx.subView,'pendientes');assert.ok(h.tabs().includes('liga-resultados'));
 assert.match(h.ids.tabs.innerHTML,/id="tab-liga-resultados"[^>]+aria-current="page"/);
});
test('NAV disabled Rating does not remove shared results or move Rules',()=>{
 const h=harness();h.ctx.RATING_ON=false;assert.deepEqual(h.tabs(),['grupos','general','liga-resultados','reglamento']);
});
test('NAV playoffs preview remains admin-only',()=>{
 const h=harness();h.ctx.playoff.preview=true;assert.ok(!h.tabs().includes('po'));h.ctx.currentUser.role='admin';assert.ok(h.tabs().includes('po'));assert.equal(h.tabs().at(-1),'reglamento');
});
test('NAV read-only league exposes no result entry for any role',()=>{
 for(const role of ['player','admin','superadmin']){const h=harness(role);h.ctx._ligaReadOnly=true;assert.equal(h.ctx.SohailUI.allowed('liga-resultados'),false);assert.ok(!h.tabs().includes('liga-resultados'));h.ctx.SohailUI.openLeagueResults();assert.equal(h.ctx.subView,'grupos');}
});
test('NAV visitor and unknown role cannot open the new entry',()=>{
 for(const role of [null,'visitor']){const h=harness(role);assert.equal(h.ctx.SohailUI.allowed('liga-resultados'),false);h.ctx.SohailUI.openLeagueResults();assert.equal(h.ctx.subView,'grupos');}
});
test('NAV player cannot enter admin routes or invoke bulk validation',async()=>{
 const h=harness();for(const n of ['admin','jugadores','resumen','historial'])assert.equal(h.ctx.SohailUI.allowed(n),false,n);
 assert.equal(await h.ctx.SohailUI.validateSelected([1]),false);
});
test('NAV review badge and list both include only the player matches in current cycle',()=>{
 const h=harness();const m=(id,a,b,cycle=1,status='pending')=>({id,aName:a,bName:b,cycle,status,g:1,sets:[[6,3],[6,2]]});
 h.ctx.matches=[m(1,'Alicia','Beto'),m(2,'Ciro','Diego'),m(3,'Alicia','Ciro',1,'disputed'),m(4,'Alicia','Elena',2),m(5,'Alicia','Diego',1,'confirmed')];
 h.ctx.SohailUI.openLeagueResults('pendientes');assert.match(h.subnav().children[1].textContent,/ · 2$/);
 assert.match(h.ids['pend-list'].innerHTML,/data-ui-match="1"/);assert.match(h.ids['pend-list'].innerHTML,/data-ui-match="3"/);
 for(const id of [2,4,5])assert.ok(!h.ids['pend-list'].innerHTML.includes(`data-ui-match="${id}"`));assert.ok(!h.ids['pend-list'].innerHTML.includes('ui-pending-select'));
});
test('NAV admin review keeps league-wide current-cycle scope and validation controls',()=>{
 const h=harness('admin');h.ctx.matches=[{id:1,cycle:1,g:1,aName:'Beto',bName:'Ciro',status:'pending',sets:[]}];
 h.ctx.SohailUI.openLeagueResults('pendientes');assert.match(h.subnav().children[1].textContent,/ · 1$/);assert.match(h.ids['pend-list'].innerHTML,/ui-pending-select/);
});
test('NAV playoff review badge excludes foreign draws and regular-cycle games for player',()=>{
 const h=harness();h.ctx.viewCycle='po';h.ctx.playoff.started=true;
 h.ctx.matches=[{id:1,po:true,poNames:['Alicia','Beto'],status:'pending',sets:[]},{id:2,po:true,poNames:['Ciro','Diego'],status:'pending',sets:[]},{id:3,po:false,aName:'Alicia',bName:'Ciro',cycle:1,status:'pending',sets:[]}];
 h.ctx.SohailUI.openLeagueResults('pendientes');assert.match(h.subnav().children[1].textContent,/ · 1$/);assert.ok(!h.ids['pend-list'].innerHTML.includes('data-ui-match="2"'));
});
test('NAV canceled dirty-draft navigation leaves entry and selection unchanged',()=>{
 const h=harness();h.ctx.SohailUI.openLeagueResults();h.ctx.canLeaveResult=false;h.ctx.SohailUI.openLeagueResults('pendientes');assert.equal(h.ctx.subView,'cargar');assert.ok(h.tabs().includes('liga-resultados'));
});
test('NAV reselecting the shared parent keeps Review active',()=>{
 const h=harness();h.ctx.SohailUI.openLeagueResults('pendientes');h.ctx.SohailUI.go('liga-resultados');assert.equal(h.ctx.subView,'pendientes');
});
test('NAV Matches access remains separate from League entry',()=>{
 const h=harness();h.ctx.SohailUI.openLeagueResults('pendientes');h.ctx.SohailUI.go('cargar');assert.deepEqual(h.tabs(),['partidos','cargar','pendientes']);
});
test('NAV session or league change invalidates old shared-entry navigation state',()=>{
 for(const change of [c=>c._ligaActual='liga-b',c=>c.currentUser={name:'Beto',key:'Beto',role:'player'}]){const h=harness();h.ctx.SohailUI.openLeagueResults();change(h.ctx);assert.deepEqual(h.tabs(),['partidos','cargar','pendientes']);}
});
test('NAV same-cycle group remains selected when opening and closing shared entry',()=>{
 const h=harness();h.ctx.selGroup=4;h.ctx.SohailUI.openLeagueResults('pendientes');assert.equal(h.ctx.selGroup,4);assert.equal(h.ctx.viewCycle,1);h.ctx.SohailUI.go('reglamento');assert.equal(h.ctx.viewCycle,1);assert.equal(h.ctx.selGroup,4);
});
test('NAV translated label and module retain a single versioned HTML load',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');const strings=fs.readFileSync(path.join(__dirname,'../public/i18n-revision.js'),'utf8');
 assert.equal((html.match(/<script\s+src="ui-modern\.js\?/g)||[]).length,1);assert.match(html,/ui-modern\.js\?v=[a-z0-9-]+/);
 assert.match(strings,/ui36_result_tools:'Cargar y revisar'/);assert.match(strings,/ui36_result_tools:'Report & review'/);
});
