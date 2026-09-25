'use strict';
// Conservative local checks. No networking and no matching secret is printed.
// Not a substitute for history-wide secret scanning or an independent audit.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const excluded=new Set(['.git','.vercel','node_modules','dist','.sohail-build','coverage','playwright-report','evidence']);
function secretFindings(text){
 const found=[];const patterns=[
  ['secret-key',/\bsb_secret_[A-Za-z0-9_-]{20,}\b/g],
  ['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
  ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['credential-literal',/\b(?:SESSION_SECRET|SUPABASE_SERVICE_KEY|BACKUP_SECRET|CRON_SECRET|RESEND_API_KEY)\s*[:=]\s*['"][^'"\r\n]{24,}['"]/g],
  ['retired-admin-hash',/['"]super_hash['"]\s*,\s*['"]v[12]:[a-f0-9]{64}['"]/g]
 ];
 for(const [type,re]of patterns)for(const m of text.matchAll(re)){
  // Explicitly synthetic fixtures only. No blanket test-directory exception.
  if(/SOHAIL_LOCAL_TEST_NOT_A_SECRET|LOCAL-TEST-NOT-A-PRODUCTION-SECRET|test-session-secret|example\.invalid|database\.invalid/.test(m[0]))continue;
  found.push({type,line:text.slice(0,m.index).split('\n').length});
 }
 for(const m of text.matchAll(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g)){
  try{const p=JSON.parse(Buffer.from(m[0].split('.')[1],'base64url').toString());if(p.role==='service_role')found.push({type:'service-role-token',line:text.slice(0,m.index).split('\n').length});}catch(_){}
 }
 return found;
}

// This is the reviewed SOHAIL configuration contract, not a full Vercel schema
// implementation and not proof of dashboard privacy. The live deployment validator
// rejected `public` on 2026-09-25. Control Source/Build Logs Protection in the panel.
// Supported shape checked against https://openapi.vercel.sh/vercel.json.
function vercelConfigFindings(v){
 const result=[];
 const add=type=>result.push({file:'vercel.json',type});
 const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 const keys=(x,allowed)=>object(x)&&Object.keys(x).every(k=>allowed.includes(k));
 if(!object(v)){add('vercel-config-not-object');return result;}
 const allowed=['$schema','crons','headers','framework','buildCommand','outputDirectory','installCommand'];
 if(Object.prototype.hasOwnProperty.call(v,'public'))add('unsupported-vercel-public-property');
 if(Object.keys(v).some(k=>!allowed.includes(k)))add('unreviewed-vercel-property');
 const expected={
  '$schema':'https://openapi.vercel.sh/vercel.json',framework:null,
  outputDirectory:'dist',buildCommand:'npm run release:check',
  installCommand:'node scripts/install-dependencies.cjs'
 };
 if(Object.entries(expected).some(([k,value])=>!Object.prototype.hasOwnProperty.call(v,k)||v[k]!==value))add('publication-boundary');
 // Retain the existing three-day backup schedule. It is never executed by a build.
 if(!Array.isArray(v.crons)||v.crons.length!==1||!keys(v.crons[0],['path','schedule'])||v.crons[0].path!=='/api/backup'||v.crons[0].schedule!=='0 4 */3 * *')add('unreviewed-cron-configuration');
 if(!Array.isArray(v.headers)||v.headers.length!==3){add('invalid-header-configuration');return result;}
 const required={
  '/(.*)':{
   'x-content-type-options':'nosniff',
   'referrer-policy':'strict-origin-when-cross-origin',
   'permissions-policy':'publickey-credentials-get=(self), publickey-credentials-create=(self)',
   'content-security-policy':"frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
   'x-frame-options':'DENY'
  },
  '/assets/(.*)':{'cache-control':'public, max-age=31536000, immutable'},
  '/':{'cache-control':'no-cache'}
 };
 const seen=new Set();
 for(const rule of v.headers){
  if(!keys(rule,['source','headers'])||typeof rule.source!=='string'||!Object.prototype.hasOwnProperty.call(required,rule.source)||seen.has(rule.source)||!Array.isArray(rule.headers)){add('invalid-header-rule');continue;}
  seen.add(rule.source);
  const expectedHeaders=required[rule.source],actual=new Map();
  for(const h of rule.headers){
   if(!keys(h,['key','value'])||typeof h.key!=='string'||typeof h.value!=='string'||/[\r\n]/.test(h.key+h.value)||actual.has(h.key.toLowerCase())){add('invalid-header-entry');continue;}
   actual.set(h.key.toLowerCase(),h.value);
  }
  if(actual.size!==Object.keys(expectedHeaders).length||Object.entries(expectedHeaders).some(([k,value])=>actual.get(k)!==value))add('security-headers-or-cache-changed');
 }
 if(seen.size!==Object.keys(required).length)add('missing-header-rule');
 return result;
}

function check(root=path.resolve(__dirname,'..')){
 const failures=[],warnings=[],files=[];
 function walk(dir,rel=''){
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
   const n=rel+e.name,p=path.join(dir,e.name);
   if(excluded.has(e.name)||e.name.startsWith('.sohail-publish-'))continue;
   if(e.isSymbolicLink()){failures.push({file:n,type:'symlink'});continue;}
   if(e.isDirectory())walk(p,n+'/');else if(e.isFile())files.push(n);
  }
 }
 walk(root);
 for(const n of files){
  if(/(^|\/)\.env(?:\.|$)/.test(n)&&!n.endsWith('.env.example')){failures.push({file:n,type:'environment-file'});continue;}
  if(/\.(?:pem|p12|pfx|xlsx?|csv|dump|db|sqlite3?|zip|tar|gz)$/i.test(n)){failures.push({file:n,type:'private-data-or-archive'});continue;}
  if(!/\.(?:js|cjs|mjs|json|ya?ml|html|css|sql|txt|md)$/.test(n))continue;
  const p=path.join(root,n);if(fs.statSync(p).size>5*1024*1024){failures.push({file:n,type:'unreviewed-large-file'});continue;}
  const text=fs.readFileSync(p,'utf8');
  failures.push(...secretFindings(text).map(x=>({file:n,...x})));
  if(/^\.github\/workflows\/.*\.ya?ml$/.test(n)){
   for(const line of text.split(/\r?\n/)){
    const m=line.match(/^\s*(?:-\s*)?uses:\s*(\S+)/);
    if(m&&!/^[A-Za-z0-9_.\/-]+@[a-f0-9]{40}$/.test(m[1]))failures.push({file:n,type:'action-not-pinned'});
   }
   if(/^\s*(?:pull_request_target|write-all)\s*:/m.test(text)||/^\s*permissions:\s*write-all/m.test(text))failures.push({file:n,type:'unsafe-workflow-permissions'});
  }
 }
 for(const n of ['api/_injuries.js','tests/rules-sections-injuries.test.js','tests/part1-v480-compat.test.js'])if(!fs.existsSync(path.join(root,n)))failures.push({file:n,type:'missing-v480-integration-check'});
 const v=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
 failures.push(...vercelConfigFindings(v));
 for(const n of ['.gitignore','.vercelignore'])if(!fs.existsSync(path.join(root,n)))failures.push({file:n,type:'missing-dot-ignore-file'});
 if(!fs.existsSync(path.join(root,'api/_rating-engine.js')))failures.push({file:'api/_rating-engine.js',type:'missing-private-engine'});
 const retired=fs.readFileSync(path.join(root,'public/rating-engine.js'),'utf8');
 if(retired.length>400||/\b(?:function|const|require|module\.exports)\b/.test(retired))failures.push({file:'public/rating-engine.js',type:'public-engine-not-retired'});
 const provenance=JSON.parse(fs.readFileSync(path.join(root,'scripts/vendor/acorn-provenance.json'),'utf8'));
 if(sha(fs.readFileSync(path.join(root,'scripts/vendor/acorn.cjs')))!==provenance.sha256)failures.push({file:'scripts/vendor/acorn.cjs',type:'vendor-integrity'});
 if(!fs.existsSync(path.join(root,'package-lock.json')))warnings.push('Dependency lock is pending: generate and commit package-lock.json using deps:lock or the manual dependency-review workflow.');
 warnings.push('Vercel dashboard: keep Build Logs and Source Protection and Git Fork Protection enabled; their actual state cannot be certified from vercel.json.');
 warnings.push('Repository visibility, cloud settings and previous public copies cannot be certified by a source scan.');
 return {files:files.length,failures,warnings};
}
module.exports={check,secretFindings,vercelConfigFindings};
if(require.main===module){try{const r=check();for(const f of r.failures)console.error('BLOCKED '+f.file+(f.line?':'+f.line:'')+' ['+f.type+']');for(const w of r.warnings)console.warn('NOTICE '+w);console.log('SOURCE CHECK: '+r.files+' files, '+r.failures.length+' blocking findings.');process.exitCode=r.failures.length?1:0;}catch(e){console.error('SOURCE CHECK FAILED: '+e.message);process.exitCode=1;}}
