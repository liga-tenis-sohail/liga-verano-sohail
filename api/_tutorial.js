const lib=require('./_lib');
module.exports=require('./_http').wrap(async function(req,res){
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Método no permitido'});
 if(!lib.envOK(res))return;
 const session=await lib.auth(req);
 if(!session)return res.status(401).json({error:'Sesión inválida.',code:'SESSION_EXPIRED'});
 const account=await lib.readAccount(session.pk),version=1;
 if(req.method==='GET')return res.status(200).json({version,epoch:Number(account.tutorial_epoch),pending:Number(account.tutorial_version)<version||Number(account.tutorial_done_epoch)<Number(account.tutorial_epoch),status:account.tutorial_status});
 const body=req.body||{};
 if(!['completed','skipped'].includes(body.status)||body.version!==version||body.epoch!==Number(account.tutorial_epoch))return res.status(409).json({error:'La guía cambió. Volvé a abrirla.',code:'TUTORIAL_CONFLICT'});
 // Condición sobre epoch: una pestaña antigua no reconoce un reset nuevo.
 const q=await fetch(lib.SUPA_URL+'/rest/v1/sohail_account_security?id=eq.'+encodeURIComponent(session.pk)+'&epoch=eq.'+session.sv+'&tutorial_epoch=eq.'+body.epoch,{method:'PATCH',headers:lib.supaHeaders({'Content-Type':'application/json',Prefer:'return=representation'}),body:JSON.stringify({tutorial_version:version,tutorial_done_epoch:body.epoch,tutorial_status:body.status})});
 if(!q.ok)throw Object.assign(new Error('No se pudo guardar la preferencia.'),{status:503,code:'SERVICE_UNAVAILABLE'});
 const rows=await q.json();if(!rows.length)return res.status(409).json({error:'La sesión cambió.',code:'TUTORIAL_CONFLICT'});
 return res.status(200).json({ok:true});
});
