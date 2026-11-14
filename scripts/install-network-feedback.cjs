'use strict';
// Narrow, source-preserving migration. No network, SQL or runtime permission changes.
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const TARGETS=Object.freeze(['api/_request-security.js','api/_http.js']);
function regular(root,file){let p=root;const parts=file.split('/');for(let i=0;i<parts.length;i++){p=path.join(p,parts[i]);const s=fs.lstatSync(p);if(s.isSymbolicLink()||(i===parts.length-1?!s.isFile():!s.isDirectory()))throw Error('NETWORK_FIX_UNSAFE_PATH: '+file);}return p;}
function edit(src,oldText,newText,label){
 if(src.includes(newText)){if(src.split(newText).length!==2)throw Error('NETWORK_FIX_DUPLICATE: '+label);return src;}
 if(src.split(oldText).length!==2)throw Error('NETWORK_FIX_INCOMPATIBLE: '+label+'. No se sobrescribe la version actual.');
 return src.replace(oldText,newText);
}
function plan(root=ROOT){
 root=fs.realpathSync(root);const out=[];
 for(const file of TARGETS){let src=fs.readFileSync(regular(root,file),'utf8'),before=src;
  if(file==='api/_request-security.js'){
   src=edit(src,'function validate(req,route){',`// SOHAIL_NETWORK_FEEDBACK_V1: only the existing tutorial endpoint accepts GET.
function methodsFor(req,route){
 return route==='password'&&req.query?.accion==='tutorial'?['GET','POST']:METHODS[route];
}
function validate(req,route){`,file+' methodsFor');
   src=edit(src,'if(METHODS[route]&&!METHODS[route].includes(req.method))',"if(methodsFor(req,route)&&!methodsFor(req,route).includes(req.method))",file+' allowed method');
   src=edit(src,"if(['login','password','passkey'].includes(route))return 'auth';",`// Tutorial preferences do not spend the credential-login quota; they remain limited.
 if(route==='password'&&req.query?.accion==='tutorial')return req.method==='GET'?'read':'write';
 if(['login','password','passkey'].includes(route))return 'auth';`,file+' category');
   src=edit(src,'{retryAfter:Math.max(1,r.retry_after)}','{retryAfter:Math.max(1,r.retry_after),rateCategory:kind}',file+' rate metadata');
   src=edit(src,'module.exports={METHODS,LIMITS,address,validateTree,validate,category,consume,before,english};','module.exports={METHODS,LIMITS,address,validateTree,validate,category,consume,before,english,methodsFor};',file+' exports');
  }else{
   src=edit(src,"gate.METHODS[options.route].join(', ')","(gate.methodsFor(req,options.route)||[]).join(', ')",file+' Allow');
   src=edit(src,'code,currentV:e.currentV,requestId});','code,currentV:e.currentV,requestId,retryAfter:e.retryAfter,rateCategory:e.rateCategory});',file+' retry metadata');
  }
  if(src!==before)out.push([file,src]);
 }
 return out;
}
function install(root=ROOT,apply=false){const edits=plan(root);if(!apply)return edits;
 const backup=new Map(edits.map(([f])=>[f,fs.readFileSync(regular(root,f))])),owned=new Set();
 try{for(const[f,text]of edits){const p=regular(root,f),tmp=p+'.network-feedback.tmp';if(fs.existsSync(tmp))throw Error('NETWORK_FIX_TEMP_EXISTS: '+f);fs.writeFileSync(tmp,text,{flag:'wx'});owned.add(tmp);fs.renameSync(tmp,p);owned.delete(tmp);}}
 catch(e){for(const[f,bytes]of backup)fs.writeFileSync(path.join(root,f),bytes);throw e;}
 finally{for(const p of owned)if(fs.existsSync(p)&&!fs.lstatSync(p).isSymbolicLink())fs.unlinkSync(p);}
 return edits;
}
module.exports={plan,install,TARGETS};
if(require.main===module){try{if(process.argv.slice(2).some(x=>x!=='--apply'))throw Error('Solo se admite --apply');const edits=install(ROOT,process.argv.includes('--apply'));console.log('[SOHAIL_NETWORK_FIX] '+(process.argv.includes('--apply')?'Aplicado':'Vista previa')+': '+edits.length+' archivo(s).');}catch(e){console.error(e.message);process.exitCode=1;}}
