(function(){try{
  var lsn=JSON.parse(localStorage.getItem('lsn')||'null');
  if(lsn)document.addEventListener('DOMContentLoaded',function(){
    var title=document.getElementById('login-title'),sub=document.getElementById('login-sub');
    if(title)title.textContent=(lsn.lt&&lsn.lt.trim())?lsn.lt:(lsn.n||'');
    if(sub&&lsn.s)sub.textContent=lsn.s;
    if(lsn.n)document.title=lsn.n;
  },false);
}catch(_){}})();
