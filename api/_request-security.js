'use strict';
// Security Part 3: request validation and shared, atomic rate budgets.
// No token, password, full URL, user name or IP is written to logs here.
const crypto = require('node:crypto');
const net = require('node:net');
const METHODS = Object.freeze({
  login:['POST'],password:['POST'],passkey:['POST'],save:['POST'],state:['GET'],
  liga:['POST'],users:['GET'],'login-header':['GET'],audit:['GET'],backup:['GET'],
  health:['GET'],'notify-channels':['GET','POST','PATCH','DELETE']
});
const LIMITS = Object.freeze({public:120,auth:30,read:240,write:60,heavy:12,backup:3});
const err=(status,code,es,en)=>Object.assign(new Error(es),{status,code,en});
const english=req=>/^en(?:[-,;\s]|$)/i.test(String(req.headers?.['accept-language']||''));
function address(req){
 const h=req.headers||{};
 // Vercel supplies these headers. On a non-Vercel host trust the socket only.
 // Tests without a socket share an explicit unknown-address bucket, not a bypass.
 const value=process.env.VERCEL==='1'?(h['x-vercel-forwarded-for']||h['x-forwarded-for']):req.socket?.remoteAddress;
 let ip=typeof value==='string'?value.split(',')[0].trim():'';
 if(ip.startsWith('::ffff:')&&net.isIP(ip.slice(7))===4)ip=ip.slice(7);
 if(!net.isIP(ip))return 'unknown';
 if(net.isIP(ip)===6){try{ip=new URL('http://['+ip+']/').hostname.slice(1,-1);}catch(_){return 'unknown';}}
 return ip;
}
function validateTree(value){
 const stack=[[value,0]],seen=new Set();let count=0;
 while(stack.length){
  const [item,depth,exit]=stack.pop();
  if(exit){seen.delete(item);continue;}
  if(++count>120000||depth>55)throw err(413,'REQUEST_COMPLEXITY','La solicitud tiene demasiados elementos o niveles.','The request has too many elements or nesting levels.');
  if(item&&typeof item==='object'){
   if(seen.has(item))throw err(400,'INVALID_REQUEST','La solicitud contiene una referencia circular.','The request contains a circular reference.');
   seen.add(item);stack.push([item,depth,true]);
   const proto=Object.getPrototypeOf(item);
   if(!Array.isArray(item)&&proto!==Object.prototype&&proto!==null)throw err(400,'INVALID_REQUEST','Formato de solicitud no válido.','Invalid request format.');
   for(const key of Object.keys(item)){
    if(['__proto__','constructor','prototype'].includes(key))throw err(400,'UNSAFE_OBJECT_KEY','La solicitud contiene una clave no permitida.','The request contains a prohibited object key.');
    stack.push([item[key],depth+1]);
   }
  }else if(typeof item==='number'&&!Number.isFinite(item)||['function','symbol','bigint'].includes(typeof item))throw err(400,'INVALID_REQUEST','Valor de solicitud no válido.','Invalid request value.');
 }
}
function validate(req,route){
 const h=req.headers||{};
 if(process.env.VERCEL_ENV==='preview'&&process.env.SOHAIL_PREVIEW_DATA_ACCESS!=='1')throw err(503,'PREVIEW_DATA_DISABLED','Esta vista previa no tiene acceso a los datos. Usá la dirección habitual de la liga.','This preview has no data access. Use the league’s normal production address.');
 if(METHODS[route]&&!METHODS[route].includes(req.method))throw err(405,'METHOD_NOT_ALLOWED','Método no permitido.','Method not allowed.');
 if(typeof h.authorization!=='undefined'&&(typeof h.authorization!=='string'||h.authorization.length>8200))throw err(400,'INVALID_AUTH_HEADER','Cabecera de autorización inválida.','Invalid authorization header.');
 if(h['sec-fetch-site']&&!['same-origin','none'].includes(h['sec-fetch-site']))throw err(403,'REQUEST_ORIGIN','Solicitud desde otro sitio no permitida.','Cross-site requests are not permitted.');
 if(h.origin){
  let origin;try{origin=new URL(h.origin);}catch(_){throw err(403,'REQUEST_ORIGIN','Origen no permitido.','Origin not permitted.');}
  if(origin.origin!==h.origin||origin.host!==h.host||!['https:','http:'].includes(origin.protocol)||origin.username||origin.password||origin.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname))throw err(403,'REQUEST_ORIGIN','Origen no permitido.','Origin not permitted.');
 }
 if(route==='login'&&!req.body?.accion){
  const b=req.body||{};
  if(typeof b.user!=='string'||typeof b.pass!=='string'||!b.user.trim()||!b.pass||b.user.trim().length>120||b.pass.length>128)throw err(400,'INVALID_LOGIN_INPUT','Revisá el usuario y la contraseña.','Check the username and password.');
 }
 if(req.query){
  for(const [key,v]of Object.entries(req.query))if(key.length>80||typeof v!=='string'||v.length>2048)throw err(400,'INVALID_QUERY','Parámetros de consulta repetidos o inválidos.','Duplicate or invalid query parameters.');
 }
 if((['POST','PUT','PATCH'].includes(req.method)||req.method==='DELETE'&&req.body!==undefined)){
  // A supplied media type MUST be JSON. A pre-parsed object is also accepted
  // from a server adapter without a Content-Type, never a raw/form string.
  if(h['content-type']&&!/^application\/json(?:\s*;|$)/i.test(h['content-type']))throw err(415,'JSON_REQUIRED','Enviá la solicitud como JSON.','Send the request as JSON.');
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))throw err(400,'INVALID_REQUEST','La solicitud debe ser un objeto JSON.','The request must be a JSON object.');
  const max=['save','liga'].includes(route)?4*1024*1024:256*1024;
  const length=h['content-length'];
  if(length!==undefined&&(!/^\d+$/.test(String(length))||Number(length)>max))throw err(413,'REQUEST_TOO_LARGE','La solicitud es demasiado grande. No se guardó.','The request is too large. Nothing was saved.');
  validateTree(req.body);
  if(Buffer.byteLength(JSON.stringify(req.body),'utf8')>max)throw err(413,'REQUEST_TOO_LARGE','La solicitud es demasiado grande. No se guardó.','The request is too large. Nothing was saved.');
 }
}
function category(req,route){
 if(route==='backup')return null; // The backup handler consumes ONLY after checking its secret.
 if(['login','password','passkey'].includes(route))return 'auth';
 const a=req.body?.accion||'',mode=req.body?.mode||'',op=req.query?.operacion;
 if(route==='liga'&&op==='history')return 'read';
 if(route==='liga'&&op==='storage')return mode==='clean'?'write':'read';
 if(route==='liga'){
  if(op==='rating')return 'heavy';
  if(op==='restore')return mode==='status'?'read':'heavy';
  if(op==='identities')return ['status','profile','operations'].includes(mode)?'read':'heavy';
  if(op==='injuries'||op==='login-order'&&a!=='leer')return 'write';
  const reads=['listar','ver','misLigas','listarAdmin','nuevosAdmin','listarGrupo','nuevosGrupo','listarPlayoff','nuevosPlayoff','contarNoLeidos','duplicadosCatalogo','catalogo','jugadores'];
  if(!op&&!reads.includes(a))return 'write';
 }
 if(route==='save'||route==='notify-channels'&&req.method!=='GET')return 'write';
 return req.headers?.authorization?'read':'public';
}
async function consume(req,kind,key){
 if(!Object.prototype.hasOwnProperty.call(LIMITS,kind))throw new Error('Unknown rate budget');
 const lib=require('./_lib');
 const secret=process.env.SESSION_SECRET;
 if(!secret)throw err(503,'SERVER_CONFIG','El servicio no está configurado.','The service is not configured.');
 const id=crypto.createHmac('sha256',secret).update('request-budget-v1:'+kind+':'+(key||address(req))).digest('hex');
 const r=await lib.rpc('sohail_p3_budget',{p_category:kind,p_key:id});
 if(!r||typeof r.allowed!=='boolean'||!Number.isInteger(r.retry_after)||r.retry_after<0||r.retry_after>300)throw err(503,'RATE_UNAVAILABLE','No se pudo comprobar el límite de solicitudes. Reintentá más tarde.','The request budget could not be verified. Retry later.');
 if(!r.allowed)throw Object.assign(err(429,'REQUEST_RATE_LIMIT','Demasiadas solicitudes. Esperá unos segundos antes de reintentar.','Too many requests. Wait before retrying.'),{retryAfter:Math.max(1,r.retry_after)});
}
async function before(req,route){validate(req,route);const c=category(req,route);if(c)await consume(req,c);}
module.exports={METHODS,LIMITS,address,validateTree,validate,category,consume,before,english};
