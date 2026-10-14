'use strict';
// Offline tests: actual notification functions and full UI module, fake DOM.
// No network, SQL, credentials or league data are used or changed.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const core=fs.readFileSync(path.join(root,'public/core-estado.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'public/ui-modern.js'),'utf8');
const from=core.indexOf('function matchNotificationCounts() {'),to=core.indexOf('// Pinta el desplegable',from);
assert.ok(from>=0&&to>from,'notification functions must exist in the shipped core');
const notifications=core.slice(from,to);
const clone=v=>JSON.parse(JSON.stringify(v));
const m=(id=1,over={})=>({id,cycle:1,g:1,aName:'Alicia',bName:'Beto',status:'pending',...over});
function harness(role='admin',records=[m()]){
 const badges=[],ids={},buttons=[];
 function button(label,route){return {dataset:{uiRoute:route},attrs:{},title:'',label,
  querySelector(s){return s==='[data-ui-nav-label]'?{textContent:this.label}:null;},
  setAttribute(k,v){this.attrs[k]=String(v);},removeAttribute(k){delete this.attrs[k];if(k==='title')this.title='';}};}
 for(const [label,route]of [['Partidos','partidos'],['Partidos','partidos'],['Partidos','partidos'],['Revisión','pendientes'],['Revisión','pendientes']]){
  const parent=button(label,route);buttons.push(parent);
  badges.push({textContent:'0',hidden:true,style:{display:'none'},closest:s=>s==='button'?parent:null});
 }
 ids['pend-n']=badges[3];
 const ctx={TRANSLATIONS:{es:{},en:{}},LANG:'es',window:null,
  currentUser:role?{role,name:'Alicia',key:'Alicia'}:null,_ligaReadOnly:false,_ligaActual:'liga-a',
  USERS:{Alicia:{role:'player'},Beto:{role:'player'},Ciro:{role:'player'},Dora:{role:'player'}},matches:records,
  cycles:[{n:1,groups:[{players:['Alicia','Beto']}]}],activeN:1,viewCycle:1,selGroup:1,subView:'partidos',
  playoff:{started:false,preview:false,tramos:[]},RATING_ON:true,REGLAMENTO:'<p>Reglas</p>',
  attr:v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  esAdmin:u=>!!u&&(['admin','superadmin'].includes(u.role)||u.isAdmin===true),
  document:{getElementById:id=>ids[id]||null,querySelectorAll:s=>s==='[data-ui-match-count]'?badges:[],addEventListener(){}},
  fetch(){assert.fail('notifications must not fetch');},setTimeout(){assert.fail('no new timers');},setInterval(){assert.fail('no polling');},
  localStorage:{getItem(){assert.fail('no persistent count');},setItem(){assert.fail('no persistent count');}},
  toast(){},SohailResults:{isSaving:()=>false,canLeave:()=>true}};
 ctx.window=ctx;ctx.t=k=>ctx.TRANSLATIONS[ctx.LANG]?.[k]||ctx.TRANSLATIONS.es[k]||k;
 ctx.tf=(k,vars)=>ctx.t(k).replace(/\{(\w+)\}/g,(_,n)=>String(vars[n]));
 ctx.showSub=n=>{ctx.subView=n;};
 vm.createContext(ctx);vm.runInContext(notifications,ctx,{filename:'core-estado.js/notifications'});
 vm.runInContext(ui,ctx,{filename:'ui-modern.js'});
 return {ctx,badges,buttons,ids,counts:()=>clone(ctx.matchNotificationCounts()),update:()=>ctx.updateBadge()};
}
for(const role of ['admin','superadmin']){
 test(`N513 ${role}: pending and disputed together`,()=>{const h=harness(role,[m(1),m(2,{status:'disputed'}),m(3,{status:'confirmed'})]);assert.deepEqual(h.counts(),{pending:1,disputed:1,total:2});});
 test(`N513 ${role}: foreign participants included in league review`,()=>{assert.equal(harness(role,[m(1,{aName:'Ciro',bName:'Dora'})]).counts().total,1);});
}
test('N513 delegated player admin sees league-wide review',()=>{const h=harness('player',[m(1,{aName:'Ciro',bName:'Dora'})]);h.ctx.currentUser.isAdmin=true;assert.equal(h.counts().total,1);});
test('N513 player sees own pending plus own dispute only',()=>{const h=harness('player',[m(),m(2,{status:'disputed'}),m(3,{aName:'Ciro',bName:'Dora'}),m(4,{aName:'Ciro',bName:'Dora',status:'disputed'})]);assert.deepEqual(h.counts(),{pending:1,disputed:1,total:2});});
test('N513 a player sees their own dispute even with no pending matches',()=>assert.equal(harness('player',[m(1,{status:'disputed'})]).counts().total,1));
test('N513 reporter is not used to claim someone else’s match',()=>assert.equal(harness('player',[m(1,{aName:'Ciro',bName:'Dora',reporter:'Alicia'})]).counts().total,0));
test('N513 playoff participants use poNames',()=>{const h=harness('player',[m(1,{po:true,poNames:['Ciro','Alicia']}),m(2,{po:true,poNames:['Ciro','Dora'],aName:'Alicia',status:'disputed'})]);assert.equal(h.counts().total,1);});
test('N513 changing selected cycle/group does not hide league-wide notices',()=>{const h=harness('player',[m(),m(2,{cycle:2,status:'disputed'}),m(3,{po:true,poNames:['Alicia','Ciro']})]);for(const cycle of [1,2,'po']){h.ctx.viewCycle=cycle;h.ctx.selGroup=5;assert.equal(h.counts().total,3);}});
test('N513 confirmed matches and unplayed injury records do not create alerts',()=>{const h=harness('admin',[m(1,{status:'confirmed'}),m(2,{status:'confirmed',np:true,npReason:'injury'}),m(3,{status:undefined})]);assert.equal(h.counts().total,0);});
test('N513 pending RET/W.O. are included; confirmed ones are not',()=>{const h=harness('admin',[m(1,{wo:true,sets:[[1,6],[0,4]]}),m(2,{wo:true,sets:[]}),m(3,{wo:true,status:'confirmed'})]);assert.equal(h.counts().total,2);});
test('N513 preserves exclusion of pending matches with both accounts inactive',()=>{const h=harness();h.ctx.USERS.Alicia.inactive=true;h.ctx.USERS.Beto.inactive=true;assert.equal(h.counts().total,0);});
test('N513 one inactive account still counts for admin',()=>{const h=harness();h.ctx.USERS.Beto.inactive=true;assert.equal(h.counts().total,1);});
test('N513 disputes with inactive accounts still require attention',()=>{const h=harness('admin',[m(1,{status:'disputed'})]);h.ctx.USERS.Alicia.inactive=true;h.ctx.USERS.Beto.inactive=true;assert.equal(h.counts().total,1);});
test('N513 visitor has no notices',()=>assert.equal(harness(null).counts().total,0));
test('N513 readonly never exposes notification counts',()=>{const h=harness();h.ctx._ligaReadOnly=true;assert.equal(h.counts().total,0);});
test('N513 absent/non-array match collection is safe',()=>{for(const value of [null,undefined,{},'bad']){const h=harness();h.ctx.matches=value;assert.equal(h.counts().total,0);}});
test('N513 malformed rows cannot crash or claim another participant',()=>{const h=harness('player',[null,{},m(1,{po:true,poNames:null}),m(2,{aName:null}),m(3,{po:true,poNames:'Alicia'}),m(4,{bName:'Alicia'}),m(5,{po:true,poNames:['Alicia','Beto','Ciro']})]);assert.equal(h.counts().total,0);});
test('N513 counts never alter records, accounts, status or league',()=>{const h=harness('player',[m(),m(2,{status:'disputed'})]);const before=JSON.stringify([h.ctx.matches,h.ctx.USERS,h.ctx.currentUser,h.ctx._ligaActual]);for(let i=0;i<10;i++)h.update();assert.equal(JSON.stringify([h.ctx.matches,h.ctx.USERS,h.ctx.currentUser,h.ctx._ligaActual]),before);});
test('N513 pending to dispute counts once; confirmation removes the alert',()=>{const h=harness();h.update();assert.equal(h.badges[0].textContent,'1');h.ctx.matches[0].status='disputed';h.update();assert.equal(h.badges[0].textContent,'1');h.ctx.matches[0].status='confirmed';h.update();assert.ok(h.badges.every(b=>b.hidden));});
test('N513 removal updates all badges, not a separate unread counter',()=>{const h=harness();h.update();h.ctx.matches=[];h.update();assert.ok(h.badges.every(b=>b.hidden&&b.style.display==='none'));});
test('N513 all Matches and Review badges agree',()=>{const h=harness('admin',[m(),m(2,{status:'disputed'})]);h.update();assert.ok(h.badges.every(b=>!b.hidden&&b.textContent==='2'));});
test('N513 no unread reset when opening Matches',()=>{const h=harness();h.update();h.ctx.SohailUI.go('partidos');h.update();assert.equal(h.badges[0].textContent,'1');assert.equal(h.ctx.matches[0].status,'pending');});
test('N513 logout clears all badges and accessible descriptions',()=>{const h=harness();h.update();h.ctx.currentUser=null;h.update();assert.ok(h.badges.every(b=>b.hidden));assert.ok(h.buttons.every(b=>!b.attrs['aria-label']&&!b.title));});
test('N513 switching account recalculates instead of keeping previous count',()=>{const h=harness('player',[m()]);h.update();h.ctx.currentUser={name:'Dora',role:'player'};h.update();assert.ok(h.badges.every(b=>b.hidden));});
test('N513 switching league to loaded empty state removes the old count',()=>{const h=harness();h.update();h.ctx._ligaActual='liga-b';h.ctx.matches=[];h.update();assert.ok(h.badges.every(b=>b.hidden));});
test('N513 public view clears previously rendered private notices',()=>{const h=harness();h.update();h.ctx._ligaReadOnly=true;h.update();assert.ok(h.badges.every(b=>b.hidden));});
test('N513 ES/EN accessible breakdown and no translated player names',()=>{const h=harness('player',[m(),m(2,{status:'disputed'})]);h.update();assert.match(h.buttons[0].attrs['aria-label'],/Pendientes: 1 · En disputa: 1/);h.ctx.LANG='en';for(const b of h.buttons)b.label=b.dataset.uiRoute==='partidos'?'Matches':'Review';h.update();assert.match(h.buttons[0].attrs['aria-label'],/^Matches · Selected league · Pending: 1 · Disputed: 1$/);assert.equal(h.ctx.currentUser.name,'Alicia');});
test('N513 large count stays compact, accessible count stays exact',()=>{const h=harness('admin',Array.from({length:105},(_,i)=>m(i)));h.update();assert.ok(h.badges.every(b=>b.textContent==='99+'));assert.match(h.buttons[0].attrs['aria-label'],/Pendientes: 105/);assert.equal(h.counts().total,105);});
test('N513 missing DOM nodes and legacy-only Review are supported',()=>{const h=harness();delete h.ids['pend-n'];h.update();assert.equal(h.badges[0].textContent,'1');delete h.ctx.SohailUI;h.update();});
test('N513 bad paint input does not inject markup or NaN',()=>{const h=harness();h.ctx.SohailUI.updateMatchNotifications({pending:'<svg onload=bad()>',disputed:NaN});assert.ok(h.badges.every(b=>b.hidden&&b.textContent==='0'));});
test('N513 new upper tabs include both badges, only one pend-n ID',()=>{const h=harness();h.ids.tabs={style:{},innerHTML:''};h.ctx.SohailUI.tabDefs();const html=h.ids.tabs.innerHTML;assert.equal((html.match(/data-ui-match-count/g)||[]).length,2);assert.equal((html.match(/id="pend-n"/g)||[]).length,1);assert.match(html,/id="tab-partidos"[^]*?data-ui-match-count/);});
test('N513 navigation remains guarded during a result save',()=>{const h=harness();h.ctx.SohailResults.isSaving=()=>true;h.ctx.subView='cargar';h.ctx.SohailUI.go('partidos');assert.equal(h.ctx.subView,'cargar');});
test('N513 public and admin routes are not opened by a badge',()=>{const h=harness('player');for(const route of ['admin','jugadores','resumen','historial'])assert.equal(h.ctx.SohailUI.allowed(route),false);h.ctx._ligaReadOnly=true;assert.equal(h.ctx.SohailUI.allowed('partidos'),false);});
test('N513 all modified JS parses, including core outside the tested helper',()=>{assert.doesNotThrow(()=>new vm.Script(core));assert.doesNotThrow(()=>new vm.Script(ui));});
test('N513 scoped CSS hides zero, positions mobile, keeps semantic text legible',()=>{const css=fs.readFileSync(path.join(root,'public/ui-modern.css'),'utf8');assert.match(css,/\.ui-v3 \.ui-match-count\[hidden\]\{display:none!important\}/);assert.match(css,/\.ui-bottom \.ui-nav-item>\.ui-match-count/);assert.match(css,/background:#c0392b!important;color:#fff!important/);});
