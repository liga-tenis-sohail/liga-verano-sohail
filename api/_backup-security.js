'use strict';
// Authenticated encryption for private exports. Raw credentials never leave
// the server unencrypted. The key must be backed up independently of Supabase.
const crypto=require('node:crypto'),zlib=require('node:zlib');
const {promisify}=require('node:util');
const gzip=promisify(zlib.gzip),gunzip=promisify(zlib.gunzip);
const MAGIC=Buffer.from('SOHAIL-BACKUP-3\n'),MAX_PLAIN=32*1024*1024,MAX_FILE=36*1024*1024;
const TABLES=Object.freeze(['liga_state','liga_index','jugadores','passkeys','audit_log','mensajes','admin_notify_channels','sohail_account_security','sohail_identity_registry','sohail_data_operations','sohail_login_order']);
function key(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/i.test(value)||new Set(value).size<4)throw Object.assign(new Error('Configure a random 32-byte BACKUP_ENCRYPTION_KEY (64 hex characters).'),{status:503,code:'BACKUP_KEY_REQUIRED'});return Buffer.from(value,'hex');}
function validateSnapshot(s){
 if(!s||s.version!==3||s.consistency!=='single-statement-snapshot'||!s.tables||!s.counts||!Number.isFinite(Date.parse(s.generated_at)))throw new Error('Invalid snapshot format');
 if(Object.keys(s.tables).sort().join(',')!==[...TABLES].sort().join(','))throw new Error('Unexpected backup tables');
 for(const t of TABLES)if(!Array.isArray(s.tables[t])||s.tables[t].length>250000||s.counts[t]!==s.tables[t].length||s.tables[t].some(x=>!x||typeof x!=='object'||Array.isArray(x)))throw new Error('Invalid backup table');
 return s;
}
async function seal(snapshot,secret,keyId='primary'){
 validateSnapshot(snapshot);
 if(typeof keyId!=='string'||!/^[a-zA-Z0-9_-]{1,40}$/.test(keyId))throw new Error('Invalid backup key ID');
 const plain=Buffer.from(JSON.stringify(snapshot),'utf8');if(plain.length>MAX_PLAIN)throw new Error('Snapshot exceeds 32 MiB');
 const compressed=await gzip(plain,{level:6});
 const iv=crypto.randomBytes(12),header=Buffer.from(JSON.stringify({v:3,algorithm:'AES-256-GCM',compression:'gzip',keyId,iv:iv.toString('hex'),createdAt:snapshot.generated_at}));
 const size=Buffer.alloc(4);size.writeUInt32BE(header.length);const aad=Buffer.concat([MAGIC,size,header]);
 const cipher=crypto.createCipheriv('aes-256-gcm',key(secret),iv,{authTagLength:16});cipher.setAAD(aad);
 const encrypted=Buffer.concat([cipher.update(compressed),cipher.final()]);
 return Buffer.concat([aad,cipher.getAuthTag(),encrypted]);
}
async function open(bytes,secret){
 if(!Buffer.isBuffer(bytes))bytes=Buffer.from(bytes);
 if(bytes.length>MAX_FILE||bytes.length<MAGIC.length+4+16||!bytes.subarray(0,MAGIC.length).equals(MAGIC))throw new Error('Not a supported encrypted Sohail backup');
 const n=bytes.readUInt32BE(MAGIC.length),start=MAGIC.length+4,end=start+n;
 if(n<20||n>2048||bytes.length<=end+16)throw new Error('Invalid backup envelope');
 const h=JSON.parse(bytes.toString('utf8',start,end));
 if(h.v!==3||h.algorithm!=='AES-256-GCM'||h.compression!=='gzip'||!/^[a-f0-9]{24}$/.test(h.iv))throw new Error('Unsupported backup encryption');
 const cipher=crypto.createDecipheriv('aes-256-gcm',key(secret),Buffer.from(h.iv,'hex'),{authTagLength:16});
 cipher.setAAD(bytes.subarray(0,end));cipher.setAuthTag(bytes.subarray(end,end+16));
 const compressed=Buffer.concat([cipher.update(bytes.subarray(end+16)),cipher.final()]);
 const plain=await gunzip(compressed,{maxOutputLength:MAX_PLAIN});
 return {header:h,snapshot:validateSnapshot(JSON.parse(plain.toString('utf8')))};
}
function sameSecret(got,wanted){if(typeof got!=='string'||typeof wanted!=='string'||!wanted||got.length>8192)return false;const a=Buffer.from(got),b=Buffer.from(wanted);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
module.exports={seal,open,key,validateSnapshot,sameSecret,digest,TABLES,MAX_PLAIN,MAX_FILE};
