'use strict';
// v4.9 / Security part 2. Native asynchronous scrypt; no extra runtime dependency.
// These parameters are a documented OWASP CPU/RAM tradeoff (32 MiB per operation).
const crypto = require('node:crypto');
const {promisify} = require('node:util');
const scrypt = promisify(crypto.scrypt), pbkdf2 = promisify(crypto.pbkdf2);
const N=32768, R=8, P=3, BYTES=32, MAX_BYTES=512, MIN_LENGTH=15, MAX_LENGTH=128;
const PREFIX=`v3:scrypt:${N}:${R}:${P}:`;
const FORMAT=/^v3:scrypt:32768:8:3:([0-9a-f]{32}):([0-9a-f]{64})$/;
const DEFAULTS=new Set(['tenis','admin123','123456789012345','1234567890123456','passwordpassword','password12345678','qwertyuiopasdfgh','qwertyuiop123456']);
let active=0;const waiting=[];
async function costly(fn){
 if(active>=2){
  if(waiting.length>=12)throw Object.assign(new Error('Hay demasiados accesos simultáneos. Reintentá en unos segundos.'),{status:503,code:'AUTH_BUSY'});
  await new Promise(resolve=>waiting.push(resolve));
 }else active++;
 try{return await fn();}finally{if(waiting.length)waiting.shift()();else active--;}
}
function validInput(value){return typeof value==='string'&&value.length>0&&value.length<=MAX_LENGTH&&Buffer.byteLength(value,'utf8')<=MAX_BYTES;}
function same(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function isModern(stored){return typeof stored==='string'&&FORMAT.test(stored);}
function policy(value,{temporary=false}={}){
 if(!validInput(value))return false;
 if(temporary&&value==='tenis')return true;
 // Do not trim or normalize a secret. Spaces and non-ASCII characters are valid.
 return [...value].length>=MIN_LENGTH&&!DEFAULTS.has(value.toLowerCase())&&!/^(.)\1+$/.test(value);
}
async function hashPassword(value){
 if(!validInput(value))throw Object.assign(new Error('Contraseña inválida.'),{status:400,code:'PASSWORD_POLICY'});
 const salt=crypto.randomBytes(16).toString('hex');
 const key=await costly(()=>scrypt(value,Buffer.from(salt,'hex'),BYTES,{N,r:R,p:P,maxmem:48*1024*1024}));
 return PREFIX+salt+':'+key.toString('hex');
}
async function verifyPassword(stored,plain){
 if(typeof stored!=='string'||!validInput(plain))return false;
 const m=FORMAT.exec(stored);
 if(m){const key=await costly(()=>scrypt(plain,Buffer.from(m[1],'hex'),BYTES,{N,r:R,p:P,maxmem:48*1024*1024}));return same(m[2],key.toString('hex'));}
 // Unknown version/parameters must fail closed, never run caller-defined costs.
 if(stored.startsWith('v3:'))return false;
 if(/^v2:[0-9a-f]{64}$/.test(stored)){
  const key=await costly(()=>pbkdf2(plain,'LigaSohailSecure2026',100000,32,'sha256'));
  return same(stored,'v2:'+key.toString('hex'));
 }
 if(/^v1:[0-9a-f]{64}$/.test(stored))return same(stored,'v1:'+crypto.createHash('sha256').update(plain,'utf8').digest('hex'));
 if(/^v\d+:/.test(stored))return false;
 return same(stored,plain); // Legacy cleartext is accepted only to migrate after proof.
}
module.exports={hashPassword,verifyPassword,isModern,policy,validInput,MIN_LENGTH,MAX_LENGTH,PREFIX};
