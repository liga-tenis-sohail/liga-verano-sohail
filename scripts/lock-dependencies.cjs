'use strict';
// Run on a machine/runner with access to the official npm registry. Does not
// auto-commit or auto-deploy. Inspect audit results before committing the lock.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {validateLock}=require('./install-dependencies.cjs'),root=path.resolve(__dirname,'..');
function main(){
 const run=args=>{const r=spawnSync(process.platform==='win32'?'npm.cmd':'npm',args,{cwd:root,stdio:'inherit',shell:process.platform==='win32'});if(r.error||r.status!==0)throw Error('npm step failed; no approval or deployment was issued.');};
 run(['install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund']);
 validateLock(JSON.parse(fs.readFileSync(path.join(root,'package.json'))),JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'))));
 run(['ci','--ignore-scripts','--no-audit','--no-fund']);
 run(['audit','--omit=dev','--audit-level=high']);
 console.log('Dependency resolution and install checked. Review and commit package-lock.json; then run npm run release:check.');
}
if(require.main===module){try{main();}catch(e){console.error(e.message);process.exitCode=1;}}
