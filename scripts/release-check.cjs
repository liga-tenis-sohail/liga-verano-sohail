'use strict';
// Vercel build gate. Tests never inherit production credentials or NODE_OPTIONS.
const {spawnSync}=require('node:child_process');const path=require('node:path');const fs=require('node:fs');
const root=path.resolve(__dirname,'..');
function safeEnvironment(source=process.env){
 const out={};
 for(const k of ['PATH','HOME','TMPDIR','TMP','TEMP','SystemRoot','WINDIR','CI','LANG','LC_ALL'])if(source[k]!==undefined)out[k]=source[k];
 return {...out,SESSION_SECRET:'SOHAIL_LOCAL_TEST_NOT_A_SECRET',SUPABASE_URL:'https://database.invalid',SUPABASE_SERVICE_KEY:'sb_secret_test'};
}
function main(){
 const steps=[['integrity',['scripts/verify-release.cjs']],['tests',['--test',...fs.readdirSync(path.join(root,'tests')).filter(x=>x.endsWith('.test.js')).sort().map(x=>'tests/'+x)]],['source security',['scripts/check-source-security.cjs']],['browser build',['scripts/build-public.cjs']],['output security',['scripts/check-public-output.cjs']]];
 for(const [name,args]of steps){console.log('\n=== '+name+' ===');const r=spawnSync(process.execPath,args,{cwd:root,env:safeEnvironment(),stdio:'inherit',timeout:300000});if(r.error||r.status!==0){console.error('Release stopped at: '+name);return 1;}}
 console.log('Release checks passed. This is a local build result, not proof of repository privacy or a live deployment.');return 0;
}
module.exports={safeEnvironment};if(require.main===module)process.exitCode=main();
