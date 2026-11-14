'use strict';
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const ASSETS=['operation-feedback.js','import-results-review.js','import-results.css'];
function once(source,anchor,replacement,label){if(source.split(anchor).length!==2)throw Error('No se reconoce el punto de integración de '+label+'. No se modificó ningún archivo.');return source.replace(anchor,replacement);}
function plan(root=ROOT){
 const result=new Map();
 for(const file of ['api/_import-results.js',...ASSETS.map(n=>'public/'+n)])if(!fs.existsSync(path.join(root,file)))throw Error('Falta el archivo nuevo '+file);
 let file='public/index.html',src=fs.readFileSync(path.join(root,file),'utf8');
 if(!src.includes('src="import-results-review.js?')){
  const tags=[...src.matchAll(/<script\b[^>]*src=["']excel-loader\.js[^"']*["'][^>]*><\/script>/g)];if(tags.length!==1)throw Error('No se reconoce la carga de Excel en public/index.html.');
  src=src.replace(tags[0][0],'<script src="operation-feedback.js?v=import-review-1"></script>\n<script src="import-results-review.js?v=import-review-1"></script>\n'+tags[0][0]);
  src=once(src,'</head>','<link rel="stylesheet" href="import-results.css?v=import-review-1">\n</head>',file);
 }
 result.set(file,src);
 file='scripts/public-assets.json';const cfg=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));if(!Array.isArray(cfg.assets))throw Error('La lista pública no es compatible.');for(const asset of ASSETS)if(!cfg.assets.includes(asset))cfg.assets.push(asset);result.set(file,JSON.stringify(cfg,null,2)+'\n');
 file='api/liga.js';src=fs.readFileSync(path.join(root,file),'utf8');if(!src.includes("require('./_import-results').handler"))src=once(src,"if(req.query && req.query.operacion!==undefined){","if(req.query && req.query.operacion!==undefined){\n    if(req.query.operacion==='import-results')return require('./_import-results').handler(req,res);",file);result.set(file,src);
 file='api/_request-security.js';src=fs.readFileSync(path.join(root,file),'utf8');if(!src.includes("op==='import-results'"))src=once(src,"if(route==='liga'&&op==='history')return 'read';","if(route==='liga'&&op==='import-results')return mode==='commit'?'write':'read';\n if(route==='liga'&&op==='history')return 'read';",file);result.set(file,src);
 return [...result].filter(([name,text])=>fs.readFileSync(path.join(root,name),'utf8')!==text);
}
function install(root=ROOT,apply=false){const edits=plan(root);console.log(edits.length?'Archivos a integrar:\n'+edits.map(([f])=>'  '+f).join('\n'):'La integración ya está aplicada.');if(!apply){console.log('Vista previa. Usá --apply para aplicar.');return edits;}
 // Every target is computed before the first write. Atomic rename per file and rollback on failure.
 const old=new Map(edits.map(([file])=>[file,fs.readFileSync(path.join(root,file))]));
 try{for(const [file,content]of edits){const p=path.join(root,file);fs.writeFileSync(p+'.results-review.tmp',content);fs.renameSync(p+'.results-review.tmp',p);}}
 catch(e){for(const [file,content]of old)fs.writeFileSync(path.join(root,file),content);throw e;}
 console.log('Integración aplicada. Ejecutá las pruebas y el build antes de desplegar.');return edits;
}
module.exports={plan,install};
if(require.main===module){try{if(process.argv.slice(2).some(x=>x!=='--apply'))throw Error('Única opción admitida: --apply');install(ROOT,process.argv.includes('--apply'));}catch(e){console.error(e.message);process.exitCode=1;}}
