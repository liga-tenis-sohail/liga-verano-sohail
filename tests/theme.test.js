'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/theme.js'),'utf8');
function setup(options={}){
 const attrs={},css={},store={theme:options.preference||'light',lsc:options.brand?JSON.stringify(options.brand):null},events=[];let listener;
 const mq={matches:!!options.dark,addEventListener:(name,fn)=>listener=fn};
 const root={setAttribute:(k,v)=>attrs[k]=v,style:{setProperty:(k,v)=>css[k]=v}};
 const ctx={window:{document:{documentElement:root,dispatchEvent:e=>events.push(e)},matchMedia:()=>mq,
 localStorage:{getItem:k=>{if(options.blocked)throw Error('blocked');return store[k];},setItem:(k,v)=>{if(options.blocked)throw Error('blocked');store[k]=v;}}},CustomEvent:function(t,opts){this.type=t;this.detail=opts.detail;}};
 vm.createContext(ctx);vm.runInContext(source,ctx);return {api:ctx.window.SohailAppearance,root,attrs,css,store,events,os:v=>{mq.matches=v;listener();}};
}
for(const [pref,dark,expected]of [['dark',false,'dark'],['system',true,'dark'],['light',true,'light'],['system',false,'light']])
 test('Tema inicial: '+pref+' con OS '+dark,()=>{const {attrs,root}=setup({preference:pref,dark});assert.equal(attrs['data-theme'],expected);assert.equal(root.style.colorScheme,expected);assert.equal(attrs['data-theme-preference'],pref);});
test('El cambio del sistema solo afecta a preferencia Sistema',()=>{const s=setup({preference:'system',dark:false});s.os(true);assert.equal(s.attrs['data-theme'],'dark');s.api.setPreference('light');s.os(true);assert.equal(s.attrs['data-theme'],'light');s.os(false);assert.equal(s.attrs['data-theme'],'light');});
test('Almacenamiento bloqueado no impide cambiar el tema en la sesión',()=>{const s=setup({blocked:true});assert.equal(s.api.setPreference('dark'),true);assert.equal(s.api.preference(),'dark');assert.equal(s.attrs['data-theme'],'dark');});
test('Valor de tema inválido no modifica preferencia ni atributos',()=>{const s=setup();assert.equal(s.api.setPreference('banana'),false);assert.equal(s.attrs['data-theme'],'light');});
test('Colores inesperados se rechazan y RGB abreviado se normaliza',()=>{const s=setup();assert.equal(s.api.hex('#AbC'),'#aabbcc');assert.equal(s.api.hex('url(javascript:1)'),null);assert.equal(s.api.setBrand('red','#fff','#ff0'),false);});
test('Pares de contraste conocidos (blanco/negro=21)',()=>{const {api}=setup();assert.equal(api.contrast('#000','#fff'),21);assert.equal(api.contrast('#aaa','#aaa'),1);});
test('Texto automático y botones cumplen 4.5:1 en 4096 colores RGB',()=>{const {api}=setup();for(let r=0;r<=255;r+=17)for(let g=0;g<=255;g+=17)for(let b=0;b<=255;b+=17){const c='#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');assert.ok(api.contrast(c,api.textOn(c))>=4.5,c);assert.ok(api.contrast('#fff',api.actionFor(c))>=4.5,c);}});
test('La marca clara no vuelve claro el botón ni el texto de enlaces',()=>{const s=setup({preference:'dark'});s.api.setBrand('#d8edfa','#fff','#123456');assert.equal(s.css['--brand-bg'],'#d8edfa');assert.equal(s.css['--pri'],'#93c5fd');assert.equal(s.css['--action'],'#245edb');assert.ok(s.api.contrast(s.css['--brand-bg'],s.css['--brand-ink'])>=4.5);});
test('Color manual legible se conserva y color ilegible se corrige sin cambiar lo guardado',()=>{const {api}=setup();assert.equal(api.textOn('#ffffff','#123456'),'#123456');assert.notEqual(api.textOn('#ffffff','#eeeeee'),'#eeeeee');});
test('No hay red, accesos a secretos ni escritura de datos deportivos en el módulo',()=>{assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|\/api\/|persist\s*\(|innerHTML\s*=/);});
