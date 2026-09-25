'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {vercelConfigFindings}=require('../scripts/check-source-security.cjs');
const root=path.resolve(__dirname,'..');
const actual=()=>JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
const change=fn=>{const v=actual();fn(v);return vercelConfigFindings(v);};

test('DEP482 current reviewed Vercel configuration is accepted',()=>assert.deepEqual(vercelConfigFindings(actual()),[]));
for(const value of [false,true,null])test('DEP482 public property is rejected even when set to '+value,()=>{
 assert.ok(change(v=>{v.public=value;}).some(x=>x.type==='unsupported-vercel-public-property'));
});
for(const value of [null,[],false,'dist'])test('DEP482 non-object config rejected '+JSON.stringify(value),()=>assert.ok(vercelConfigFindings(value).length));
test('DEP482 accidental top-level property is rejected',()=>assert.ok(change(v=>{v.publicc=false;}).some(x=>x.type==='unreviewed-vercel-property')));
for(const [name,value]of [['outputDirectory','public'],['buildCommand','echo ok'],['installCommand','npm install'],['framework','nextjs'],['$schema','https://example.invalid']]){
 test('DEP482 protects publication setting '+name,()=>assert.ok(change(v=>{v[name]=value;}).some(x=>x.type==='publication-boundary')));
}
test('DEP482 missing framework is not interpreted as approved null',()=>assert.ok(change(v=>{delete v.framework;}).length));
test('DEP482 modified backup cron is rejected',()=>assert.ok(change(v=>{v.crons[0].schedule='* * * * *';}).length));
test('DEP482 additional cron is rejected',()=>assert.ok(change(v=>{v.crons.push({path:'/api/extra',schedule:'0 0 * * *'});}).length));
test('DEP482 invalid headers type rejected',()=>assert.ok(change(v=>{v.headers=null;}).length));
test('DEP482 removal of security header rejected',()=>assert.ok(change(v=>{v.headers[0].headers.pop();}).length));
test('DEP482 weakened CSP rejected',()=>assert.ok(change(v=>{v.headers[0].headers.find(x=>x.key==='Content-Security-Policy').value='';}).length));
test('DEP482 duplicate header rejected',()=>assert.ok(change(v=>{v.headers[0].headers.push({...v.headers[0].headers[0]});}).length));
test('DEP482 header matching is case-insensitive',()=>assert.deepEqual(change(v=>{v.headers[0].headers[0].key='X-CONTENT-TYPE-OPTIONS';}),[]));
test('DEP482 malformed header entries do not throw or pass',()=>assert.ok(change(v=>{v.headers[0].headers=[null];}).length));
test('DEP482 newline inside a header rejected',()=>assert.ok(change(v=>{v.headers[0].headers[0].value+='\r\nx-injected: 1';}).length));
test('DEP482 unexpected nested header property rejected',()=>assert.ok(change(v=>{v.headers[0].unexpected=true;}).length));
test('DEP482 widening asset cache scope rejected',()=>assert.ok(change(v=>{v.headers[1].source='/(.*)';}).length));
test('DEP482 removing no-cache on the entrypoint rejected',()=>assert.ok(change(v=>{v.headers[2].headers[0].value='public, max-age=31536000';}).length));
test('DEP482 avoids treating prototype key as an approved header scope',()=>assert.ok(change(v=>{v.headers[0].source='__proto__';}).length));
for(const name of ['.gitignore','.vercelignore'])test('DEP482 actual dotfile exists and protects local secrets '+name,()=>{
 const p=path.join(root,name);assert.ok(fs.statSync(p).isFile());const lines=fs.readFileSync(p,'utf8').split(/\r?\n/).map(x=>x.trim());
 for(const pattern of ['.env','.env.*','node_modules','dist'])assert.ok(lines.includes(pattern)||lines.includes(pattern+'/'),name+' missing '+pattern);
});
test('DEP482 Vercel input exclusions retain scripts, API and tests for the release gate',()=>{
 const lines=fs.readFileSync(path.join(root,'.vercelignore'),'utf8').split(/\r?\n/).map(x=>x.trim());
 for(const name of ['api','scripts','tests','public'])assert.ok(!lines.includes(name)&&!lines.includes(name+'/')&&!lines.includes(name+'/**'));
});
test('DEP482 source check still enforces vendor integrity and missing modules',()=>{
 const source=fs.readFileSync(path.join(root,'scripts/check-source-security.cjs'),'utf8');
 for(const token of ['vendor-integrity','public-engine-not-retired','missing-v480-integration-check','missing-dot-ignore-file'])assert.ok(source.includes(token));
});
