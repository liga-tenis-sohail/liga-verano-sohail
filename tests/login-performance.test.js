'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createDB,fixture,call,lib}=require('./support/mock-db.cjs');
const R=require('../api/_login-read');
const login=require('../api/login');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const leagues=n=>Array.from({length:n},(_,i)=>({id:'liga-'+i,estado:'activa',nombre:'Liga '+i}));
async function withDB(fn,states){const prev=global.fetch,db=createDB(states);global.fetch=db.fetch;try{await fn(db);}finally{global.fetch=prev;}}
const signIn=(name='Alicia',pass='prueba123')=>call(login,{method:'POST',body:{user:name,pass},query:{},headers:{'x-forwarded-for':'192.0.2.1'}});
function freshUsers(){delete require.cache[require.resolve('../api/users')];return require('../api/users');}
test('LOGIN410 parallel reads are bounded to four and preserve index order',async()=>{
 let active=0,peak=0;
 const rows=await R.readLeagueStates(leagues(11),async id=>{active++;peak=Math.max(peak,active);await sleep(2+(11-Number(id.slice(5)))%4);active--;return {users:{},id};});
 assert.equal(peak,4);assert.deepEqual(rows.map(r=>r.state.id),leagues(11).map(l=>l.id));assert.equal(active,0);
});
test('LOGIN410 an empty league list starts no reads',async()=>{let calls=0;assert.deepEqual(await R.readLeagueStates([],async()=>calls++),[]);assert.equal(calls,0);});
test('LOGIN410 incomplete reads never become a partial successful login',async()=>{
 for(const value of [null,{users:null},{users:[]},{}])await assert.rejects(R.readLeagueStates(leagues(1),async()=>value),e=>e.code==='LOGIN_LEAGUES_UNAVAILABLE'&&e.status===503);
});
test('LOGIN410 membership failure stops new reads and waits for the in-flight workers',async()=>{
 let count=0,active=0;
 await assert.rejects(R.readLeagueStates(leagues(40),async()=>{count++;active++;if(count===1){active--;throw Error('offline');}await sleep(10);active--;return {users:{}};}));
 assert.ok(count<=4);assert.equal(active,0);
});
test('LOGIN410 regular versioned login does not download the complete player catalogue',()=>withDB(async db=>{
 const r=await signIn();assert.equal(r.status,200,JSON.stringify(r.body));assert.ok(r.body.token);
 assert.equal(db.requests.some(q=>q.name==='jugadores'),false);
 assert.equal(db.requests.some(q=>q.name==='sohail_account_security'&&q.method==='GET'),true);
 assert.equal(r.body.state.users.Alicia.pass,undefined);
}));
test('LOGIN410 concurrent membership reads keep newest league choices and original source identity',()=>withDB(async db=>{
 const states=leagues(9).map(l=>({id:l.id,state:fixture()}));db.setStates(states);
 let active=0,peak=0;const original=db.fetch;
 global.fetch=async(url,opts)=>{
  const isState=new URL(url).pathname.endsWith('/liga_state');if(isState){active++;peak=Math.max(peak,active);await sleep(3);}
  try{return await original(url,opts);}finally{if(isState)active--;}
 };
 const r=await signIn();assert.equal(r.status,200);assert.equal(r.body.ligas.length,9);assert.equal(r.body.ligas[0].id,'liga-8');
 assert.equal(lib.verifyToken(r.body.token).src,'liga-0');assert.equal(peak,4);
}));
test('LOGIN410 failed reads return 503, not a new session or a password-failure penalty',()=>withDB(async db=>{
 db.fault=q=>q.name==='liga_state';const r=await signIn();assert.equal(r.status,503);assert.equal(r.body.token,undefined);
 assert.equal(db.requests.some(q=>q.name==='rate_limits'&&q.method!=='GET'),false);
}));
test('LOGIN410 wrong password still updates shared user and IP limits',()=>withDB(async db=>{
 const r=await signIn('Alicia','incorrecta');assert.equal(r.status,401);assert.equal(r.body.token,undefined);
 assert.equal(db.tables.rate_limits.length,2);
}));
test('LOGIN410 no authentication cache survives an account epoch/password change',()=>withDB(async db=>{
 assert.equal((await signIn()).status,200);
 const a=db.tables.sohail_account_security.find(a=>a.id==='g:profile-0');a.epoch++;a.pass_hash=lib.hashV2('nueva123');
 assert.equal((await signIn()).status,401);assert.equal((await signIn('Alicia','nueva123')).status,200);
}));
test('LOGIN410 inactive administrator cannot get a usable session',()=>withDB(async db=>{
 db.state().users.admin.inactive=true;const r=await signIn('admin');assert.equal(r.status,403);assert.equal(r.body.token,undefined);
}));
test('LOGIN410 administrative choices do not include a foreign account with the same name',()=>withDB(async db=>{
 const other=fixture();other.users.admin._credentialId='another-person';db.setStates([{id:'liga-actual',state:fixture()},{id:'otra',state:other}]);
 const r=await signIn('admin');assert.equal(r.status,200);assert.equal(r.body.ligaId,'liga-actual');assert.equal(r.body.eligeLiga,undefined);
}));
test('LOGIN410 metadata outage cannot silently trigger emergency administrator login',()=>withDB(async db=>{
 db.fault=q=>q.name==='liga_index';const r=await signIn('superadmin');assert.equal(r.status,503);assert.equal(r.body.token,undefined);
}));
test('LOGIN410 public directory concurrent requests share one build and expose only public names',()=>withDB(async db=>{
 const users=freshUsers();db.latency=2;
 const responses=await Promise.all(Array.from({length:6},()=>call(users,{method:'GET',headers:{},query:{}})));
 assert.ok(responses.every(r=>r.status===200));
 assert.equal(db.requests.filter(q=>q.name==='liga_index').length,1);
 assert.equal(db.requests.filter(q=>q.name==='liga_state').length,1);
 assert.deepEqual(Object.keys(responses[0].body).sort(),['mode','players']);
 assert.ok(responses[0].body.players.every(p=>Object.keys(p).join(',')==='v'));
}));
test('LOGIN410 failed public directory builds are not cached and can be retried',()=>withDB(async db=>{
 const users=freshUsers();db.fault=q=>q.name==='liga_state';assert.equal((await call(users,{method:'GET',headers:{},query:{}})).status,503);
 db.fault=null;assert.equal((await call(users,{method:'GET',headers:{},query:{}})).status,200);
}));
test('LOGIN410 public directory keeps the active exact alias instead of an inactive old spelling',()=>withDB(async db=>{
 const old=fixture(),current=fixture();old.users.Alicia.inactive=true;
 current.users['Alicia Actual']={...current.users.Alicia,name:'Alicia Actual'};delete current.users.Alicia;
 db.setStates([{id:'old',state:old},{id:'current',state:current}]);
 const r=await call(freshUsers(),{method:'GET',headers:{},query:{}});assert.equal(r.status,200);
 assert.ok(r.body.players.some(p=>p.v==='Alicia Actual'));assert.ok(!r.body.players.some(p=>p.v==='Alicia'));
}));
