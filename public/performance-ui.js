/* Local-only, bounded measurements. No tokens, names, IPs or parameter values stored. */
(function(root){
 'use strict';
 const samples=[],fetcher=root.fetch.bind(root),clock=()=>performance.now();
 const record=(operation,ms,extra={})=>{samples.push({operation,ms:Math.round(ms),...extra});if(samples.length>100)samples.shift();};
 root.fetch=async function(input,init){
  let operation=null;try{const u=new URL(typeof input==='string'?input:input.url,location.origin);if(u.origin===location.origin&&/^\/api\/(?:login|state|save|liga|users|password|passkey|reset|messages|mensajes|audit|backup|health|login-header|notify-channels)$/.test(u.pathname))operation=u.pathname.replace('/api/','')+(['rating','history','storage'].includes(u.searchParams.get('operacion'))?':'+u.searchParams.get('operacion'):'');}catch(_){}
  const start=clock();try{const r=await fetcher(input,init);if(operation){const h=r.headers.get('Server-Timing')||'';record(operation,clock()-start,{status:r.status,serverMs:Number(h.match(/app;dur=([\d.]+)/)?.[1]||0)});}return r;}catch(e){if(operation)record(operation,clock()-start,{status:0});throw e;}
 };
 function show(){const en=typeof LANG!=='undefined'&&LANG==='en',d=document.createElement('dialog');d.className='ui-picker performance-review';
  const title=document.createElement('h2');title.textContent=en?'Recent load times':'Tiempos de carga recientes';
  const note=document.createElement('p');note.textContent=en?'This browser only. Request time to response headers, not a guarantee of total screen load time.':'Solo este navegador. Tiempo hasta recibir las cabeceras, no una garantía del tiempo total de la pantalla.';
  const out=document.createElement('pre');out.textContent=samples.slice(-25).map(s=>`${s.operation}: ${s.ms} ms · HTTP ${s.status} · ${en?'server':'servidor'} ${s.serverMs||0} ms`).join('\n')||(en?'No requests yet.':'Todavía no hay solicitudes.');
  const close=document.createElement('button');close.className='btn';close.textContent=en?'Close':'Cerrar';close.onclick=()=>d.close();d.append(title,note,out,close);document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();}
 root.SohailPerformance=Object.freeze({report:()=>samples.map(x=>({...x})),show});
})(window);
