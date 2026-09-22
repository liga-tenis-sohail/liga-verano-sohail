/* Sohail v4.3: login-only ordering. Shared with the server; no mutable state. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.SohailLeagueOrder=api;
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  function closed(leagues){
    return (Array.isArray(leagues)?leagues:[])
      .filter(l=>l&&l.estado==='finalizada'&&typeof l.id==='string')
      .map((league,index)=>({league,index}))
      .sort((a,b)=>{
        const ar=Number.isSafeInteger(a.league.ordenLogin)&&a.league.ordenLogin>=0;
        const br=Number.isSafeInteger(b.league.ordenLogin)&&b.league.ordenLogin>=0;
        if(ar!==br)return ar?-1:1;
        if(ar&&a.league.ordenLogin!==b.league.ordenLogin)return a.league.ordenLogin-b.league.ordenLogin;
        const ao=Number.isFinite(a.league.orden)?a.league.orden:0;
        const bo=Number.isFinite(b.league.orden)?b.league.orden:0;
        return bo-ao||a.index-b.index;
      }).map(x=>x.league);
  }
  function apply(leagues,ids){
    const ranks=new Map((Array.isArray(ids)?ids:[]).map((id,i)=>[id,i]));
    return (Array.isArray(leagues)?leagues:[]).map(league=>{
      const copy={...league};delete copy.ordenLogin;
      if(copy.estado==='finalizada'&&ranks.has(copy.id))copy.ordenLogin=ranks.get(copy.id);
      return copy;
    });
  }
  function move(ids,id,position){
    const next=ids.slice(),from=next.indexOf(id);
    if(from<0||!Number.isSafeInteger(position)||position<0||position>=next.length)return next;
    next.splice(from,1);next.splice(position,0,id);return next;
  }
  return Object.freeze({closed,apply,move});
});
