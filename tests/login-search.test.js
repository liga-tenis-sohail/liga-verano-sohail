'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const S=require('../public/login-search'),X=require('../public/excel-loader');
const entries=[{value:'admin',label:'Organización'},{value:'José Pérez',label:'José Pérez'},{value:'Ana Pérez',label:'Ana Pérez'},
 {value:'JOSÉ García',label:'JOSÉ García'},{value:'superadmin',label:'Super Administrador'}];
test('SEARCH410 accents, case, surname and multiple tokens match without changing stored names',()=>{
 assert.equal(S.search(entries,'jose per')[0].value,'José Pérez');assert.equal(S.search(entries,'pérez').length,2);
 assert.equal(S.search(entries,'ADMIN')[0].value,'admin');assert.equal(entries[1].value,'José Pérez');
});
test('SEARCH410 no automatic first selection for empty, partial or ambiguous normalized names',()=>{
 assert.deepEqual(S.search(entries,''),[]);assert.equal(S.exact(entries,'jos'),null);
 assert.equal(S.exact([{value:'José',label:'José'},{value:'JOSE',label:'JOSE'}],'jose'),null);
 assert.equal(S.exact(entries,'  jose perez ').value,'José Pérez');
});
test('SEARCH410 exact username takes priority while unknown input cannot become a credential',()=>{
 assert.equal(S.exact(entries,'admin').value,'admin');assert.equal(S.exact(entries,'no-existe'),null);
 assert.deepEqual(S.search(entries,'no-existe'),[]);
});
test('SEARCH410 suggestion limit is bounded, entries are immutable and prefixes rank first',()=>{
 const many=Array.from({length:50},(_,i)=>({value:'Ana '+i,label:'Ana '+i}));const old=structuredClone(many);
 assert.equal(S.search(many,'ana').length,8);assert.equal(S.search(many,'ana',100).length,20);assert.deepEqual(many,old);
 assert.equal(S.search([{value:'Pedro Ana',label:'Pedro Ana'},{value:'Ana Pedro',label:'Ana Pedro'}],'ana')[0].value,'Ana Pedro');
});
test('SEARCH410 HTML-like names remain data, not markup or a network request',()=>{
 const malicious='<img src=x onerror=alert(1)>';assert.equal(S.search([{value:malicious,label:malicious}],'img')[0].label,malicious);
 const src=fs.readFileSync(path.join(__dirname,'../public/login-search.js'),'utf8');assert.ok(!src.includes('innerHTML'));assert.ok(!/\bfetch\s*\(/.test(src));
});
function fakeLoader(){let library;const scripts=[];const doc={createElement(){return {dataset:{},remove(){this.removed=true;}};},head:{append(s){scripts.push(s);}}};return {scripts,set:v=>library=v,ensure:X.createLoader(doc,()=>library,2000)};}
test('EXCEL410 one lazy load is shared across actions and reused after success',async()=>{
 const x=fakeLoader(),a=x.ensure(),b=x.ensure();assert.equal(a,b);assert.equal(x.scripts.length,1);assert.equal(x.scripts[0].src,X.URL);
 x.set({utils:{}});x.scripts[0].onload();await Promise.all([a,b]);await x.ensure();assert.equal(x.scripts.length,1);
});
test('EXCEL410 CDN failure is explicit and a subsequent action can retry',async()=>{
 const x=fakeLoader(),a=x.ensure();x.scripts[0].onerror();await assert.rejects(a);assert.equal(x.scripts[0].removed,true);
 const b=x.ensure();assert.equal(x.scripts.length,2);x.set({utils:{}});x.scripts[1].onload();await b;
});
test('EXCEL410 a script load without a library never counts as success',async()=>{
 const x=fakeLoader(),a=x.ensure();x.scripts[0].onload();await assert.rejects(a,/no está disponible/);
});
function bootstrap(){
 const paints=[],calls=[],storage=new Map(),node={style:{},textContent:''};let resolveList;
 const pending=new Promise(r=>resolveList=r);
 const context={_token:null,currentUser:null,_ligaActual:null,_sinLigasActivas:false,LOGIN_HEADER:{},LANG:'es',
  AbortSignal,console,Option:function(){},window:null,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  document:{getElementById:()=>node},t:k=>k,_conLiga:u=>u,
  fetch:async u=>{calls.push(u);return {ok:true,json:async()=>u==='/api/users'?pending:{links:[]}};}};
 context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/login-auth.js'),'utf8'),context);
 context.pintarLogin=d=>paints.push(JSON.parse(JSON.stringify(d)));context.renderLoginHeader=()=>{};
 return {context,paints,calls,storage,resolveList};
}
test('BOOT410 cached names paint immediately and network names do not wait for league metadata',async()=>{
 const x=bootstrap();x.storage.set('lsu',JSON.stringify({mode:'global',players:[{v:'Cached'}]}));
 let release;const metadata=new Promise(r=>release=r);let past=0;
 x.context.detectarLigaActiva=()=>metadata;x.context.cargarLigasPasadas=()=>past++;
 const running=x.context.initLogin();assert.equal(x.paints[0].players[0].v,'Cached');assert.ok(x.calls.includes('/api/users'));
 x.resolveList({mode:'global',players:[{v:'Fresh'}]});await running;assert.equal(x.paints.at(-1).players[0].v,'Fresh');assert.equal(past,0);
 release([]);await new Promise(setImmediate);assert.equal(past,1);
});
test('BOOT410 late user/header responses never overwrite a different login attempt',async()=>{
 const x=bootstrap();x.context.detectarLigaActiva=()=>new Promise(()=>{});
 const running=x.context.initLogin();x.context.cancelLoginInitialization();x.resolveList({mode:'global',players:[{v:'Stale'}]});await running;
 assert.equal(x.paints.length,1);assert.equal(x.storage.has('lsu'),false);
});
test('BOOT410 expired request cannot repopulate names after a session was authenticated',async()=>{
 const x=bootstrap();x.context.detectarLigaActiva=()=>new Promise(()=>{});const running=x.context.initLogin();
 x.context._token='new-session';x.context.currentUser={name:'Alicia'};x.resolveList({mode:'global',players:[{v:'Old'}]});await running;
 assert.equal(x.paints.length,1);
});
test('PACKAGE410 login retains native dropdown and names the combobox; Excel is not parser-blocking',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 assert.match(html,/<select id="login-user"/);assert.match(html,/id="login-user-search" role="combobox"/);
 assert.match(html,/aria-controls="login-user-suggestions"/);assert.ok(!/<script[^>]+src="https:[^"]*xlsx/.test(html));
 assert.ok(html.indexOf('excel-loader.js?v=')>html.indexOf('jugadores-perfiles.js?v='));
 assert.ok(html.includes('content="sohail-v410-login-bulk"'));
});
function wrappedExcel(){
 const scripts=[],calls=[],toasts=[];
 const context={console,setTimeout,clearTimeout,LANG:'es',_token:'session-a',_ligaActual:'liga-a',
  document:{createElement:()=>({dataset:{},remove(){this.removed=true;}}),head:{append:s=>scripts.push(s)}},
  toast:s=>toasts.push(s),exportBackup:async(...args)=>calls.push(args),importBackup:async(...args)=>calls.push(args)};
 context.window=context;vm.createContext(context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/excel-loader.js'),'utf8'),context);
 return {context,scripts,calls,toasts,ready(){context.XLSX={utils:{}};scripts[0].onload();}};
}
test('EXCEL410 wrappers defer download until action and never duplicate a pending action',async()=>{
 const x=wrappedExcel();assert.equal(x.scripts.length,0);const a=x.context.exportBackup();const b=x.context.exportBackup();
 assert.equal(x.scripts.length,1);assert.equal(x.calls.length,0);x.ready();await Promise.all([a,b]);assert.equal(x.calls.length,1);
 await x.context.exportBackup();assert.equal(x.calls.length,2);assert.equal(x.scripts.length,1);
});
test('EXCEL410 delayed download cannot act after a session or league switch',async()=>{
 for(const field of ['_token','_ligaActual']){
  const x=wrappedExcel(),a=x.context.exportBackup();x.context[field]='different';x.ready();await a;
  assert.equal(x.calls.length,0);assert.ok(x.toasts.some(s=>/cambió/.test(s)));
 }
});
test('EXCEL410 delayed download cannot import a replaced file',async()=>{
 const x=wrappedExcel(),input={files:[{}]},a=x.context.importBackup(input);input.files=[{}];x.ready();await a;
 assert.equal(x.calls.length,0);assert.ok(x.toasts.some(s=>/archivo cambió/.test(s)));
});
test('BOOT410 cosmetic header uses the detected league without holding up the user list',async()=>{
 const x=bootstrap();x.context._ligaActual='old';x.context._conLiga=u=>u+'?liga='+x.context._ligaActual;
 let release;const metadata=new Promise(r=>release=r);x.context.detectarLigaActiva=()=>metadata;x.context.cargarLigasPasadas=()=>{};
 const run=x.context.initLogin();assert.ok(x.calls.includes('/api/users'));assert.ok(!x.calls.some(u=>u.startsWith('/api/login-header')));
 x.resolveList({mode:'global',players:[{v:'Fresh'}]});await run;assert.equal(x.paints.at(-1).players[0].v,'Fresh');
 x.context._ligaActual='new';release([]);await new Promise(setImmediate);
 assert.ok(x.calls.includes('/api/login-header?liga=new'));assert.ok(!x.calls.includes('/api/login-header?liga=old'));
});
