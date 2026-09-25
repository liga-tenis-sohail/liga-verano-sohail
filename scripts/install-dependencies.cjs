'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function validateLock(pkg,lock){
 if(lock.lockfileVersion!==3||!lock.packages?.[''])throw Error('Unsupported dependency lock.');
 for(const field of ['dependencies','devDependencies','optionalDependencies']){
  const a=pkg[field]||{},b=lock.packages[''][field]||{};
  if(JSON.stringify(Object.entries(a).sort())!==JSON.stringify(Object.entries(b).sort()))throw Error('package-lock.json does not match package.json: '+field);
 }
 for(const [name,item]of Object.entries(lock.packages)){
  if(!name)continue;
  if(item.link||!/^https:\/\/registry\.npmjs\.org\//.test(item.resolved||'')||!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(item.integrity||''))throw Error('Dependency must have npm HTTPS origin and SHA-512 integrity: '+name);
 }
 return true;
}
function npm(args){const r=spawnSync(process.platform==='win32'?'npm.cmd':'npm',args,{cwd:root,stdio:'inherit',shell:process.platform==='win32'});if(r.error)throw r.error;if(r.status!==0)throw Error('npm command failed ('+r.status+').');}
function main(){
 const lockPath=path.join(root,'package-lock.json');
 if(fs.existsSync(lockPath)){validateLock(JSON.parse(fs.readFileSync(path.join(root,'package.json'))),JSON.parse(fs.readFileSync(lockPath)));npm(['ci','--ignore-scripts','--no-audit','--no-fund']);}
 else{
  console.warn('NOTICE: initial dependency resolution; not yet a reproducible installation. Commit the generated lockfile after the manual dependency-review workflow passes.');
  if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'lock_generated=true\n');
  npm(['install','--ignore-scripts','--no-audit','--no-fund']);
  validateLock(JSON.parse(fs.readFileSync(path.join(root,'package.json'))),JSON.parse(fs.readFileSync(lockPath)));
 }
}
module.exports={validateLock};if(require.main===module){try{main();}catch(e){console.error(e.message);process.exitCode=1;}}
