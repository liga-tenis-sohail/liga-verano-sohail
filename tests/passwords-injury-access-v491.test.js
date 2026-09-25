'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const M=require('./support/mock-db.cjs'),L=M.lib,P=require('../api/_password-security');
const password=require('../api/password'),login=require('../api/login');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const request=(body,token='')=>({method:'POST',headers:{host:'sohail.test',origin:'https://sohail.test','content-type':'application/json','x-sohail-session':'1',authorization:'Bearer '+token},body,query:{}});
async function run(fn){const db=M.createDB(),old=global.fetch;global.fetch=db.fetch;try{return await fn(db);}finally{global.fetch=old;}}
test('491 policy uses minimum 6 and keeps maximum 128',()=>{assert.equal(P.MIN_LENGTH,6);assert.equal(P.MAX_LENGTH,128);});
for(const value of ['Roca!7','ab cd!','pádel7','🎾aBc!9','Roca!7'+'x'.repeat(122)])test('491 accepts permitted password length '+[...value].length,()=>assert.equal(P.policy(value),true));
for(const value of ['abcde','🟡🟢🔴','Roca!7'+'x'.repeat(123)])test('491 rejects too short/long '+value.length,()=>assert.equal(P.policy(value),false));
for(const value of ['123456','abcdef','qwerty','ABC123','aaaaaa','      ','password','tenis123','admin123'])test('491 common/default password stays blocked: '+value,()=>assert.equal(P.policy(value),false));
test('491 tenis remains exception ONLY for administrator temporary reset',()=>{assert.equal(P.policy('tenis'),false);assert.equal(P.policy('tenis',{temporary:true}),true);assert.equal(P.policy('other',{temporary:true}),false);assert.equal(P.policy('Roca!7',{temporary:true}),true);});
for(const name of ['admin','superadmin'])test('491 '+name+' may set a six-character temporary password without exposing previous password',()=>run(async db=>{
 const old=db.token('Alicia'),r=await M.call(password,request({target:'Alicia',newPass:'Roca!7'},db.token(name)));
 assert.equal(r.status,200);assert.equal(r.body.passwordTemporary,true);assert.equal(await L.auth(request({},old)),null);
 const entry=await M.call(login,request({user:'Alicia',pass:'Roca!7'}));assert.equal(entry.status,200);assert.equal(entry.body.mustChangePw,true);
 const changed=await M.call(password,request({newPass:'Lago!8'},entry.body.token));assert.equal(changed.status,200);assert.equal(changed.body.passwordTemporary,false);
 assert.ok(!JSON.stringify(db.tables.audit_log).includes('Roca!7'));
}));
test('491 established user may choose six characters and old session is revoked',()=>run(async db=>{const token=db.token(),r=await M.call(password,request({oldPass:'prueba123',newPass:'Roca!7'},token));assert.equal(r.status,200);assert.ok(r.body.token);assert.equal(await L.auth(request({},token)),null);assert.ok(await L.auth(request({},r.body.token)));}));
for(const actor of ['Alicia','admin','superadmin'])test('491 five characters rejected without credential mutation: '+actor,()=>run(async db=>{const before=JSON.stringify(db.tables.sohail_account_security),r=await M.call(password,request({target:'Alicia',newPass:'Ab!56',oldPass:'prueba123'},db.token(actor)));assert.equal(r.status,400);assert.equal(r.body.code,'PASSWORD_POLICY');assert.equal(JSON.stringify(db.tables.sohail_account_security),before);assert.equal(db.requests.filter(r=>r.name==='sohail_p2_change_password').length,0);}));
test('491 client/server copy has no obsolete 15-character enforcement',()=>{
 const js=read('public/jugadores-perfiles.js'),translations=read('public/security-account.js'),server=read('api/password.js');
 assert.equal((js.match(/\.length<6/g)||[]).length,3);assert.doesNotMatch(js,/\.length<15/);
 assert.doesNotMatch(translations,/15(?: a | to | y |–)128/);assert.doesNotMatch(server,/15 a 128/);
 for(const str of ['6 a 128','6 to 128','6–128'])assert.ok(translations.includes(str));
});
test('491 contextual injury action opens the shared manager, not the score submission route',()=>{
 const js=read('public/result-editor.js');assert.match(js,/data-injury-manage/);assert.match(js,/SohailInjuries\.open\(\{player:m\.c\.a/);assert.match(js,/cycle:m\.c\.cycle/);
 const start=js.indexOf(' function injuryTools('),end=js.indexOf('\n function openInjuries',start),context=vm.createContext({currentUser:{role:'admin'},esAdmin:u=>u.role==='admin'||u.role==='superadmin',_ligaReadOnly:false,_loadOK:true,isTutorialRunning:()=>false,t:x=>x,e:x=>x});vm.runInContext(js.slice(start,end),context);
 assert.match(context.injuryTools({po:false}),/aria-haspopup="dialog"/);assert.equal(context.injuryTools({po:true}),'');
 context.currentUser={role:'player'};assert.equal(context.injuryTools({po:false}),'');context.currentUser={role:'superadmin'};assert.match(context.injuryTools({po:false}),/data-injury-manage/);
 context._ligaReadOnly=true;assert.equal(context.injuryTools({po:false}),'');context._ligaReadOnly=false;context._loadOK=false;assert.equal(context.injuryTools({po:false}),'');
});
test('491 league legend and saved injury modal provide translated management',()=>{const js=read('public/resultados-y-grupos.js');for(const s of ['data-injury-legend','0 puntos para ambos','0 points for both players','data-manage-injury-result','Gestionar lesión','Manage injury'])assert.ok(js.includes(s));});
test('491 manager supports context without sharing hidden Players drafts; save stays versioned',()=>{const js=read('public/jugadores-perfiles.js');for(const s of ['function createPanel(options={})','options.fresh?null','idPrefix:prefix','panel.injuryDirty=dirty','panel.injuryBusy=()=>busy','_stateV!==version','expectedVersion:version','operacion=injuries','if(!data?.ok||!data.state||!_hydrate(data.state))'])assert.ok(js.includes(s));});
test('491 cached assets are versioned and order remains unchanged',()=>{const html=read('public/index.html');for(const n of ['ui-modern.css','result-editor.js','resultados-y-grupos.js','jugadores-perfiles.js','security-account.js'])assert.ok(html.includes(n+'?v=sohail-v491-passwords-injury-access'));assert.ok(html.indexOf('jugadores-perfiles.js?v=')<html.indexOf('result-editor.js?v='));});
test('491 no new data model or scoring mutation is introduced',()=>{const css=read('public/ui-modern.css');assert.match(css,/\.inj-dialog::backdrop/);assert.match(css,/\.inj-league-legend/);assert.match(css,/\.inj-row-context/);assert.match(read('public/result-editor.js'),/SohailInjuries\?\.clearSession/);});
