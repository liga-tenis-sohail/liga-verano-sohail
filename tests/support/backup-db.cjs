'use strict';
const M=require('./mock-db.cjs');
function create(){
 const db=M.createDB(),objects=new Map(),calls=[];const fetchDB=db.fetch;
 db.backupObjects=objects;db.storageCalls=calls;db.bucketPublic=false;
 db.fetch=async(input,options={})=>{
  const u=new URL(input),p=u.pathname,method=options.method||'GET';
  if(!p.startsWith('/storage/v1/'))return fetchDB(input,options);
  calls.push({path:p,method});
  if(db.storageFail?.(p,method))return new Response('{}',{status:503});
  if(p==='/storage/v1/bucket/backups')return Response.json({id:'backups',public:db.bucketPublic});
  if(p.startsWith('/storage/v1/object/backups/')){
   if(method==='POST'){objects.set(p,Buffer.from(options.body));return Response.json({ok:true});}
   if(method==='GET'&&objects.has(p)){
    const bytes=Buffer.from(objects.get(p));if(db.tamperDownload)bytes[bytes.length-1]^=1;
    return new Response(bytes,{headers:{'content-length':String(bytes.length)}});
   }
  }
  throw Error('Unsimulated storage request');
 };
 return db;
}
module.exports={create};
