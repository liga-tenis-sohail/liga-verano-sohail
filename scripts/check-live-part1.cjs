'use strict';
// Read-only post-deployment checks. Run ONLY against your own Sohail site.
// Does not log response bodies, use credentials, invoke application operations,
// follow redirects, or request third-party assets. This is not a penetration test.
const crypto=require('node:crypto');
const EXPECTED_RELEASE='sohail-security-part1-v481';
const EXPECTED_APP='sohail-v480-rules-injuries';
const PUBLIC_ASSETS=require('./public-assets.json');
const PRIVATE_PATHS=Object.freeze(['/rating-engine.js','/public/rating-engine.js','/api/_rating-engine.js',
 '/api/_injuries.js','/api/_lib.js','/scripts/build-public.cjs','/scripts/public-assets.json',
 '/tests/rules-sections-injuries.test.js','/package.json','/04_restore_identities.sql',
 '/supabase_setup.sql','/.env','/.git/config']);
function originOf(value){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Use only the HTTPS origin of your own site, without credentials, path, query or fragment.');
 return url.origin;
}
async function readLimited(response,maxBytes){
 const size=response.headers.get('content-length');
 if(size!==null&&(!/^\d+$/.test(size)||Number(size)>maxBytes)){await response.body?.cancel();throw Error('Response exceeds the inspection limit.');}
 if(!response.body) return Buffer.alloc(0);
 const reader=response.body.getReader(),chunks=[];let total=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes)throw Error('Response exceeds the inspection limit.');chunks.push(Buffer.from(value));}}
 catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
 return Buffer.concat(chunks);
}
async function checkLive(value,fetcher=fetch){
 const origin=originOf(value),results=[];
 const add=(name,ok)=>results.push({name,ok:!!ok});
 const get=path=>fetcher(origin+path,{method:'GET',redirect:'manual',credentials:'omit',signal:AbortSignal.timeout(15000)});
 const home=await get('/');
 if(home.status!==200){await home.body?.cancel();add('Homepage HTTP 200',false);return {results,ok:false};}
 const html=(await readLimited(home,256*1024)).toString('utf8');
 add('Homepage HTML',/^text\/html\b/i.test(home.headers.get('content-type')||''));
 add('Security release v4.8.1',html.includes('<meta name="sohail-release" content="'+EXPECTED_RELEASE+'"'));
 add('Rules and injuries v4.8 preserved',html.includes('<meta name="sohail-app-release" content="'+EXPECTED_APP+'"'));
 const sources=[...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)].map(m=>m[1]);
 const external=sources.filter(x=>x.startsWith('https:'));
 add('Approved external HTML resources',JSON.stringify(external.slice().sort())===JSON.stringify(PUBLIC_ASSETS.externalResources.slice().sort()));
 const local=sources.filter(x=>!x.startsWith('https:'));
 const valid=local.length===PUBLIC_ASSETS.assets.length&&local.length<=100&&new Set(local).size===local.length&&local.every(x=>/^\/assets\/[a-f0-9]{64}\.(?:js|css)$/.test(x));
 add('Generated asset paths only',valid);
 // Never turn a hostile page into an arbitrary-path crawler.
 if(valid){
  let total=0;
  for(const path of new Set(local)){
   const response=await get(path);if(response.status!==200){await response.body?.cancel();add('Asset '+path,false);continue;}
   const content=await readLimited(response,2*1024*1024);total+=content.length;
   if(total>20*1024*1024)throw Error('Total inspection size exceeded.');
   const sha=crypto.createHash('sha256').update(content).digest('hex');
   const type=response.headers.get('content-type')||'';
   add('Asset '+path,sha===path.slice(8,72)&&(path.endsWith('.css')?/^text\/css\b/i.test(type):/^(?:text|application)\/javascript\b/i.test(type)));
  }
 }
 for(const path of PRIVATE_PATHS){
  const response=await get(path);await response.body?.cancel();
  add('Private path '+path+' HTTP '+response.status,[403,404].includes(response.status));
 }
 for(const [header,predicate] of [
  ['x-content-type-options',x=>x==='nosniff'],['x-frame-options',x=>x==='DENY'],
  ['content-security-policy',x=>/frame-ancestors\s+'none'/.test(x)&&/object-src\s+'none'/.test(x)]
 ])add('Header '+header,predicate(home.headers.get(header)||''));
 return {results,ok:results.every(x=>x.ok)};
}
module.exports={checkLive,originOf,readLimited,PRIVATE_PATHS,EXPECTED_RELEASE,EXPECTED_APP};
if(require.main===module)checkLive(process.argv[2]||'').then(report=>{
 for(const x of report.results)console.log((x.ok?'OK ':'FAIL ')+x.name);
 console.log('Read-only deployment checks: '+report.results.filter(x=>x.ok).length+'/'+report.results.length+'.');
 console.log('Review GitHub privacy, /_src, /_logs, older deployments and account settings separately. No API write, session or database audit was performed.');
 process.exitCode=report.ok?0:1;
}).catch(()=>{console.error('Check could not complete. Verify origin/network/deployment protection. No success was assumed and no response data was printed.');process.exitCode=1;});
