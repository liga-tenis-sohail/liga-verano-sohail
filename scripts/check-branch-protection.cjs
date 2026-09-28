#!/usr/bin/env node
'use strict';
// Read-only verification through a locally authenticated GitHub CLI.
// Does NOT create or remove branch rules, ask for tokens or print credentials.
const {spawnSync}=require('node:child_process');
function findings(p){
 return [
 ['pull-request',!!p.required_pull_request_reviews],
 ['checks-strict',p.required_status_checks?.strict===true],
 ['required-check',(p.required_status_checks?.contexts||[]).includes('Integridad, regresión y seguridad local')||(p.required_status_checks?.checks||[]).some(x=>x.context==='Integridad, regresión y seguridad local')],
 ['admins-enforced',p.enforce_admins?.enabled===true],
 ['no-force-push',p.allow_force_pushes?.enabled===false],
 ['no-deletion',p.allow_deletions?.enabled===false]
 ].filter(([,ok])=>!ok).map(([n])=>n);
}
if(require.main===module){
 const repo=process.argv[2]||'liga-tenis-sohail/liga-verano-sohail';
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw Error('Invalid repository');
 const r=spawnSync('gh',['api',`repos/${repo}/branches/main/protection`],{encoding:'utf8',maxBuffer:1024*1024});
 if(r.status!==0){console.error('Protection NOT verified. Open GitHub Settings → Branches. The local gh account needs permission to read administration settings.');process.exitCode=1;}
 else {try{const bad=findings(JSON.parse(r.stdout));console.log(bad.length?'Protection incomplete: '+bad.join(', '):'Reviewed classic branch protection is active.');process.exitCode=bad.length?1:0;}catch(_){console.error('Protection NOT verified: unexpected API response.');process.exitCode=1;}}
}
module.exports={findings};
