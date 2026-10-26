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
  // Policy applies only to a pure league W.O.; a retirement with play keeps
  // its usual 3/1 points. Missing policy is historical: preserve the old 1 + PJ.
  function isWalkover(m){return !!m&&m.wo===true&&!m.np&&Array.isArray(m.sets)&&m.sets.length===0;}
  function walkoverPolicy(m){
    if(!isWalkover(m)||m.po||!m.woPolicy)return {loserPoints:true,loserPlayed:true};
    return {loserPoints:m.woPolicy.loserPoints===true,loserPlayed:m.woPolicy.loserPlayed===true};
  }
function standings(cycN,gid,cycles,matches){
  const c=cycles[cycN-1];if(!c||!c.groups||!c.groups[gid-1])return[];
  const g=c.groups[gid-1];const players=(g.players||[]).filter(Boolean);
  const st=players.map((name)=>({name,pts:0,g:0,p:0,nj:0,sg:0,sp:0,gw:0,gl:0}));
  const byName={};st.forEach(s=>byName[s.name]=s);
  const confirmed=matches.filter(m=>!m.po&&m.cycle===cycN&&m.g===gid&&m.status==='confirmed');
  confirmed.forEach(m=>{
    const a=byName[m.aName],b=byName[m.bName];if(!a||!b)return;
    if(m.np){a.nj++;b.nj++;return;}
    // Retiro (RET/walkover): el GANADOR del partido siempre viene explícito
    // en m.winner (no se deduce de los sets — alguien puede ir arriba en
    // sets y retirarse igual, perdiendo el partido a pesar de eso). Los
    // sets que sí se hayan jugado (m.sets puede traer 0, 1 o 2 sets reales)
    // SÍ se suman a sg/sp/gw/gl como cualquier otro partido — importan para
    // el desempate por balance de sets/games y para el rating. Antes esto
    // ignoraba los sets por completo en un retiro, aunque hubiera sets
    // reales jugados antes de retirarse.
    if(m.wo){
      if(Array.isArray(m.sets)&&m.sets.length&&m.sets.every(s=>Array.isArray(s)&&s.length>=2&&isFinite(s[0])&&isFinite(s[1]))){
        let w1=0,w2=0,a_gw=0,a_gl=0;
        m.sets.forEach(([x,y])=>{if(validSet(x,y)){if(x>y)w1++;else w2++;}a_gw+=x;a_gl+=y;});
        a.sg+=w1;a.sp+=w2;b.sg+=w2;b.sp+=w1;
        a.gw+=a_gw;a.gl+=a_gl;b.gw+=a_gl;b.gl+=a_gw;
      }
      const credit=walkoverPolicy(m);
      if(m.winner===m.aName){a.g++;a.pts+=3;if(credit.loserPlayed)b.p++;if(credit.loserPoints)b.pts+=1;}
      else if(m.winner===m.bName){b.g++;b.pts+=3;if(credit.loserPlayed)a.p++;if(credit.loserPoints)a.pts+=1;}
      return;
    }
    // Defensa contra sets malformados (import de Excel corrupto, edición manual del
    // backup, etc.): si sets no es un array de pares numéricos, el partido se
    // ignora en el cálculo en vez de romper toda la tabla del grupo.
    if(!Array.isArray(m.sets)||!m.sets.every(s=>Array.isArray(s)&&s.length>=2&&isFinite(s[0])&&isFinite(s[1])))return;
    let w1=0,w2=0,a_gw=0,a_gl=0;
    m.sets.forEach(([x,y])=>{if(x>y)w1++;else w2++;a_gw+=x;a_gl+=y;});
    a.sg+=w1;a.sp+=w2;b.sg+=w2;b.sp+=w1;
    a.gw+=a_gw;a.gl+=a_gl;b.gw+=a_gl;b.gl+=a_gw;
    if(w1>w2){a.g++;b.p++;a.pts+=3;b.pts+=1;}
    else{b.g++;a.p++;b.pts+=3;a.pts+=1;}
  });
  function h2hStats(group){
    const names=new Set(group.map(s=>s.name));
    const h={};group.forEach(s=>h[s.name]={pts:0,sg:0,sp:0,gw:0,gl:0});
    confirmed.forEach(m=>{
      if(!names.has(m.aName)||!names.has(m.bName))return;
      if(m.np)return;
      // Mismo caso especial de retiro (RET) que en el cálculo principal de
      // arriba — el ganador viene de m.winner, pero los sets reales
      // jugados (si los hay) también se suman a sg/sp/gw/gl.
      if(m.wo){
        if(Array.isArray(m.sets)&&m.sets.length&&m.sets.every(st2=>Array.isArray(st2)&&st2.length>=2&&isFinite(st2[0])&&isFinite(st2[1]))){
          let w1=0,w2=0,a_gw=0,a_gl=0;
          m.sets.forEach(([x,y])=>{if(validSet(x,y)){if(x>y)w1++;else w2++;}a_gw+=x;a_gl+=y;});
          h[m.aName].sg+=w1;h[m.aName].sp+=w2;h[m.bName].sg+=w2;h[m.bName].sp+=w1;
          h[m.aName].gw+=a_gw;h[m.aName].gl+=a_gl;h[m.bName].gw+=a_gl;h[m.bName].gl+=a_gw;
        }
        const credit=walkoverPolicy(m);
        if(m.winner===m.aName){h[m.aName].pts+=3;if(credit.loserPoints)h[m.bName].pts+=1;}
        else if(m.winner===m.bName){h[m.bName].pts+=3;if(credit.loserPoints)h[m.aName].pts+=1;}
        return;
      }
      if(!Array.isArray(m.sets)||!m.sets.every(st2=>Array.isArray(st2)&&st2.length>=2&&isFinite(st2[0])&&isFinite(st2[1])))return;
      let w1=0,w2=0,a_gw=0,a_gl=0;
      m.sets.forEach(([x,y])=>{if(x>y)w1++;else w2++;a_gw+=x;a_gl+=y;});
      h[m.aName].sg+=w1;h[m.aName].sp+=w2;h[m.bName].sg+=w2;h[m.bName].sp+=w1;
      h[m.aName].gw+=a_gw;h[m.aName].gl+=a_gl;h[m.bName].gw+=a_gl;h[m.bName].gl+=a_gw;
      if(w1>w2){h[m.aName].pts+=3;h[m.bName].pts+=1;}
      else{h[m.bName].pts+=3;h[m.aName].pts+=1;}
    });
    return h;
  }
  function tiebreakSort(group){
    if(group.length<=1)return group;
    group.sort((x,y)=>{
      if(y.pts!==x.pts)return y.pts-x.pts;
      const mpX=x.g+x.p, mpY=y.g+y.p;
      if(mpY!==mpX)return mpY-mpX;
      return 0;
    });
    const result=[];let i=0;
    while(i<group.length){
      let j=i+1;
      while(j<group.length&&group[j].pts===(group[i].pts)&&(group[j].g+group[j].p)===(group[i].g+group[i].p)){j++;}
      const tied=group.slice(i,j);
      if(tied.length===1){result.push(tied[0]);i=j;continue;}
      result.push(...breakTies(tied));
      i=j;
    }
    return result;
  }
  function breakTies(tied){
    if(tied.length===1)return tied;
    const h=h2hStats(tied);
    tied.sort((x,y)=>{
      const hDiff=(h[y.name].pts)-(h[x.name].pts);if(hDiff!==0)return hDiff;
      const sbDiff=(y.sg-y.sp)-(x.sg-x.sp);if(sbDiff!==0)return sbDiff;
      const hsbDiff=(h[y.name].sg-h[y.name].sp)-(h[x.name].sg-h[x.name].sp);if(hsbDiff!==0)return hsbDiff;
      return (y.gw-y.gl)-(x.gw-x.gl);
    });
    const result=[];let i=0;
    while(i<tied.length){
      let j=i+1;
      while(j<tied.length){
        const x=tied[i],y=tied[j];
        const sameH2H=h[x.name].pts===h[y.name].pts;
        const sameSB=(x.sg-x.sp)===(y.sg-y.sp);
        const sameHSB=(h[x.name].sg-h[x.name].sp)===(h[y.name].sg-h[y.name].sp);
        const sameGB=(x.gw-x.gl)===(y.gw-y.gl);
        if(sameH2H&&sameSB&&sameHSB&&sameGB)j++;else break;
      }
      const sub=tied.slice(i,j);
      if(sub.length===tied.length||sub.length===1){result.push(...sub);i=j;}
      else{
        const h2=h2hStats(sub);
        sub.sort((x,y)=>{
          const hDiff=h2[y.name].pts-h2[x.name].pts;if(hDiff!==0)return hDiff;
          const sbDiff=(h2[y.name].sg-h2[y.name].sp)-(h2[x.name].sg-h2[x.name].sp);if(sbDiff!==0)return sbDiff;
          return(y.gw-y.gl)-(x.gw-x.gl);
        });
        result.push(...sub);i=j;
      }
    }
    return result;
  }
  return tiebreakSort(st);
}
  return Object.freeze({validSet,validSTB,validMatch,validRetirement,winnerIndex,isWalkover,walkoverPolicy,standings});
});
