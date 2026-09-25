'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {render}=require('./build-public.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function check(root=path.resolve(__dirname,'..')){
 const expected=render(root).files,out=path.join(root,'dist'),found=[];
 function walk(dir,prefix=''){
  if(fs.lstatSync(dir).isSymbolicLink())throw Error('Symlink in output.');
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
   const rel=prefix+e.name,p=path.join(dir,e.name);
   if(e.isSymbolicLink())throw Error('Symlink in output: '+rel);
   if(e.isDirectory())walk(p,rel+'/');else if(e.isFile())found.push(rel);else throw Error('Unexpected output entry.');
  }
 }
 walk(out);
 if(JSON.stringify(found.sort())!==JSON.stringify(Object.keys(expected).sort()))throw Error('Output contains a missing or unapproved file.');
 for(const name of found){if(hash(fs.readFileSync(path.join(out,name)))!==hash(expected[name]))throw Error('Output bytes do not match the approved source: '+name);}
 return {files:found.length,ok:true};
}
module.exports={check};
if(require.main===module){try{const r=check();console.log('PUBLIC OUTPUT VERIFIED: '+r.files+' files; exact approved contents.');}catch(e){console.error('PUBLIC OUTPUT REJECTED: '+e.message);process.exitCode=1;}}
