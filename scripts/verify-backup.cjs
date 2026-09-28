#!/usr/bin/env node
'use strict';
// LOCAL ONLY. Never writes to a database. The default verifies and prints counts,
// not names, contacts or credential hashes. Keep the input/key out of GitHub.
const fs=require('node:fs'),path=require('node:path');
const B=require('../api/_backup-security');
async function main(){
 const args=process.argv.slice(2),file=args[0],out=args[1]==='--decrypt-to'?args[2]:null;
 if(!file||args.length>1&&(!out||args.length!==3))throw Error('Usage: node scripts/verify-backup.cjs backup.sohail.enc [--decrypt-to /private/new-file.json]');
 const stat=fs.statSync(file);if(!stat.isFile()||stat.size>B.MAX_FILE)throw Error('Invalid or oversized encrypted file');
 const {header,snapshot}=await B.open(fs.readFileSync(file),process.env.BACKUP_ENCRYPTION_KEY);
 if(out){
  const dest=path.resolve(out),root=path.resolve(__dirname,'..');
  if(dest===root||dest.startsWith(root+path.sep))throw Error('Decrypted data must be outside the repository');
  fs.writeFileSync(dest,JSON.stringify(snapshot),{flag:'wx',mode:0o600});
  console.log('Decrypted private file created outside the repository. Do not upload it to GitHub.');
 }
 console.log(JSON.stringify({verified:true,keyId:header.keyId,createdAt:header.createdAt,consistency:snapshot.consistency,counts:snapshot.counts},null,2));
}
if(require.main===module)main().catch(()=>{console.error('Backup verification failed. Check the input and encryption key; no database was modified.');process.exitCode=1;});
module.exports={main};
