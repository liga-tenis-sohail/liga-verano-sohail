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
    // El proyecto registra únicamente sets completos previos al abandono.
    if(!Array.isArray(sets)||sets.length>2||!sets.every(s=>pair(s)&&validSet(...s)))return false;
    return sets.length!==2||(sets[0][0]>sets[0][1])!==(sets[1][0]>sets[1][1]);
  }
  function winnerIndex(sets){return sets.reduce((n,s)=>n+(s[0]>s[1]?1:-1),0)>0?0:1;}
  return Object.freeze({validSet,validSTB,validMatch,validRetirement,winnerIndex});
});
