'use strict';
// Private handler reached through /api/liga?operacion=login-order.
// This permission is cosmetic and global: current administrators can arrange
// the public closed-league list, not read/edit another league's sporting state.
const {SUPA_URL,supaHeaders,auth,readState,sesionEsAdmin,rpc}=require('./_lib');
const order=require('../public/league-order');
const fail=(status,code,message)=>Object.assign(new Error(message),{status,code});
const MAX_LEAGUES=5000;
function validIds(ids){return Array.isArray(ids)&&ids.length<=MAX_LEAGUES&&ids.every(id=>typeof id==='string'&&/^[a-z0-9][a-z0-9-]{0,63}$/.test(id))&&new Set(ids).size===ids.length;}
async function readSettings(){
  const r=await fetch(SUPA_URL+'/rest/v1/sohail_login_order?id=eq.1&select=version,league_ids',{
    headers:supaHeaders(),signal:AbortSignal.timeout(4000)
  });
  if(!r.ok)throw fail(503,r.status===404?'LOGIN_ORDER_SCHEMA_REQUIRED':'LOGIN_ORDER_UNAVAILABLE',
    r.status===404?'Falta instalar 06_login_league_order.sql en Supabase.':'No se pudo leer el orden guardado. Intentá nuevamente.');
  const rows=await r.json(),row=Array.isArray(rows)&&rows.length===1?rows[0]:null;
  if(!row||!Number.isSafeInteger(row.version)||row.version<0||!validIds(row.league_ids))
    throw fail(503,'LOGIN_ORDER_UNAVAILABLE','La configuración del orden no está disponible. Comprobá el SQL 07.');
  return row;
}
// Paginated metadata only. Continue until EMPTY even if server max_rows is small.
async function readIndex(){
  const rows=[],seen=new Set();
  for(let offset=0;offset<=MAX_LEAGUES;){
    const r=await fetch(SUPA_URL+'/rest/v1/liga_index?select=id,nombre,estado,orden&order=id.asc&limit=250&offset='+offset,{
      headers:supaHeaders(),signal:AbortSignal.timeout(10000)
    });
    if(!r.ok)throw fail(503,'LEAGUE_INDEX_UNAVAILABLE','No se pudo leer la lista completa de ligas.');
    const page=await r.json();
    if(!Array.isArray(page))throw fail(503,'LEAGUE_INDEX_UNAVAILABLE','La lista de ligas es inválida.');
    if(!page.length)return rows.sort((a,b)=>(a.orden||0)-(b.orden||0));
    for(const l of page){
      if(!l||typeof l.id!=='string'||seen.has(l.id))throw fail(503,'LEAGUE_INDEX_UNAVAILABLE','La lista de ligas cambió. Volvé a cargarla.');
      seen.add(l.id);rows.push(l);
    }
    offset+=page.length;
  }
  throw fail(503,'LEAGUE_INDEX_TOO_LARGE','La lista excede las 5000 ligas. No se mostró una lista incompleta.');
}
async function publicList(){
  const [index,settings]=await Promise.all([readIndex(),readSettings().catch(()=>null)]);
  // Missing migration or a cosmetic outage must never prevent sign-in.
  return {ligas:order.apply(index,settings?.league_ids),loginOrderAvailable:!!settings};
}
async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
  const session=await auth(req);
  if(!session)return res.status(401).json({code:'INVALID_SESSION',error:'Sesión inválida o expirada. Volvé a entrar.'});
  // Always authorize from the authenticated source, NEVER a caller-supplied ID.
  const source=await readState(session.src);
  if(!sesionEsAdmin(session,source?.users))return res.status(403).json({code:'FORBIDDEN',error:'Solo un administrador o superadministrador puede ordenar las ligas del login.'});
  if(body.accion==='leer'){
    const [index,settings]=await Promise.all([readIndex(),readSettings()]);
    return res.status(200).json({ok:true,version:settings.version,ligas:order.closed(order.apply(index,settings.league_ids))});
  }
  if(body.accion!=='guardar')return res.status(400).json({code:'INVALID_ACTION',error:'Acción desconocida.'});
  if(!validIds(body.ids)||!Number.isSafeInteger(body.version)||body.version<0)
    return res.status(400).json({code:'INVALID_ORDER',error:'El orden debe incluir cada liga cerrada una sola vez y una versión válida.'});
  const d=await rpc('sohail_set_login_league_order',{
    p_actor:session.u,p_actor_key:session.pk,p_epoch:session.sv,p_source:session.src,p_expected:body.version,p_ids:body.ids
  });
  if(!d||!d.ok){
    const code=d?.code||'LOGIN_ORDER_UNAVAILABLE';
    const messages={FORBIDDEN:'Ya no tenés permiso para guardar el orden.',CONFLICT:'Otro administrador cambió el orden. Recargá la lista antes de guardar.',
      LEAGUES_CHANGED:'Cambió la lista de ligas cerradas. Recargala antes de guardar.',INVALID_ORDER:'La lista contiene identificadores inválidos o repetidos.'};
    return res.status(code==='FORBIDDEN'?403:code==='INVALID_ORDER'?400:409).json({code,error:messages[code]||'No se pudo guardar el orden. Recargá antes de reintentar.'});
  }
  return res.status(200).json({ok:true,version:d.version,ids:d.ids});
}
module.exports={handler,publicList,readSettings,readIndex,validIds,MAX_LEAGUES};
