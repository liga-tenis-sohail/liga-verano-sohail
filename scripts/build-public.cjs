'use strict';
// Part 1: deterministic browser-only output. No API, SQL, tests or source maps.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const acorn=require('./vendor/acorn.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const RELEASE='sohail-security-part1-v481';
const options={ecmaVersion:'latest',sourceType:'script',allowHashBang:true};
function normalizedAST(source){
 return JSON.stringify(acorn.parse(source,options),(key,value)=>
  ['start','end','loc','range'].includes(key)?undefined:typeof value==='bigint'?String(value)+'n':value);
}
function compactJS(source){
 // No renaming, compression or removal of statements. All token bytes stay
 // unchanged; line terminators in gaps remain to preserve ASI/return/async.
 const before=normalizedAST(source),tokens=acorn.tokenizer(source,options);
 let result='',end=0;
 for(;;){const token=tokens.getToken();if(token.type.label==='eof')break;
  const gap=source.slice(end,token.start);
  if(result&&gap)result+=/[\r\n\u2028\u2029]/.test(gap)?'\n':' ';
  result+=source.slice(token.start,token.end);end=token.end;
 }
 const legal=[];
 acorn.parse(source,{...options,onComment:(block,text)=>{if(/^!|@license|@preserve|SPDX-License-Identifier|copyright/i.test(text.trim()))legal.push('/*'+text.replace(/\*\//g,'* /')+'*/');}});
 result=(legal.length?legal.join('\n')+'\n':'')+result+'\n';
 if(before!==normalizedAST(result))throw new Error('JS compaction changed the syntax tree; publication stopped.');
 new vm.Script(result);return result;
}
function localResource(uri){
 if(/^(?:https?:)?\/\//i.test(uri)||uri.startsWith('data:'))return null;
 const decoded=decodeURIComponent(uri.split(/[?#]/)[0]).replace(/^\//,'');
 if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:js|css|ico)$/.test(decoded))throw Error('Unsupported local asset path: '+decoded);
 return decoded;
}
function sourceFile(root,name){
 const base=path.join(root,'public');
 if(fs.lstatSync(base).isSymbolicLink())throw Error('Public source directory cannot be a symlink.');
 const p=path.join(base,name),st=fs.lstatSync(p);
 if(!st.isFile()||st.isSymbolicLink())throw Error('Asset must be a regular local file: '+name);
 return fs.readFileSync(p);
}
function render(root){
 const config=JSON.parse(fs.readFileSync(path.join(root,'scripts/public-assets.json'),'utf8'));
 if(config.version!==1||config.entry!=='index.html'||!Array.isArray(config.assets)||new Set(config.assets).size!==config.assets.length)throw Error('Invalid public asset allowlist.');
 for(const n of config.assets)if(localResource(n)!==n||!/\.(?:js|css)$/.test(n)||n==='rating-engine.js'||n.startsWith('_'))throw Error('Private or invalid allowlist entry: '+n);
 if(config.appRelease!=='sohail-v480-rules-injuries')throw Error('Expected the reviewed v4.8 rules/injuries release. Update the release contract deliberately.');
 if(!Array.isArray(config.externalResources)||new Set(config.externalResources).size!==config.externalResources.length||config.externalResources.some(u=>!/^https:\/\/[^\s"'<>]+$/.test(u)))throw Error('Invalid external resource allowlist.');
 const template=sourceFile(root,'index.html').toString('utf8'),used=[],external=[];
 const versions=[...template.matchAll(/<meta\s+name="sohail-release"\s+content="([^"]+)"/g)];
 if(versions.length!==1||versions[0][1]!==config.appRelease)throw Error('Mixed release: public/index.html must preserve v4.8 rules and injuries.');
 for(const m of template.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)){
  const n=localResource(m[1]);if(n!==null)used.push(n);else external.push(m[1]);
 }
 if(JSON.stringify([...used].sort())!==JSON.stringify([...config.assets].sort()))throw Error('The HTML resources and explicit allowlist differ. Review the new asset before publishing.');
 if(JSON.stringify([...external].sort())!==JSON.stringify([...config.externalResources].sort()))throw Error('Unreviewed external resource in the HTML allowlist.');
 const files={},mapping={},records=[];
 for(const name of config.assets){
  const original=sourceFile(root,name),content=name.endsWith('.js')?Buffer.from(compactJS(original.toString('utf8'))):original;
  // CSS remains byte-for-byte identical: dark/light/print semantics do not change.
  const ext=path.extname(name),target='assets/'+hash(content)+ext;
  files[target]=content;mapping[name]='/'+target;
  records.push({source:'public/'+name,output:target,sourceSHA256:hash(original),sha256:hash(content),bytes:content.length,originalBytes:original.length,astVerified:name.endsWith('.js')});
 }
 let html=template.replace(/(<(?:script|link)\b[^>]*\b(?:src|href)=["'])([^"']+)(["'])/gi,(all,prefix,uri,suffix)=>{
  const n=localResource(uri);return n===null?all:prefix+mapping[n]+suffix;
 });
 html=html.replace(/(<meta\s+name="sohail-release"\s+content=")[^"]*(")/i,'$1'+RELEASE+'$2');
 html=html.replace('</head>','<meta name="sohail-app-release" content="'+config.appRelease+'"></head>');
 html=html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi,(all,attrs,body)=>/\bsrc\s*=/.test(attrs)?all:'<script'+attrs+'>'+compactJS(body)+'</script>');
 // Source URLs only; no source maps/sourceURL breadcrumbs are emitted.
 for(const [name,bytes]of Object.entries(files))if(name.endsWith('.js')&&/\/[/*][#@]\s*source(?:Mapping)?URL\s*=/.test(bytes.toString()))throw Error('A debugging source URL escaped the build.');
 files['index.html']=Buffer.from(html);
 records.push({source:'public/index.html',output:'index.html',sourceSHA256:hash(Buffer.from(template)),sha256:hash(files['index.html']),bytes:files['index.html'].length,originalBytes:Buffer.byteLength(template)});
 if(JSON.stringify(config.optional)!=='["favicon.ico"]')throw Error('Unexpected optional browser asset.');
 if(fs.existsSync(path.join(root,'public/favicon.ico'))){const buf=sourceFile(root,'favicon.ico');files['favicon.ico']=buf;records.push({source:'public/favicon.ico',output:'favicon.ico',sha256:hash(buf),bytes:buf.length,originalBytes:buf.length});}
 return {files,manifest:{schema:1,release:RELEASE,appRelease:config.appRelease,externalResources:config.externalResources.slice(),records}};
}
function build(root=path.resolve(__dirname,'..')){
 root=fs.realpathSync(root);
 const out=path.join(root,'dist');
 if(fs.existsSync(out)&&fs.lstatSync(out).isSymbolicLink())throw Error('Refusing to overwrite a symlink named dist.');
 const prepared=render(root); // Validate everything before touching previous output.
 const staging=fs.mkdtempSync(path.join(root,'.sohail-publish-'));
 try{
  for(const [name,bytes]of Object.entries(prepared.files)){const p=path.join(staging,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes);}
  // dist is reserved for generated browser output (never store source here).
  fs.rmSync(out,{recursive:true,force:true});fs.renameSync(staging,out);
  const evidence=path.join(root,'.sohail-build');fs.mkdirSync(evidence,{recursive:true});
  fs.writeFileSync(path.join(evidence,'manifest.json'),JSON.stringify(prepared.manifest,null,2)+'\n');
 }finally{fs.rmSync(staging,{recursive:true,force:true});}
 return prepared.manifest;
}
module.exports={build,render,compactJS,normalizedAST,localResource,RELEASE};
if(require.main===module){try{const m=build();console.log('Browser-only build: '+m.records.length+' assets; '+m.records.filter(x=>x.astVerified).length+' JS syntax trees verified.');console.log('No API, SQL, private engine, tests or source maps are published.');}catch(e){console.error('PUBLIC BUILD FAILED: '+e.message);process.exitCode=1;}}
