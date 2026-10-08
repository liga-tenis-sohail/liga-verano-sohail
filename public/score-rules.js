/* Liga Sohail — reglas de marcador compartidas entre navegador y servidor.
   No cambia el reglamento: supertiebreak registrado como 1–0 o 0–1. */
(function(root, factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.SohailScore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const pair=s=>Array.isArray(s)&&s.length===2&&s.every(Number.isSafeInteger);
  function validSet(a,b){
    if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<0||b<0)return false;
    const hi=Math.max(a,b),lo=Math.min(a,b);
    return (hi===6&&lo<=4)||(hi===7&&(lo===5||lo===6));
  }
  function validSTB(a,b){return (a===1&&b===0)||(a===0&&b===1);}
  function validMatch(sets){
    if(!Array.isArray(sets)||sets.length<2)return {ok:false,key:'valid_need2sets'};
    if(sets.length>3||!sets.every(pair))return {ok:false,key:'valid_set_count'};
    if(!validSet(...sets[0]))return {ok:false,key:'valid_set1'};
    if(!validSet(...sets[1]))return {ok:false,key:'valid_set2'};
    const split=(sets[0][0]>sets[0][1])!==(sets[1][0]>sets[1][1]);
    if(split&&sets.length!==3)return {ok:false,key:'valid_need_stb'};
    if(!split&&sets.length!==2)return {ok:false,key:'valid_no_stb'};
    if(split&&!validSTB(...sets[2]))return {ok:false,key:'valid_stb_only'};
    return {ok:true};
  }
  function validRetirement(sets){
    // RET: keep the games actually played. Only the final recorded set may
    // be unfinished; earlier sets must be complete. No play after match end.
    // An empty array retains the existing W.O. (no games recorded) format.
    if(!Array.isArray(sets)||sets.length>2||!sets.every(pair))return false;
    const won=[0,0];
    for(let i=0;i<sets.length;i++){
      if(!pair(sets[i]))return false;
      const [a,b]=sets[i];
      if(a<0||b<0)return false;
      if(validSet(a,b))won[a>b?0:1]++;
      else{
        const hi=Math.max(a,b),lo=Math.min(a,b);
        const inProgress=hi<=5||(hi===6&&(lo===5||lo===6));
        if(!inProgress||i!==sets.length-1)return false;
      }
    }
    return won[0]<2&&won[1]<2;
  }
  function winnerIndex(sets){return sets.reduce((n,s)=>n+(s[0]>s[1]?1:-1),0)>0?0:1;}
  return Object.freeze({validSet,validSTB,validMatch,validRetirement,winnerIndex});
});
