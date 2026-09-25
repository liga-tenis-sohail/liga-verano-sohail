'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),crypto=require('node:crypto');
const {build,render,compactJS,normalizedAST,localResource}=require('../scripts/build-public.cjs');
const {check:checkOutput}=require('../scripts/check-public-output.cjs');
const {check:checkSource,secretFindings}=require('../scripts/check-source-security.cjs');
const {safeEnvironment}=require('../scripts/release-check.cjs');
const {validateLock}=require('../scripts/install-dependencies.cjs');
const root=path.resolve(__dirname,'..');
function temporary(fn){const d=fs.mkdtempSync(path.join(os.tmpdir(),'sohail-part1-'));try{
 for(const n of ['api','public','scripts','.github','tests'])fs.cpSync(path.join(root,n),path.join(d,n),{recursive:true});
 for(const n of ['package.json','vercel.json','supabase_setup.sql'])fs.copyFileSync(path.join(root,n),path.join(d,n));
 return fn(d);
}finally{fs.rmSync(d,{recursive:true,force:true});}}
const cases=[
 ['return-newline','function f(){return\n{value:1}};globalThis.result=f();'],
 ['return-inline-comment','function f(){return /* same line */ 7};globalThis.result=f();'],
 ['return-multiline-comment','function f(){return /* new\nline */ 7};globalThis.result=f();'],
 ['postfix-newline','let a=1,b=3; a\n++b;globalThis.result=[a,b];'],
 ['division-regexp','let a=6/2;const b=/a\\/b/.test("a/b");globalThis.result=[a,b];'],
 ['template-raw','globalThis.result=String.raw`first\n  // preserve\n ${1+2}`;'],
 ['template-tag','function t(a){return a.raw[0]};globalThis.result=t`a\\nb`;'],
 ['strict-directive','/*comment*/"use strict";globalThis.result=(function(){return this})();'],
 ['private-class','class A{#x=3;get(){return this.#x}};globalThis.result=new A().get();'],
 ['optional-nullish','const a={b:0};globalThis.result=a?.b??4;'],
 ['no-renaming','function reportResult(){return 9};globalThis.result=reportResult.name;'],
 ['html-in-string','globalThis.result="<!--keep-->";'],
 ['unicode-line-separator','function f(){return\u2028 9};globalThis.result=f();'],
 ['regex-comment-like','globalThis.result=/https?:\\/\\/[^ ]+/.test("https://example.invalid");'],
 ['bigint','globalThis.result=1n+2n;'],
 ['regex-block','if(true){} /a/.test("a");globalThis.result=1;']
];
for(const [name,source]of cases)test('P1 compaction: '+name,()=>{
 const compact=compactJS(source);assert.equal(normalizedAST(source),normalizedAST(compact));
 const a={},b={};vm.runInNewContext(source,a);vm.runInNewContext(compact,b);assert.deepEqual(a.result===undefined?null:JSON.stringify(a.result,(_,v)=>typeof v==='bigint'?v.toString():v),b.result===undefined?null:JSON.stringify(b.result,(_,v)=>typeof v==='bigint'?v.toString():v));
});
test('P1 syntax errors stop compaction',()=>assert.throws(()=>compactJS('function broken( {')));
test('P1 license notice remains',()=>assert.match(compactJS('/*! MIT @license retained */ const a=1;'),/@license retained/));
test('P1 public engine is only a retirement notice',()=>{const s=fs.readFileSync(path.join(root,'public/rating-engine.js'),'utf8');assert.ok(s.length<400);assert.doesNotMatch(s,/DEFAULTS|calculate\s*\(|function\s*\(/);});
test('P1 server imports private engine only',()=>{const s=fs.readFileSync(path.join(root,'api/_rating.js'),'utf8');assert.match(s,/require\('\.\/_rating-engine'\)/);assert.doesNotMatch(s,/public\/rating-engine/);});
test('P1 private engine retains original implementation bytes',()=>{
 const b=fs.readFileSync(path.join(root,'api/_rating-engine.js'));const sha=crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex');assert.equal(sha,'abecbd42ceac637abb3d7779fe72794c651d0c03');
});
test('P1 all original browser JS keeps identical syntax trees',()=>{
 const config=JSON.parse(fs.readFileSync(path.join(root,'scripts/public-assets.json')));
 for(const name of config.assets.filter(x=>x.endsWith('.js'))){const s=fs.readFileSync(path.join(root,'public',name),'utf8');assert.equal(normalizedAST(s),normalizedAST(compactJS(s)),name);}
});
test('P1 deterministic approved output omits original JS filenames and private files',()=>{
 const a=render(root),b=render(root);assert.deepEqual(a.manifest,b.manifest);
 for(const [name,bytes]of Object.entries(a.files)){assert.ok(name==='index.html'||name==='favicon.ico'||/^assets\/[a-f0-9]{64}\.(?:js|css)$/.test(name),name);assert.deepEqual(bytes,b.files[name]);}
 assert.ok(!Object.keys(a.files).some(n=>/rating-engine|\.map$|\.sql$|^api\/|^tests\//.test(n)));
});
test('P1 CSS stays byte-for-byte identical',()=>{
 const a=render(root);for(const r of a.manifest.records.filter(x=>x.source.endsWith('.css')))assert.deepEqual(a.files[r.output],fs.readFileSync(path.join(root,r.source)));
});
test('P1 script order and CSS order retained in generated HTML',()=>{
 const template=fs.readFileSync(path.join(root,'public/index.html'),'utf8'),a=render(root),html=a.files['index.html'].toString();
 const paths=s=>[...s.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/g)].map(x=>x[1]);
 const expected=paths(template).map(uri=>{if(uri.startsWith('https:'))return uri;const record=a.manifest.records.find(x=>x.source==='public/'+uri.split('?')[0]);return '/'+record.output;});assert.deepEqual(paths(html),expected);
});
test('P1 build and integrity detect extra public files',()=>temporary(d=>{build(d);assert.equal(checkOutput(d).ok,true);fs.writeFileSync(path.join(d,'dist','private.sql'),'sensitive');assert.throws(()=>checkOutput(d),/unapproved/);}));
test('P1 build fails if new HTML script is not explicitly allowed',()=>temporary(d=>{const p=path.join(d,'public/index.html');fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('</body>','<script src="unreviewed.js"></script></body>'));assert.throws(()=>build(d),/allowlist/);}));
test('P1 allowlist cannot publish private paths',()=>temporary(d=>{const p=path.join(d,'scripts/public-assets.json'),x=JSON.parse(fs.readFileSync(p));x.assets.push('../api/_lib.js');fs.writeFileSync(p,JSON.stringify(x));assert.throws(()=>render(d),/path/);}));
test('P1 symlinked source is refused',()=>temporary(d=>{const p=path.join(d,'public/theme.js');fs.unlinkSync(p);fs.symlinkSync(path.join(d,'api/_lib.js'),p);assert.throws(()=>render(d),/regular/);}));
test('P1 symlinked output is refused',()=>temporary(d=>{fs.symlinkSync(path.join(d,'public'),path.join(d,'dist'));assert.throws(()=>build(d),/symlink/);}));
test('P1 output modifications detected',()=>temporary(d=>{build(d);fs.appendFileSync(path.join(d,'dist/index.html'),'<p>tampered</p>');assert.throws(()=>checkOutput(d),/bytes/);}));
test('P1 optional favicon retained without exposing other files',()=>temporary(d=>{fs.writeFileSync(path.join(d,'public/favicon.ico'),Buffer.from([0,0,1,0]));const a=render(d);assert.ok(a.files['favicon.ico']);assert.equal(a.manifest.records.filter(x=>x.output==='favicon.ico').length,1);}));
for(const p of ['../api/_lib.js','%2e%2e/_lib.js','javascript:alert(1)','_lib.js/../../secret.json'])test('P1 invalid URL rejected: '+p,()=>assert.throws(()=>localResource(p)));
test('P1 external CSS remains external',()=>assert.equal(localResource('https://cdn.example.invalid/icon.css'),null));
test('P1 release subprocesses never inherit production secrets',()=>{
 const env=safeEnvironment({PATH:'/bin',HOME:'/home/example',SESSION_SECRET:'production',SUPABASE_SERVICE_KEY:'production',SUPABASE_URL:'https://real.invalid',RESEND_API_KEY:'production',VERCEL_TOKEN:'production',NODE_OPTIONS:'--require bad.js'});
 assert.equal(env.SUPABASE_URL,'https://database.invalid');assert.equal(env.SESSION_SECRET,'SOHAIL_LOCAL_TEST_NOT_A_SECRET');assert.ok(!env.VERCEL_TOKEN&&!env.RESEND_API_KEY&&!env.NODE_OPTIONS);
});
test('P1 scanner does not print a found credential value',()=>{
 const value='sb_'+'secret_'+'a'.repeat(32),r=secretFindings('var key="'+value+'";');assert.equal(r[0].type,'secret-key');assert.ok(!JSON.stringify(r).includes(value));
});
test('P1 scanner detects privileged JWT not ordinary publishable token',()=>{
 const h=Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url'),make=role=>h+'.'+Buffer.from(JSON.stringify({role,iss:'supabase'})).toString('base64url')+'.'+'a'.repeat(40);
 assert.equal(secretFindings(make('service_role'))[0].type,'service-role-token');assert.equal(secretFindings(make('anon')).length,0);
});
test('P1 scanner allows known synthetic fixtures, not actual keys',()=>assert.equal(secretFindings("SESSION_"+"SECRET='SOHAIL_LOCAL_TEST_NOT_A_SECRET'").length,0));
test('P1 source policy passes with transparent lock/visibility notices',()=>{const r=checkSource(root);assert.deepEqual(r.failures,[]);assert.ok(r.warnings.some(x=>x.includes('visibility')));});
test('P1 unsafe env and mutable action are blocked',()=>temporary(d=>{fs.writeFileSync(path.join(d,'.env'),'HIDDEN=yes');const y=path.join(d,'.github/workflows/check.yml');fs.writeFileSync(y,fs.readFileSync(y,'utf8').replace('34e114876b0b11c390a56381ad16ebd13914f8d5','main'));const r=checkSource(d);assert.ok(r.failures.some(f=>f.type==='environment-file'));assert.ok(r.failures.some(f=>f.type==='action-not-pinned'));}));
test('P1 original Vercel cron and security headers retained',()=>{const c=JSON.parse(fs.readFileSync(path.join(root,'vercel.json')));assert.equal(c.public,false);assert.equal(c.outputDirectory,'dist');assert.ok(c.crons.some(x=>x.path==='/api/backup'&&x.schedule==='0 4 */3 * *'));for(const k of ['Content-Security-Policy','X-Frame-Options','X-Content-Type-Options','Permissions-Policy'])assert.ok(c.headers[0].headers.some(x=>x.key===k));});
test('P1 historical setup is inert, no embedded credential',()=>{const s=fs.readFileSync(path.join(root,'supabase_setup.sql'),'utf8');assert.match(s,/RAISE EXCEPTION/);assert.doesNotMatch(s,/CREATE POLICY|v2:[a-f0-9]{64}|INSERT INTO/);});
const pkg={dependencies:{example:'1.0.0'}},lock=()=>({lockfileVersion:3,packages:{'':pkg,'node_modules/example':{version:'1.0.0',resolved:'https://registry.npmjs.org/example/-/example-1.0.0.tgz',integrity:'sha512-'+Buffer.alloc(64).toString('base64')}}});
test('P1 matching dependency lock accepted structurally',()=>assert.equal(validateLock(pkg,lock()),true));
test('P1 mismatched dependency lock rejected',()=>assert.throws(()=>validateLock({dependencies:{example:'2.0.0'}},lock()),/match/));
test('P1 dependency without checksum rejected',()=>{const l=lock();delete l.packages['node_modules/example'].integrity;assert.throws(()=>validateLock(pkg,l),/integrity/);});
test('P1 alternate/untrusted package origins rejected',()=>{const l=lock();l.packages['node_modules/example'].resolved='https://other.invalid/file.tgz';assert.throws(()=>validateLock(pkg,l),/origin/);});
