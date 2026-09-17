'use strict';
// Offline tests. No production credentials, Supabase calls or live writes.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createDB,fixture,req,call}=require('./support/mock-db.cjs');
const src=fs.readFileSync(path.join(__dirname,'../public/reglamento.js'),'utf8');
const ctx=vm.createContext({});vm.runInContext(src,ctx);
test('INK01: accepts opaque custom HEX, short HEX and native RGB only',()=>{
 for(const [x,y] of [['#AbC','#aabbcc'],['#09abFe','#09abfe'],['rgb(12, 34, 255)','#0c22ff'],['#fff','#ffffff'],['#000000','#000000']])assert.equal(ctx.rgTextColor(x),y);
});
test('INK02: rejects expressions, alpha, malformed RGB and non-string input',()=>{
 for(const x of [null,{},[],0,true,'red','rgba(1,2,3,.5)','#11223344','rgb(-1,0,0)','rgb(999,0,0)','url(javascript:1)','var(--brand)','#ffffff;display:none','expression(1)','initial','inherit'])assert.equal(ctx.rgTextColor(x),'',JSON.stringify(x));
});
function lum(v){const c=[1,3,5].map(i=>parseInt(v.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4));return .2126*c[0]+.7152*c[1]+.0722*c[2];}
function contrast(a,b){return (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);}
test('INK03: contrast matches independent white/black reference',()=>assert.equal(ctx.rgTextContrast('#000000','#ffffff'),21));
test('INK04: readable requested colours are not changed',()=>{for(const [a,b]of [['#1d4ed8','#ffffff'],['#ffffff','#191919'],['#172033','#fef08a']])assert.equal(ctx.rgReadableTextColor(a,b),a);});
test('INK05: 256 colours across light, dark and five markers reach 4.5:1',()=>{
 const backgrounds=['#ffffff','#edf2f9','#191919','#fef08a','#bbf7d0','#bfdbfe','#fbcfe8','#e9d5ff'];
 for(let i=0;i<256;i++){const fg='#'+[i,(i*47)%256,(i*97)%256].map(x=>x.toString(16).padStart(2,'0')).join('');for(const bg of backgrounds){const out=ctx.rgReadableTextColor(fg,bg);assert.match(out,/^#[0-9a-f]{6}$/);assert.ok(contrast(out,bg)>=4.5,fg+' over '+bg+' => '+out);}}
});
test('INK06: quick colours and custom controls are distinct from marker controls',()=>{assert.equal(vm.runInContext('RG_TEXT_COLORS.length',ctx),6);assert.match(src,/id="rg-text-picker" type="color"/);assert.match(src,/id="rg-text-hex"/);assert.match(src,/'foreColor'/);assert.match(src,/'hiliteColor'/);});
const markup='<p>Texto <b style="color:rgb(185,28,28);background-color:rgb(254,240,138)">importante</b> y <span style="color:initial">normal</span>.</p>';
for(const role of ['admin','superadmin'])test('INK07: '+role+' can persist and read colour + highlight together',async()=>{
 const oldFetch=global.fetch,db=createDB();global.fetch=db.fetch;
 try{const s=structuredClone(db.state()),before=JSON.stringify({matches:s.matches,cycles:s.cycles});s.REGLAMENTO=markup;const out=await call(require('../api/save'),req(db,role,{ligaId:'liga-actual',state:s}));assert.equal(out.status,200);const get=req(db,role,{}, {liga:'liga-actual'},'GET');const read=await call(require('../api/state'),get);assert.equal(read.body.state.REGLAMENTO,markup);assert.equal(JSON.stringify({matches:db.state().matches,cycles:db.state().cycles}),before);}finally{global.fetch=oldFetch;}
});
test('INK08: player cannot publish a coloured rule',async()=>{const oldFetch=global.fetch,db=createDB();global.fetch=db.fetch;try{const old=JSON.stringify(db.state()),s=structuredClone(db.state());s.REGLAMENTO=markup;assert.equal((await call(require('../api/save'),req(db,'Alicia',{ligaId:'liga-actual',state:s}))).status,403);assert.equal(JSON.stringify(db.state()),old);}finally{global.fetch=oldFetch;}});
test('INK09: finalized league remains read only',async()=>{const oldFetch=global.fetch,db=createDB([{id:'liga-actual',estado:'finalizada',state:fixture()}]);global.fetch=db.fetch;try{const s=structuredClone(db.state());s.REGLAMENTO=markup;assert.equal((await call(require('../api/save'),req(db,'admin',{ligaId:'liga-actual',state:s}))).status,403);}finally{global.fetch=oldFetch;}});
test('INK10: a foreground write leaves a second league intact',async()=>{const oldFetch=global.fetch,db=createDB([{id:'liga-actual',state:fixture()},{id:'otra-liga',state:fixture()}]);global.fetch=db.fetch;try{const old=JSON.stringify(db.state('otra-liga')),s=structuredClone(db.state());s.REGLAMENTO=markup;assert.equal((await call(require('../api/save'),req(db,'superadmin',{ligaId:'liga-actual',state:s}))).status,200);assert.equal(JSON.stringify(db.state('otra-liga')),old);}finally{global.fetch=oldFetch;}});
test('INK11: no fixed line number or dependency is introduced into existing workflow',()=>{const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');assert.match(html,/reglamento\.js\?v=sohail-reglamento-texto-v392-/);assert.match(html,/i18n-revision\.js\?v=sohail-reglamento-texto-v392-/);});
