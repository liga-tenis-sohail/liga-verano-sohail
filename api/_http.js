'use strict';
const crypto=require('node:crypto'),context=require('./_request-context');
function wrap(handler,options={}){return function(req,res){return context.run(async()=>{
 const gate=require('./_request-security');
 const requestId=crypto.randomUUID();
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-Sohail-Request-Id',requestId);
 const json=res.json;
 res.json=function(payload){
  context.headers(this);
  // Also covers handlers which catch their own DB/Storage errors.
  if(this.statusCode>=500&&payload&&typeof payload==='object'){
   payload={code:/^[A-Z0-9_]{1,64}$/.test(payload.code||'')?payload.code:'SERVICE_UNAVAILABLE',error:gate.english(req)?'The operation could not be completed. Retry later.':'No se pudo completar la operación. Intentá nuevamente.',requestId};
  }
  return json.call(this,payload);
 };
 try{
  if(options.route)await gate.before(req,options.route);
  return await handler(req,res);
 }catch(e){
  const status=Number.isInteger(e.status)&&e.status>=400&&e.status<=599?e.status:503;
  const code=typeof e.code==='string'&&/^[A-Z0-9_]{1,64}$/.test(e.code)?e.code:'SERVICE_UNAVAILABLE';
  // Never log raw request bodies, database errors, tokens, URLs or passwords.
  if(status>=500)console.error('[Sohail]',JSON.stringify({requestId,route:options.route||'internal',status,code}));
  if(e.retryAfter)res.setHeader('Retry-After',String(e.retryAfter));
  if(status===405&&options.route)res.setHeader('Allow',gate.METHODS[options.route].join(', '));
  if(!res.headersSent)return res.status(status).json({error:gate.english(req)&&e.en?e.en:status<500?e.message:'No se pudo completar la operación. Intentá nuevamente.',code,currentV:e.currentV,requestId});
 }finally{res.json=json;}
});};}
module.exports={wrap};
