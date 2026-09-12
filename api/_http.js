'use strict';
function wrap(handler){return async function(req,res){
  res.setHeader('Cache-Control','no-store');
  try{return await handler(req,res);}catch(e){
    console.error('[Sohail]',e.code||e.name,e.message);
    if(!res.headersSent)return res.status(e.status||503).json({error:e.status?e.message:'No se pudo completar la operación. Intentá nuevamente.',code:e.code||'SERVICE_UNAVAILABLE',currentV:e.currentV});
  }
};}
module.exports={wrap};
