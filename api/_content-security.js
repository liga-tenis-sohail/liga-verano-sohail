'use strict';
// Binary data URLs only; SVG/HTML/custom schemes are never accepted as pictures.
function safeImage(value,maxChars=700000){
 if(typeof value!=='string'||value.length>maxChars)return '';
 const m=/^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if(!m||m[2].length%4!==0)return '';
 const b=Buffer.from(m[2],'base64');if(b.toString('base64')!==m[2])return '';
 const ok=m[1]==='png'?b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
   m[1]==='jpeg'?b.length>=4&&b[0]===255&&b[1]===216&&b[2]===255:
   m[1]==='gif'?b.length>=10&&/^GIF8[79]a$/.test(b.toString('ascii',0,6)):
   b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';
 if(!ok)return '';
 if(m[1]==='png'&&(b.readUInt32BE(16)<1||b.readUInt32BE(20)<1||b.readUInt32BE(16)>4096||b.readUInt32BE(20)>4096))return '';
 if(m[1]==='gif'&&(b.readUInt16LE(6)<1||b.readUInt16LE(8)<1||b.readUInt16LE(6)>4096||b.readUInt16LE(8)>4096))return '';
 return value;
}
function safeURL(value){
 if(typeof value!=='string'||value.length>2048||/[\u0000-\u0020\u007f-\u009f\\<>"`]/.test(value))return '';
 try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch(_){return '';}
}
function headerConfig(raw){
 const h=raw&&typeof raw==='object'?raw:{},hex=x=>typeof x==='string'&&/^#[a-f0-9]{6}$/i.test(x)?x:'';
 const links=(Array.isArray(h.links)?h.links:[]).filter(x=>x&&typeof x.text==='string'&&x.text.trim()&&safeURL(x.url)).slice(0,20).map(x=>({text:x.text.trim().slice(0,100),url:safeURL(x.url)}));
 return {color:hex(h.color)||'#0E3470',textColor:hex(h.textColor),colorDark:hex(h.colorDark),textColorDark:hex(h.textColorDark),links};
}
function message(row){return {...row,imagen:safeImage(row?.imagen)||null};}
function auditDetails(value,depth=0){
 if(depth>5)return '[depth-limit]';
 if(value===null||typeof value==='boolean'||typeof value==='number')return value;
 if(typeof value==='string')return value.slice(0,500);
 if(Array.isArray(value))return value.slice(0,50).map(v=>auditDetails(v,depth+1));
 if(!value||typeof value!=='object')return null;
 const out={};
 for(const [k,v]of Object.entries(value).slice(0,50)){
  if(['__proto__','constructor','prototype'].includes(k))continue;
  out[k]=/(?:pass|password|secret|token|api.?key|authorization|cookie|private.?key|stack|^error$|^body$|^response$|^url$)/i.test(k)&&typeof v==='string'?'[redacted]':auditDetails(v,depth+1);
 }
 return out;
}
module.exports={safeImage,safeURL,headerConfig,message,auditDetails};
