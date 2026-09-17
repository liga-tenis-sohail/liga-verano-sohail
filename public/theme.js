/* v2.6 — tema efectivo y contraste. Sin red, sin datos deportivos, sin formularios.
 * La preferencia (light/dark/system) es distinta del tema resuelto (light/dark).
 * Se ejecuta antes del CSS para que los controles nativos y el primer paint coincidan.
 */
(function(global){
 'use strict';
 const defaults={p:'#1B4F9C',a:'#F5C518',hl:'#FFEDD5'};
 function hex(value,fallback){
  let v=String(value||'').trim();
  if(/^#[\da-f]{3}$/i.test(v))v='#'+[...v.slice(1)].map(c=>c+c).join('');
  return /^#[\da-f]{6}$/i.test(v)?v.toLowerCase():(fallback||null);
 }
 function luminance(value){
  const c=hex(value,'#ffffff');
  return [1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255)
   .map(v=>v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4))
   .reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
 }
 function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);}
 function mix(a,b,ratio){
  a=hex(a,'#000000');b=hex(b,'#ffffff');ratio=Math.max(0,Math.min(1,ratio));
  return '#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-ratio)+parseInt(b.slice(i,i+2),16)*ratio).toString(16).padStart(2,'0')).join('');
 }
 function textOn(bg,preferred){
  bg=hex(bg,'#ffffff');preferred=hex(preferred);
  if(preferred&&contrast(bg,preferred)>=4.5)return preferred;
  const tinted=mix(bg,'#000000',0.70);
  if(contrast(bg,tinted)>=4.5)return tinted;
  if(contrast(bg,'#172033')>=4.5)return '#172033';
  return contrast(bg,'#000000')>=contrast(bg,'#ffffff')?'#000000':'#ffffff';
 }
 function actionFor(bg){
  bg=hex(bg,defaults.p);
  // Color del botón diferente de la marca cuando la marca es demasiado clara.
  for(let r=0;r<=1;r+=0.025){const c=mix(bg,'#000000',r);if(contrast(c,'#ffffff')>=4.6)return c;}
  return '#1b4f9c';
 }
 // League text preferences are separate from device theme preference and brand.
 // No league text colour is cached between visits/leagues: hydration supplies it.
 function normalizeTextColors(value){
  const out={};
  if(!value||typeof value!=='object'||Array.isArray(value))return out;
  for(const key of ['light','dark','header']){
   if(Object.prototype.hasOwnProperty.call(value,key)&&typeof value[key]==='string'){
    const c=hex(value[key]);if(c)out[key]=c;
   }
  }
  return out;
 }
 function textPalette(mode,requested,p,a){
  const dark=mode==='dark',colors=normalizeTextColors(requested);
  p=hex(p,defaults.p);a=hex(a,defaults.a);
  const surfaces=dark?['#121212','#1b1b1b','#242424','#20334d','#403318','#302919']:
   ['#eef2f7','#ffffff','#edf1f6',mix(p,'#ffffff',.90),mix(a,'#ffffff',.92),mix(a,'#ffffff',.95)];
  const wanted=colors[dark?'dark':'light'];
  const min=c=>Math.min(...surfaces.map(bg=>contrast(bg,c)));
  const fallback=dark?'#f3f3f3':'#1b2433';
  const accepted=!wanted||min(wanted)>=4.5;
  const main=accepted&&wanted?wanted:fallback;
  const mutedCandidate=wanted&&accepted?mix(main,dark?'#1b1b1b':'#ffffff',.22):(dark?'#b9c0c9':'#5b6675');
  const muted=min(mutedCandidate)>=4.5?mutedCandidate:main;
  const headerWanted=colors.header,header=textOn(p,headerWanted||'#ffffff');
  return {main,muted,accepted,ratio:min(wanted||main),header,
   headerAccepted:!headerWanted||contrast(p,headerWanted)>=4.5,
   headerRatio:contrast(p,headerWanted||header),surfaces};
 }
 let preference='light',brand={...defaults},textColors={};
 try{const v=global.localStorage.getItem('theme');if(['light','dark','system'].includes(v))preference=v;}catch(_){}
 try{const c=JSON.parse(global.localStorage.getItem('lsc')||'null');if(c&&hex(c.p)&&hex(c.a))brand={p:hex(c.p),a:hex(c.a),hl:hex(c.hl,defaults.hl)};}catch(_){}
 const mq=global.matchMedia?global.matchMedia('(prefers-color-scheme: dark)'):null;
 function effective(){return preference==='system'?(mq&&mq.matches?'dark':'light'):preference;}
 function paint(notify){
  const root=global.document.documentElement,dark=effective()==='dark',p=brand.p,a=brand.a,action=actionFor(p);
  root.setAttribute('data-theme',dark?'dark':'light');
  root.setAttribute('data-theme-preference',preference);
  root.style.colorScheme=dark?'dark':'light';
  const ink=textPalette(dark?'dark':'light',textColors,p,a);
  const tokens={
   '--text':ink.main,'--text2':ink.muted,
   '--brand-bg':p,'--brand-ink':ink.header,'--brand-accent':a,'--brand-accent-ink':textOn(a),
   '--action':dark?'#245edb':action,'--action-hover':dark?'#1e4fbb':mix(action,'#000000',.16),'--on-action':'#ffffff',
   '--link':dark?'#9bc7ff':action,'--acc':a,'--accD':mix(a,'#000000',.15),'--accT':textOn(a),
   '--pri':dark?'#93c5fd':action,'--priD':dark?'#bfdbfe':mix(action,'#000000',.2),
   '--soft':dark?'#20334d':mix(p,'#ffffff',.90),'--winrow':dark?'#403318':mix(a,'#ffffff',.92),
   '--cream':dark?'#302919':mix(a,'#ffffff',.95),'--hl':dark?'#403016':brand.hl,
   '--hl-ink':dark?'#ffe2a8':textOn(brand.hl),'--league-highlight':brand.hl,
   '--league-highlight-ink':textOn(brand.hl)
  };
  Object.keys(tokens).forEach(k=>root.style.setProperty(k,tokens[k]));
  if(notify)global.document.dispatchEvent(new CustomEvent('sohail-theme-change',{detail:{preference,theme:effective()}}));
 }
 function setPreference(mode){
  if(!['light','dark','system'].includes(mode))return false;
  preference=mode;try{global.localStorage.setItem('theme',mode);}catch(_){}
  paint(true);return true;
 }
 function setBrand(p,a,hl){
  if(!hex(p)||!hex(a))return false;
  brand={p:hex(p),a:hex(a),hl:hex(hl,brand.hl)};paint(false);
  try{global.localStorage.setItem('lsc',JSON.stringify(brand));}catch(_){}
  return true;
 }
 function setTextColors(value){textColors=normalizeTextColors(value);paint(false);return {...textColors};}
 global.SohailAppearance=Object.freeze({hex,luminance,contrast,mix,textOn,actionFor,normalizeTextColors,textPalette,setTextColors,preference:()=>preference,effective,setPreference,setBrand});
 paint(false);
 const listener=()=>{if(preference==='system')paint(true);};
 if(mq){if(mq.addEventListener)mq.addEventListener('change',listener);else if(mq.addListener)mq.addListener(listener);}
})(window);
