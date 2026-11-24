'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('public/index.html'),css=read('public/login-presentation.css');
const login=html.slice(html.indexOf('<div id="login-screen">'),html.indexOf('<div class="app" id="main-app"'));
for(const id of ['login-header','login-title','login-sub','login-user','login-pass','login-btn','login-btn-pk','login-err','login-forgot-btn','ui-password-visibility','login-consult-league','login-consult-hint','past-leagues','past-list','session-note','btn-lang-es-login','btn-lang-en-login'])test('Login preserves unique '+id,()=>assert.equal((login.match(new RegExp('id="'+id+'"','g'))||[]).length,1));
test('Login retains native account selector and original auth handlers',()=>{
 assert.match(login,/<select id="login-user">/);assert.doesNotMatch(login,/id="login-user-search"/);
 assert.match(login,/id="login-btn" onclick="doLogin\(\)"/);assert.match(login,/id="login-btn-pk" onclick="loginConPasskey\(\)" style="display:none"/);
 assert.match(login,/id="login-forgot-btn" onclick="mostrarResetRequest\(\)"/);assert.match(login,/autocomplete="current-password"/);assert.match(login,/onkeydown="if\(event.key==='Enter'\)doLogin\(\)"/);
});
test('Configured public header is integrated with native links; archive is part of the form',()=>{
 const header=login.indexOf('id="login-header"'),card=login.indexOf('class="login-wrap ui-login-card sohail-login-presentation"'),body=login.indexOf('class="login-body"');
 assert.ok(card<header&&header<body);
 assert.ok(body<login.indexOf('id="past-leagues"')&&login.indexOf('id="past-leagues"')<login.indexOf('id="session-note"'));
 assert.match(login,/<div class="past-leagues" id="past-leagues" style="display:none">/);
 assert.match(login,/<button type="button" class="past-toggle" aria-controls="past-list" aria-expanded="false" onclick="togglePastLeagues\(\);/);
 assert.match(read('public/login-auth.js'),/function renderLoginHeader\(/);assert.match(read('public/login-auth.js'),/\/api\/login-header/);
});
test('No change to duration or hardcoded links; only two embedded WebP assets',()=>{
 assert.match(login,/24 horas/);assert.doesNotMatch(login,/30 d[ií]as/);assert.doesNotMatch(login,/<a\b[^>]*href=/i);assert.doesNotMatch(css,/@import\b/i);
 const urls=[...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(m=>m[1]);assert.equal(urls.length,2);
 for(const url of urls){assert.match(url,/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/);const bytes=Buffer.from(url.split(',')[1],'base64');assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');assert.ok(bytes.length<100000);}
 assert.match(login,/aria-label="Club de Tenis Sohail Fuengirola"/);assert.match(login,/class="slp-photo" aria-hidden="true"/);
});
test('Presentation supports both languages and does not alter form visibility',()=>{
 assert.match(login,/data-slp-lang="es"/);assert.match(login,/data-slp-lang="en"/);assert.match(css,/html\[lang="en"\]/);assert.match(css,/:has\(>\.login-body\[style\*="none"\]\)/);assert.match(css,/@media\(min-width:900px\)/);
});
test('New stylesheet loaded exactly once, included in explicit public asset manifest',()=>{
 const manifest=JSON.parse(read('scripts/public-assets.json'));assert.equal(manifest.assets.filter(v=>v==='login-presentation.css').length,1);
 assert.equal((html.match(/href="login-presentation\.css\?/g)||[]).length,1);assert.ok(html.indexOf('login-presentation.css?v=')>html.indexOf('player-experience.css?v='));
 const used=[...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)].map(m=>m[1]).filter(x=>!/^https?:\/\//i.test(x)).map(x=>x.split('?')[0]);assert.deepEqual(used.sort(),manifest.assets.slice().sort());
});
