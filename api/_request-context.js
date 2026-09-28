'use strict';
// ONE HTTP request only. Never cache authorization, passwords or epochs across requests.
const {AsyncLocalStorage}=require('node:async_hooks');
const {performance}=require('node:perf_hooks');
const local=new AsyncLocalStorage();
function run(work){return local.run({values:new Map(),started:performance.now(),reads:0,reused:0,dbMs:0},work);}
async function measure(work){const c=local.getStore(),s=performance.now();if(c)c.reads++;try{return await work();}finally{if(c)c.dbMs+=performance.now()-s;}}
async function read(key,work,{fresh=false}={}){const c=local.getStore();if(!c)return work();if(fresh)c.values.delete(key);if(!c.values.has(key)){const p=measure(work);c.values.set(key,p);p.catch(()=>{if(c.values.get(key)===p)c.values.delete(key);});}else c.reused++;return structuredClone(await c.values.get(key));}
function seed(key,value){local.getStore()?.values.set(key,Promise.resolve(structuredClone(value)));}
function clear(){local.getStore()?.values.clear();}
function headers(res){const c=local.getStore();if(c&&!res.headersSent)res.setHeader('Server-Timing',`app;dur=${(performance.now()-c.started).toFixed(1)}, db;dur=${c.dbMs.toFixed(1)}, db_calls;desc="${c.reads}", reused;desc="${c.reused}"`);}
module.exports={run,read,seed,clear,measure,headers};
