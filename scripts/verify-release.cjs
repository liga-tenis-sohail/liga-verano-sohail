'use strict';
// Read-only local verification. No network, no imports of application modules.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function verify(root){
 root=path.resolve(root);const checks=[];
 const add=(name,ok,detail='')=>checks.push({name,ok:!!ok,...(detail?{detail}:{})});
 const source=p=>fs.readFileSync(path.join(root,p),'utf8');
 const walk=dir=>fs.existsSync(path.join(root,dir))?fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]):[];
 for(const dir of ['public','api']){
  add(dir+' exists',fs.existsSync(path.join(root,dir)));
  for(const p of walk(dir).filter(p=>p.endsWith('.js'))){
   const s=source(p);try{new vm.Script(s,{filename:p});add('syntax '+p,true);}catch(e){add('syntax '+p,false,e.message);}
   add('content '+p,!/^\s*(?:Unsupported Media Type|(?:<!doctype|<html)\b|(?:404|403|500|503)\s+(?:Error|Not Found))/i.test(s),'Expected a JavaScript source file, not an error response');
  }
 }
 const idx='public/index.html';if(!fs.existsSync(path.join(root,idx))){add(idx,false);return checks;}
 const html=source(idx);add('HTML document',/^\s*<!doctype html>/i.test(html)&&/<\/html>\s*$/i.test(html));
 let count=0;for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc\s*=/.test(m[1])){
  count++;try{new vm.Script(m[2],{filename:idx+':inline'+count});add('inline script '+count,true);}catch(e){add('inline script '+count,false,e.message);}
 }
 const scripts=[],assets=[];
 for(const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi))scripts.push(m[1]);
 for(const m of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi))assets.push(m[1]);
 for(const uri of scripts.concat(assets)){
  if(/^(?:https?:)?\/\//i.test(uri)||uri.startsWith('data:'))continue;
  const file=decodeURIComponent(uri.split(/[?#]/)[0]);const full=path.resolve(root,'public',file.replace(/^\//,''));
  add('local resource '+uri,full.startsWith(path.join(root,'public')+path.sep)&&fs.existsSync(full));
 }
 const local=scripts.filter(s=>!/^https?:/i.test(s)).map(s=>s.split('?')[0]);add('unique local scripts',new Set(local).size===local.length);
 const order=['score-rules.js','core-estado.js','i18n-revision.js','destinos-auto.js','shell-render.js','persistencia.js','admin-workspace.js','ui-modern.js','history-leagues.js','match-history.js','result-editor.js','bootstrap.js','rating.js'];
 add('required modules exist and retain dependency order',order.every((n,i)=>local.includes(n)&&(!i||local.indexOf(n)>local.indexOf(order[i-1]))));
 add('no nested public/public',!fs.existsSync(path.join(root,'public','public')));
 const v=path.join(root,'vercel.json');if(fs.existsSync(v)){try{const j=JSON.parse(fs.readFileSync(v,'utf8'));add('Vercel valid JSON',!!j);add('backup schedule retained',j.crons?.some(c=>c.path==='/api/backup'&&c.schedule==='0 4 */3 * *'));}catch(e){add('Vercel valid JSON',false,e.message);}}
 return checks;
}
module.exports={verify};
if(require.main===module){const list=verify(process.argv[2]||path.resolve(__dirname,'..'));for(const x of list)console.log((x.ok?'OK ':'FAIL ')+x.name+(!x.ok&&x.detail?' — '+x.detail:''));console.log(`${list.filter(x=>x.ok).length}/${list.length} checks passed`);process.exitCode=list.some(x=>!x.ok)?1:0;}
