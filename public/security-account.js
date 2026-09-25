/* Sohail Security Part 2: explicit account controls and scoped step-up prompts.
   Never stores a password or token in browser storage or HTML attributes. */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module==='object'&&module.exports){module.exports=api;return;}
 const originalFetch=root.fetch.bind(root),en=()=>typeof LANG!=='undefined'&&LANG==='en';
 const texts={
  es:{title:'Confirmá tu identidad',why:'Esta operación necesita una verificación reciente. Es tu contraseña de administrador, no la nueva del jugador.',whyPlayer:'Confirmá con tu contraseña actual o una passkey. La operación todavía no se realizó.',password:'Tu contraseña actual',verify:'Confirmar con contraseña',passkey:'Usar passkey / Face ID',cancel:'Cancelar',working:'Verificando…',failed:'No se pudo verificar. Revisá tu contraseña o probá otra vez.',expired:'Tu sesión cambió o venció. Volvé a ingresar.',sessions:'Sesiones y dispositivos',sessionsHint:'Sesiones de hasta 24 horas. Cerrar una sesión no elimina las passkeys del dispositivo.',open:'Ver mis sesiones',current:'Esta sesión',created:'Inicio',expires:'Vence',revoke:'Cerrar sesión',all:'Cerrar todas mis sesiones',allConfirm:'¿Cerrar todas tus sesiones? Tendrás que volver a ingresar en cada dispositivo.',loading:'Cargando sesiones…',close:'Cerrar',none:'No quedan sesiones activas.',logoutFailed:'No se confirmó el cierre en el servidor. Reintentá antes de dejar este dispositivo.',retry:'Reintentar cierre',revoked:'Sesión cerrada.',loginAgain:'La contraseña se guardó. Ingresá nuevamente con la nueva contraseña.',temporary:'Esta clave es temporal: el jugador deberá elegir una personal al entrar. El restablecimiento cierra sus sesiones.',revokeKeys:'También eliminar sus passkeys (solo si perdió el dispositivo o sospechás un acceso indebido).',resetDone:'Contraseña temporal guardada. El jugador deberá cambiarla al entrar.'},
  en:{title:'Verify your identity',why:'This action needs recent verification. Enter your administrator password, not the player’s new password.',whyPlayer:'Verify using your current password or a passkey. The action has not been performed yet.',password:'Your current password',verify:'Verify with password',passkey:'Use passkey / Face ID',cancel:'Cancel',working:'Verifying…',failed:'Could not verify. Check your password or try again.',expired:'Your session changed or expired. Sign in again.',sessions:'Sessions and devices',sessionsHint:'Sessions last up to 24 hours. Closing a session does not remove device passkeys.',open:'View my sessions',current:'This session',created:'Started',expires:'Expires',revoke:'Sign out session',all:'Sign out all my sessions',allConfirm:'Sign out all your sessions? You will need to sign in again on each device.',loading:'Loading sessions…',close:'Close',none:'There are no active sessions left.',logoutFailed:'Server sign-out was not confirmed. Retry before leaving this device.',retry:'Retry sign-out',revoked:'Session signed out.',loginAgain:'Password saved. Sign in again using your new password.',temporary:'This password is temporary: the player must choose a personal one at sign-in. Resetting signs out their sessions.',revokeKeys:'Also delete their passkeys (only for a lost device or suspected unauthorized access).',resetDone:'Temporary password saved. The player must change it at sign-in.'}
 };
 const tr=k=>texts[en()?'en':'es'][k]||k;
 const getToken=()=>typeof _token==='string'?_token:'';
 const ctx=()=>[typeof _ligaActual==='string'?_ligaActual:'',typeof _saveSessionKey==='function'?_saveSessionKey():getToken()].join('|');
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const translations={es:{exit:'Salir',pwf_why:'Ingresaste con una contraseña temporal. Elegí una personal de 6 a 128 caracteres para continuar.',pwf_short:'Usá entre 6 y 128 caracteres. Podés usar una frase y espacios.',pass_short:'Usá entre 6 y 128 caracteres; para un restablecimiento, también se admite tenis.',fix_change_password_for:'¿Asignar una contraseña temporal a {n}? Se cerrarán sus sesiones y deberá cambiarla al entrar.',ui36_text_213:'Contraseña temporal (6–128) o tenis',p2_temporary:texts.es.temporary,p2_revoke_keys:texts.es.revokeKeys,p2_reset_done:texts.es.resetDone},en:{exit:'Sign out',pwf_why:'You signed in using a temporary password. Choose a personal password of 6 to 128 characters to continue.',pwf_short:'Use 6 to 128 characters. Passphrases and spaces are allowed.',pass_short:'Use 6 to 128 characters; tenis is also allowed for a reset.',fix_change_password_for:'Assign a temporary password to {n}? Their sessions will be closed and they must change it at sign-in.',ui36_text_213:'Temporary password (6–128) or tenis',p2_temporary:texts.en.temporary,p2_revoke_keys:texts.en.revokeKeys,p2_reset_done:texts.en.resetDone}};
 if(typeof TRANSLATIONS!=='undefined')for(const l of ['es','en'])Object.assign(TRANSLATIONS[l],translations[l]);
 const previousApiError=typeof apiError==='function'?apiError:null;
 if(previousApiError)root.apiError=function(d){
  const known={AUTH_UNAVAILABLE:['No se pudo comprobar la sesión. Reintentá.','Could not verify the session. Try again.'],NO_PASSKEY:['No tenés passkeys vinculadas. Usá tu contraseña actual.','No linked passkeys. Use your current password.'],SESSION_ORIGIN:['La solicitud no corresponde a este sitio. Recargá la página.','The request does not belong to this site. Reload the page.'],WRONG_PASSKEY:['La passkey no corresponde a tu cuenta o no pudo verificarse.','The passkey does not belong to your account or could not be verified.'],PASSKEY_ERROR:['No se pudo completar la operación con la passkey.','Could not complete the passkey operation.'],PASSKEY_CONFLICT:['El dispositivo cambió o el registro ya existe. Reintentá desde el inicio.','The device changed or the credential already exists. Start again.'],WRONG_PASSWORD:['La contraseña actual no es correcta.','Your current password is incorrect.'],PASSKEY_LIMIT:['Eliminá un dispositivo antes de registrar otro.','Remove a device before registering another.'],REAUTH_REQUIRED:['Confirmá tu identidad para continuar.','Verify your identity to continue.'],AUTH_BUSY:['Hay muchos accesos simultáneos. Reintentá en unos segundos.','Sign-in is busy. Try again in a few seconds.'],AUTH_RATE_LIMIT:['Demasiados intentos. Esperá antes de reintentar.','Too many attempts. Wait before retrying.'],PASSWORD_POLICY:['Elegí una contraseña personal de 6 a 128 caracteres. El administrador puede usar tenis para restablecer.','Choose a personal password of 6 to 128 characters. Administrators may reset to tenis.'],PASSWORD_REUSED:['La contraseña nueva debe ser diferente.','The new password must be different.'],TEMPORARY_PASSWORD_LOGIN:['Entrá con la contraseña temporal y cambiala antes de usar Face ID.','Sign in with your temporary password and change it before using Face ID.'],PASSKEY_CHALLENGE:['La verificación venció o ya fue usada. Reintentá desde el inicio.','Verification expired or was already used. Start again.'],PASSKEY_IDENTITY:['La passkey no corresponde a esta cuenta. Usá tu contraseña.','This passkey does not belong to this account. Use your password.'],SCHEMA_REQUIRED:['No está disponible la seguridad de cuentas. Contactá al administrador; no repitas SQL antiguos.','Account security is unavailable. Contact the administrator; do not rerun old SQL scripts.'],LOGOUT_UNCONFIRMED:[texts.es.logoutFailed,texts.en.logoutFailed]};
  return known[d?.code]?.[en()?1:0]||previousApiError(d);
 };
 function node(tag,text,attrs={}){const n=document.createElement(tag);if(text)n.textContent=text;for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;}
 function dialog(title){
  const d=node('dialog',null,{class:'p2-dialog','aria-labelledby':'p2-title-'+title});
  const heading=node('h2',tr(title),{id:'p2-title-'+title,'data-p2-text':title});d.append(heading);if(typeof createDialogLanguageSwitcher==='function')d.append(createDialogLanguageSwitcher('p2-language-'+title));
  document.body.append(d);if(typeof d.showModal==='function')d.showModal();else d.setAttribute('open','');
  return d;
 }
 function translate(){if(typeof updateDialogLanguageSwitchers==='function')document.querySelectorAll('.p2-dialog').forEach(d=>updateDialogLanguageSwitchers(d));document.querySelectorAll('[data-p2-text]').forEach(n=>{n.textContent=tr(n.dataset.p2Text);});}
 async function post(path,body,token=getToken()){
  const r=await originalFetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Sohail-Session':'1',Authorization:'Bearer '+token},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const d=await r.json();if(!r.ok)throw Object.assign(new Error(typeof apiError==='function'?apiError(d):tr('failed')),{code:d.code});return d;
 }
 let verification=null,verificationDialog=null;
 function verify(){
  if(verification)return verification;
  const startContext=ctx(),startToken=getToken();
  verification=new Promise(resolve=>{
   const d=dialog('title');verificationDialog=d;
   const reason=(typeof currentUser!=='undefined'&&currentUser&&typeof esAdmin==='function'&&esAdmin(currentUser))?'why':'whyPlayer';
   d.append(node('p',tr(reason),{'data-p2-text':reason}));
   const form=node('form');form.method='dialog';
   const label=node('label',tr('password'),{for:'p2-current-pass','data-p2-text':'password'});
   const input=node('input',null,{id:'p2-current-pass',type:'password',autocomplete:'current-password',maxlength:'128',autocapitalize:'off',spellcheck:'false'});
   const error=node('p','',{role:'alert',class:'p2-error'}),actions=node('div',null,{class:'p2-actions'});
   const submit=node('button',tr('verify'),{type:'submit',class:'btn btn-primary','data-p2-text':'verify'});
   const pk=node('button',tr('passkey'),{type:'button',class:'btn','data-p2-text':'passkey'});
   const cancel=node('button',tr('cancel'),{type:'button',class:'btn','data-p2-text':'cancel'});
   actions.append(submit,pk,cancel);form.append(label,input,error,actions);d.append(form);input.focus();
   let busy=false,closed=false;
   const finish=value=>{if(closed)return;closed=true;input.value='';root.SimpleWebAuthnBrowser?.WebAuthnAbortService?.cancelCeremony();d.close?.();d.remove();verificationDialog=null;resolve(value);};
   cancel.onclick=()=>finish(false);d.addEventListener('cancel',e=>{e.preventDefault();finish(false);});
   async function run(method){
    if(busy||closed)return;busy=true;submit.disabled=true;pk.disabled=true;error.textContent=tr('working');
    try{
     let result;
     if(ctx()!==startContext||getToken()!==startToken)throw Error(tr('expired'));
     if(method==='passkey'){
      if(!root.SimpleWebAuthnBrowser?.startAuthentication)throw Error(tr('failed'));
      const options=await post('/api/passkey',{accion:'reauth-start'},startToken);
      if(closed)return;
      const cred=await root.SimpleWebAuthnBrowser.startAuthentication({optionsJSON:options});
      if(closed)return;
      result=await post('/api/passkey',{accion:'reauth-finish',cred},startToken);
     }else{
      if(!input.value)throw Error(tr('failed'));
      result=await post('/api/login',{accion:'session-reauth',pass:input.value},startToken);input.value='';
     }
     if(closed)return;
     if(ctx()!==startContext||getToken()!==startToken||!result.token)throw Error(tr('expired'));
     _token=result.token;root.SohailSession?.enable();finish(true);
    }catch(e){if(!closed)error.textContent=e.message||tr('failed');}
    finally{busy=false;if(!closed){submit.disabled=false;pk.disabled=false;}}
   }
   form.onsubmit=e=>{e.preventDefault();run('password');};pk.onclick=()=>run('passkey');
  }).finally(()=>{verification=null;});
  return verification;
 }
 root.fetch=api.guard({fetcher:originalFetch,origin:location.origin,getToken,context:ctx,verify});
 async function sessions(){
  if(document.getElementById('p2-sessions'))return;
  const start=ctx(),d=dialog('sessions');d.id='p2-sessions';d.append(node('p',tr('sessionsHint'),{'data-p2-text':'sessionsHint'}));
  const content=node('div'),status=node('p',tr('loading'),{role:'status'}),buttons=node('div',null,{class:'p2-actions'});
  const close=node('button',tr('close'),{type:'button',class:'btn','data-p2-text':'close'});close.onclick=()=>{d.close?.();d.remove();};d.addEventListener('cancel',()=>d.remove());
  buttons.append(close);d.append(content,status,buttons);
  async function load(){
   try{
    const data=await post('/api/login',{accion:'session-list'});if(!d.isConnected||ctx()!==start)return;
    content.replaceChildren();status.textContent='';
    if(!Array.isArray(data.sessions))throw Error(tr('expired'));
    for(const s of data.sessions){
      const row=node('section',null,{class:'p2-session'});row.append(node('strong',s.device+(s.current?' · '+tr('current'):'')));
      row.append(node('p',tr('created')+': '+new Date(s.created).toLocaleString(en()?'en-GB':'es-ES')+' · '+tr('expires')+': '+new Date(s.expires).toLocaleString(en()?'en-GB':'es-ES')));
      const b=node('button',tr('revoke'),{type:'button',class:'btn','data-p2-text':'revoke'});
      b.onclick=async()=>{b.disabled=true;try{const r=await post('/api/login',{accion:'session-revoke',id:s.id});if(r.signedOut){close.click();await doLogout();}else await load();}catch(e){status.textContent=e.message;b.disabled=false;}};
      row.append(b);content.append(row);
    }
    if(!data.sessions.length)status.textContent=tr('none');
   }catch(e){if(d.isConnected)status.textContent=e.message;}
  }
  const all=node('button',tr('all'),{type:'button',class:'btn btn-danger','data-p2-text':'all'});
  all.onclick=async()=>{if(!confirm(tr('allConfirm')))return;all.disabled=true;try{await post('/api/login',{accion:'session-logout-all'});close.click();await doLogout();}catch(e){status.textContent=e.message;all.disabled=false;}};
  buttons.prepend(all);await load();
 }
 function logoutNotice(){
  document.getElementById('p2-logout-warning')?.remove();
  const panel=node('div',null,{id:'p2-logout-warning',class:'p2-logout-warning',role:'alert'});
  panel.append(node('p',tr('logoutFailed'),{'data-p2-text':'logoutFailed'}));
  const b=node('button',tr('retry'),{type:'button',class:'btn','data-p2-text':'retry'});b.onclick=async()=>{b.disabled=true;try{const r=await root.SohailSession.logout();if(r?.ok)panel.remove();}finally{b.disabled=false;}};
  panel.append(b);document.getElementById('login-screen')?.prepend(panel);
 }
 root.SohailSecurity={verify,sessions,logoutNotice,cancel:()=>{verificationDialog?.dispatchEvent(new Event('cancel',{cancelable:true}));document.getElementById('p2-sessions')?.remove();},
  cardHTML:()=>'<div class="card p2-account-card"><div class="section-lbl">'+escape(tr('sessions'))+'</div><p>'+escape(tr('sessionsHint'))+'</p><button class="btn" type="button" onclick="SohailSecurity.sessions()">'+escape(tr('open'))+'</button></div>',
  loginAgain:()=>{const el=document.getElementById('login-err');if(el){el.textContent=tr('loginAgain');el.style.display='block';}}};
 new MutationObserver(translate).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // Automatic retry is allowed ONLY for the explicit pre-mutation step-up code,
 // once, to a same-origin allowlisted API, with unchanged league/account context.
 function guard({fetcher,origin,getToken,context,verify}){
  return async function(input,init={}){
   let eligible=false,headers,scope,token;
   try{
    const url=new URL(typeof input==='string'?input:input.url,origin);headers=new Headers(init.headers||{});
    token=getToken();scope=context();eligible=url.origin===origin&&['/api/password','/api/liga','/api/save','/api/passkey'].includes(url.pathname)&&
      (init.method||'GET').toUpperCase()==='POST'&&typeof init.body==='string'&&!!token&&headers.get('Authorization')==='Bearer '+token;
   }catch(_){}
   const response=await fetcher(input,init);
   if(!eligible||response.status!==403)return response;
   let body;try{body=await response.clone().json();}catch(_){return response;}
   if(body.code!=='REAUTH_REQUIRED'||context()!==scope||getToken()!==token||init.signal?.aborted)return response;
   if(!await verify()||context()!==scope||init.signal?.aborted||!getToken())return response;
   headers.set('Authorization','Bearer '+getToken());
   return fetcher(input,{...init,headers});
  };
 }
 return {guard};
});
