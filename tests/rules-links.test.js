'use strict';
// Offline: real controllers with mocked database transport, never production.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createDB,fixture,req,call}=require('./support/mock-db.cjs');
const source=fs.readFileSync(path.join(__dirname,'../public/reglamento.js'),'utf8');
const context=vm.createContext({URL});vm.runInContext(source,context);const url=context.rgLinkUrl;
test('LINK01: absolute HTTP(S), anchors, queries and encoded text normalize safely',()=>{
 for(const [a,b]of [['https://example.com','https://example.com/'],['HTTP://EXAMPLE.COM/a','http://example.com/a'],[' https://example.com/x?q=1&b=2#seccion ','https://example.com/x?q=1&b=2#seccion'],['https://example.com/a%20b','https://example.com/a%20b']])assert.equal(url(a),b);
});
test('LINK02: only explicit form requests infer https for ordinary domain names',()=>{
 for(const a of ['www.tenismalaga.es/reglas','club.example.org','wa.me/3412345']){assert.equal(url(a),'');assert.equal(url(a,true),'https://'+a+(a.includes('/')?'':'/'));}
});
test('LINK03: executable, local, data and other schemes are rejected with or without inference',()=>{
 for(const a of ['javascript:alert(1)','JaVaScRiPt:alert(1)','data:text/html,<script>alert(1)</script>','file:///tmp/a','ftp://example.com','mailto:a@example.com','tel:1','blob:https://example.com/a','//example.com','/api/state','#test','about:blank','https:example.com'])for(const infer of [true,false])assert.equal(url(a,infer),'',a);
});
test('LINK04: control characters, bidi, backslashes and invalid values rejected',()=>{
 for(const a of [null,undefined,{},[],true,12,'','https://exa mple.com','java\nscript:alert(1)','https://example.com/\u0000','https://example.com/\u202eexe','https://example.com/\u200b','https://example.com\\@evil.example','https://example.com/" onclick="alert(1)','https://','https://example.com:99999'])assert.equal(url(a,true),'',String(a));
});
test('LINK05: credential-bearing addresses are never accepted',()=>{
 for(const a of ['https://user:password@example.com/','https://user@example.com','https://%75ser:pw@example.com','user@example.com'])assert.equal(url(a,true),'',a);
});
test('LINK06: length bound applies before and after normalization',()=>{
 assert.equal(url('https://example.com/'+ 'a'.repeat(2048)),'');assert.ok(url('https://example.com/'+ 'a'.repeat(1500)));assert.equal(url('example.com/'+ 'a'.repeat(2036),true),'');
});
test('LINK07: legitimate IDN addresses remain URLs (not interpreted as markup)',()=>{
 assert.equal(url('https://málaga.example/'),'https://xn--mlaga-xqa.example/');
});
const markup='<p>Consultar <b><a href="https://example.com/reglas?q=1&amp;x=2" target="_blank" rel="noopener noreferrer"><span style="color:rgb(185,28,28);background-color:rgb(254,240,138)">el reglamento externo</span></a></b>.</p>';
for(const role of ['admin','superadmin'])test('LINK08: '+role+' persists and reads a formatted hyperlink',async()=>{
 const old=global.fetch,db=createDB();global.fetch=db.fetch;
 try{const s=structuredClone(db.state()),before=JSON.stringify({matches:s.matches,cycles:s.cycles,playoff:s.playoff});s.REGLAMENTO=markup;
 const r=await call(require('../api/save'),req(db,role,{ligaId:'liga-actual',state:s}));assert.equal(r.status,200);
 const read=await call(require('../api/state'),req(db,'Alicia',{}, {liga:'liga-actual'},'GET'));assert.equal(read.body.state.REGLAMENTO,markup);
 assert.equal(JSON.stringify({matches:db.state().matches,cycles:db.state().cycles,playoff:db.state().playoff}),before);
 }finally{global.fetch=old;}
});
test('LINK09: player cannot create or change a rule hyperlink through the API',async()=>{
 const old=global.fetch,db=createDB();global.fetch=db.fetch;try{const before=JSON.stringify(db.state()),s=structuredClone(db.state());s.REGLAMENTO=markup;assert.equal((await call(require('../api/save'),req(db,'Alicia',{ligaId:'liga-actual',state:s}))).status,403);assert.equal(JSON.stringify(db.state()),before);}finally{global.fetch=old;}
});
test('LINK10: finalized league refuses administrator hyperlink edits',async()=>{
 const old=global.fetch,db=createDB([{id:'liga-actual',state:fixture(),estado:'finalizada'}]);global.fetch=db.fetch;try{const before=JSON.stringify(db.state()),s=structuredClone(db.state());s.REGLAMENTO=markup;assert.equal((await call(require('../api/save'),req(db,'admin',{ligaId:'liga-actual',state:s}))).status,403);assert.equal(JSON.stringify(db.state()),before);}finally{global.fetch=old;}
});
test('LINK11: changing one rule leaves another league untouched',async()=>{
 const old=global.fetch,db=createDB([{id:'liga-actual',state:fixture()},{id:'otra-liga',state:fixture()}]);global.fetch=db.fetch;try{const before=JSON.stringify(db.state('otra-liga')),s=structuredClone(db.state());s.REGLAMENTO=markup;assert.equal((await call(require('../api/save'),req(db,'superadmin',{ligaId:'liga-actual',state:s}))).status,200);assert.equal(JSON.stringify(db.state('otra-liga')),before);}finally{global.fetch=old;}
});
test('LINK12: ES/EN provide exactly the same new link messages',()=>{
 const i18n=fs.readFileSync(path.join(__dirname,'../public/i18n-revision.js'),'utf8').split('// v3.9.3 — links inside the rules, not user-authored text.')[1];
 const c=vm.createContext({TRANSLATIONS:{es:{},en:{}}});vm.runInContext(i18n,c);
 assert.deepEqual(Object.keys(c.TRANSLATIONS.es).sort(),Object.keys(c.TRANSLATIONS.en).sort());
 for(const x of Object.values(c.TRANSLATIONS.en))assert.ok(typeof x==='string'&&x.length>0);
});
