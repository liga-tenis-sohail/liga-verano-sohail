'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const {render,RELEASE}=require('../scripts/build-public.cjs');
const {check:sourceCheck}=require('../scripts/check-source-security.cjs');
const {checkLive,originOf,readLimited,PRIVATE_PATHS,EXPECTED_APP}=require('../scripts/check-live-part1.cjs');
let output;const generated=()=>output||(output=render(root));
const source=n=>fs.readFileSync(path.join(root,n),'utf8');
function temp(fn){const d=fs.mkdtempSync(path.join(os.tmpdir(),'sohail-p1480-'));try{
 for(const n of ['api','public','scripts','.github','tests'])fs.cpSync(path.join(root,n),path.join(d,n),{recursive:true});
 for(const n of ['package.json','vercel.json','supabase_setup.sql','.gitignore','.vercelignore'])fs.copyFileSync(path.join(root,n),path.join(d,n));
 return fn(d);
}finally{fs.rmSync(d,{recursive:true,force:true});}}
function change(file,fn){fs.writeFileSync(file,fn(fs.readFileSync(file,'utf8')));}
function builtSource(name){const o=generated(),r=o.manifest.records.find(x=>x.source==='public/'+name);assert.ok(r,name);return o.files[r.output].toString();}

test('P1480 separate security and functional release markers survive build',()=>{
 const o=generated(),html=o.files['index.html'].toString();assert.equal(o.manifest.release,RELEASE);assert.equal(o.manifest.appRelease,EXPECTED_APP);
 assert.ok(html.includes('<meta name="sohail-release" content="'+RELEASE+'"'));assert.ok(html.includes('<meta name="sohail-app-release" content="'+EXPECTED_APP+'"'));
 assert.match(source('public/index.html'),/sohail-v480-rules-injuries/);
});
test('P1480 previous entrypoint is rejected rather than silently downgrading features',()=>temp(d=>{
 change(path.join(d,'public/index.html'),s=>s.replace('sohail-v480-rules-injuries','sohail-v460-unified-experience'));assert.throws(()=>render(d),/Mixed release/);
}));
test('P1480 ambiguous release marker is rejected',()=>temp(d=>{
 change(path.join(d,'public/index.html'),s=>s.replace('</head>','<meta name="sohail-release" content="sohail-v480-rules-injuries"></head>'));assert.throws(()=>render(d),/Mixed release/);
}));
test('P1480 no unreviewed external JavaScript can bypass the local allowlist',()=>temp(d=>{
 change(path.join(d,'public/index.html'),s=>s.replace('</head>','<script src="https://external.example.invalid/new.js"></script></head>'));assert.throws(()=>render(d),/external resource/);
}));
test('P1480 changing an existing external stylesheet requires review',()=>temp(d=>{
 change(path.join(d,'public/index.html'),s=>s.replace('@tabler/icons-webfont@2.47.0','@tabler/icons-webfont@latest'));assert.throws(()=>render(d),/external resource/);
}));
test('P1480 data-URL script cannot bypass external review',()=>temp(d=>{
 change(path.join(d,'public/index.html'),s=>s.replace('</head>','<script src="data:text/javascript,alert(1)"></script></head>'));assert.throws(()=>render(d),/external resource/);
}));
for(const name of ['api/_injuries.js','tests/rules-sections-injuries.test.js','tests/part1-v480-compat.test.js'])test('P1480 source gate rejects missing integration module '+name,()=>temp(d=>{
 fs.unlinkSync(path.join(d,name));assert.ok(sourceCheck(d).failures.some(x=>x.type==='missing-v480-integration-check'&&x.file===name));
}));
test('P1480 injury server module never becomes a browser resource',()=>{
 const o=generated();assert.ok(!o.manifest.records.some(x=>x.source.startsWith('api/')));assert.ok(!JSON.stringify(o.manifest).includes('_injuries.js'));
 // Also check a characteristic server-only error instead of relying on filenames.
 for(const b of Object.values(o.files))assert.ok(!b.toString().includes('El jugador debe pertenecer a un único grupo en ese ciclo.'));
});
test('P1480 regulation categories and drafts remain present after compaction',()=>{
 const s=builtSource('reglamento.js');for(const n of ['REGLAMENTO_SECCIONES','normativa','horarios','reservas','cancelaciones','rgChangeSection','rgDiscardSection'])assert.ok(s.includes(n),n);
});
test('P1480 edited group views still identify injury absences in both languages',()=>{
 const all=['ui-modern.js','resultados-y-grupos.js','match-history.js','jugadores-perfiles.js'].map(builtSource).join('\n');
 for(const x of ['npReason','injurySide','injuries','Lesión','Injury'])assert.ok(all.includes(x),x);
});
test('P1480 built history projection retains absence reason and strips contact/credential fields',()=>{
 const {fixture,match}=require('./support/mock-db.cjs');const state=fixture();state.users.Alicia.injured=true;
 state.matches=[match({id:80,sets:[],np:true,npReason:'injury',injurySide:0,status:'confirmed'})];
 const run=s=>{const module={exports:{}};const c=vm.createContext({module,exports:module.exports,console,structuredClone});vm.runInContext(s,c);return module.exports.project(state,{id:'liga-actual',nombre:'Synthetic'},{name:'Alicia',id:'profile-0'},{current:true});};
 const a=run(source('public/history-leagues.js')),b=run(builtSource('history-leagues.js'));
 assert.equal(JSON.stringify(a),JSON.stringify(b));assert.equal(b.records[0].npReason,'injury');assert.equal(b.records[0].injurySide,0);
 assert.ok(!JSON.stringify(b).includes('pass_hash'));assert.equal(Object.hasOwn(b.records[0],'winner'),false);
});
test('P1480 private rating engine bytes and fifty-match rules are unchanged',()=>{
 const b=fs.readFileSync(path.join(root,'api/_rating-engine.js'));assert.equal(crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex'),'abecbd42ceac637abb3d7779fe72794c651d0c03');
 const E=require('../api/_rating-engine');assert.equal(E.PROVISIONAL_MATCHES,15);
});
test('P1480 compilation never reads league data or changes source files',()=>{
 const paths=['api/_injuries.js','api/_lib.js','public/reglamento.js','public/core-estado.js','public/index.html'];const before=paths.map(source);render(root);assert.deepEqual(paths.map(source),before);
});

function fixtureFetcher(mutate){const o=generated(),calls=[];const headers={'content-type':'text/html; charset=utf-8','x-content-type-options':'nosniff','x-frame-options':'DENY','content-security-policy':"frame-ancestors 'none'; object-src 'none'; base-uri 'self'"};
 const fetcher=async(url,options)=>{
  calls.push({url,options});const u=new URL(url);assert.equal(u.origin,'https://fixture.invalid');assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'manual');assert.ok(!options.headers&&!options.body);
  const name=u.pathname==='/'?'index.html':u.pathname.slice(1);let body=o.files[name],status=body?200:404;let h=name==='index.html'?{...headers}:{'content-type':name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/plain'};
  const val=mutate?mutate({name,body,status,headers:h}):null;if(val){body=val.body??body;status=val.status??status;h=val.headers??h;}
  return new Response(body||'missing',{status,headers:h});
 };return {fetcher,calls};}
test('P1480 live checker verifies markers, asset hashes and blocked module routes with GET only',async()=>{
 const {fetcher,calls}=fixtureFetcher();const r=await checkLive('https://fixture.invalid/',fetcher);assert.equal(r.ok,true);assert.equal(calls.length,1+49+PRIVATE_PATHS.length);assert.ok(calls.every(x=>!x.url.includes('/__test__')));
});
test('P1480 live checker rejects an old successful deployment',async()=>{
 const {fetcher}=fixtureFetcher(x=>x.name==='index.html'?{body:x.body.toString().replace(RELEASE,'sohail-security-part1-v471')}:null);const r=await checkLive('https://fixture.invalid/',fetcher);assert.equal(r.ok,false);
});
test('P1480 live checker detects missing rules/injury marker',async()=>{
 const {fetcher}=fixtureFetcher(x=>x.name==='index.html'?{body:x.body.toString().replace(EXPECTED_APP,'old-app')}:null);assert.equal((await checkLive('https://fixture.invalid/',fetcher)).ok,false);
});
test('P1480 live checker detects tampered script even with successful HTTP status',async()=>{
 const {fetcher}=fixtureFetcher(x=>x.name.endsWith('.js')?{body:Buffer.from('console.log(1)')}:null);assert.equal((await checkLive('https://fixture.invalid/',fetcher)).ok,false);
});
test('P1480 live checker detects exposed injury source',async()=>{
 const {fetcher}=fixtureFetcher(x=>x.name==='api/_injuries.js'?{status:200,body:'not-secret-fixture'}:null);assert.equal((await checkLive('https://fixture.invalid/',fetcher)).ok,false);
});
test('P1480 live checker cannot certify a login redirect as success',async()=>{
 const {fetcher,calls}=fixtureFetcher(()=>({status:302,headers:{location:'https://other.invalid'}}));assert.equal((await checkLive('https://fixture.invalid/',fetcher)).ok,false);assert.equal(calls.length,1);
});
test('P1480 live checker does not crawl unexpected local or third-party paths',async()=>{
 const {fetcher,calls}=fixtureFetcher(x=>x.name==='index.html'?{body:x.body.toString().replace('</head>','<script src="/api/backup"></script><script src="https://other.invalid/code.js"></script></head>')}:null);
 assert.equal((await checkLive('https://fixture.invalid/',fetcher)).ok,false);assert.ok(calls.every(x=>!x.url.endsWith('/api/backup')&&!x.url.startsWith('https://other.invalid')));
});
for(const value of ['http://fixture.invalid/','https://user:pw@fixture.invalid/','https://fixture.invalid/path','https://fixture.invalid/?token=x'])test('P1480 live checker invalid origin '+value,()=>assert.throws(()=>originOf(value)));
test('P1480 inspection limits are enforced even without Content-Length',async()=>assert.rejects(readLimited(new Response('x'.repeat(129)),128),/limit/));
test('P1480 no success on network failure',async()=>assert.rejects(checkLive('https://fixture.invalid/',async()=>{throw Error('simulated outage');}),/simulated/));

test('P1480 live checker rejects unexpected remote scripts without downloading them',async()=>{
 const {fetcher,calls}=fixtureFetcher(x=>x.name==='index.html'?{body:x.body.toString().replace('</head>','<script src="https://other.invalid/code.js"></script></head>')}:null);
 assert.equal((await checkLive('https://fixture.invalid/',fetcher)).ok,false);assert.ok(calls.every(x=>x.url.startsWith('https://fixture.invalid/')));
});
