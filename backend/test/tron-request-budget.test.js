import test from 'node:test';
import assert from 'node:assert/strict';
import {createTronRequestBudget,budgetTronProviders,tronRequestBudget} from '../src/services/tron-request-budget.js';
import {createTronPollSchedule} from '../src/services/tron-poll-schedule.js';

test('TRON requests are serial, spaced and metadata duplicates share one request',async()=>{
 let time=0,calls=0,active=0;
 const starts=[],gate=createTronRequestBudget({now:()=>time,sleep:async ms=>{time+=ms;},random:()=>0,spacing:350});
 const work=async()=>{assert.equal(++active,1);calls++;starts.push(time);active--;return {abi:{value:1}};};
 const [first,second]=await Promise.all([gate.run(work,{key:'abi',ttl:1000}),gate.run(work,{key:'abi',ttl:1000})]);
 first.abi.value=9;assert.equal(second.abi.value,1);assert.equal(calls,1);
 assert.equal((await gate.run(work,{key:'abi',ttl:1000})).abi.value,1);
 await Promise.all([gate.run(work),gate.run(work)]);assert.deepEqual(starts,[0,350,700]);
 time=1100;await gate.run(work,{key:'abi',ttl:1000});assert.equal(calls,4);
});

test('429 stops queued requests, backs off progressively, never retries a broadcast itself',async()=>{
 let time=0,calls=0;
 const gate=createTronRequestBudget({now:()=>time,sleep:async ms=>{time+=ms;},random:()=>0,spacing:0});
 const limited=async()=>{calls++;throw {response:{status:429}};};
 const results=await Promise.allSettled([gate.run(limited),gate.run(limited),gate.run(limited)]);
 assert(results.every(result=>result.reason.code==='TRON_RATE_LIMITED'));assert.equal(calls,1);
 assert.equal(gate.stats().blockedUntil,30000);
 await assert.rejects(()=>gate.run(limited),{code:'TRON_RATE_LIMITED'});assert.equal(calls,1);
 time=30001;await assert.rejects(()=>gate.run(limited),{code:'TRON_RATE_LIMITED'});assert.equal(gate.stats().blockedUntil,90001);
 time=90002;await gate.run(async()=>({ok:true}));
 await assert.rejects(()=>gate.run(async()=>({Error:'Exceed the user daily usage (100000)'})),{code:'TRON_RATE_LIMITED'});
 assert.equal(gate.stats().blockedUntil,120002);
});

test('provider errors are not cached or treated as an empty successful history',async()=>{
 const gate=createTronRequestBudget({sleep:async()=>{},spacing:0});let calls=0;
 for(let i=0;i<2;i++)await assert.rejects(()=>gate.run(async()=>{calls++;return {success:false,error:'Invalid credentials'};},{key:'history',ttl:1000}),{code:'TRON_PROVIDER_ERROR'});
 assert.equal(calls,2);
});

test('Retry-After is respected instead of probing during the provider pause',async()=>{
 const gate=createTronRequestBudget({now:()=>1000,sleep:async()=>{},random:()=>0});
 await assert.rejects(()=>gate.run(async()=>{throw {status:429,retryAfter:'600'};}),{code:'TRON_RATE_LIMITED'});
 assert.equal(gate.stats().blockedUntil,601000);
});

test('exhausted daily quota uses the provider slow lane rather than burst retries',async()=>{
 let time=0;const gate=createTronRequestBudget({now:()=>time,sleep:async ms=>{time+=ms;},random:()=>0,spacing:350});
 await assert.rejects(()=>gate.run(async()=>{throw {status:429,message:'Exceed the user daily usage, the maximum query frequency is 1 time per second'};}));
 time=30001;const starts=[];
 await gate.run(async()=>{starts.push(time);});await gate.run(async()=>{starts.push(time);});
 assert.deepEqual(starts,[30001,31301]);
});

test('TronWeb wrapper caches ABI only, never balances, gas, receipts or broadcasts',async()=>{
 const urls=[],provider={host:'qa-only',request:async url=>{urls.push(url);return {ok:true};}};
 const web={fullNode:provider,solidityNode:provider,eventServer:provider};
 budgetTronProviders(web,'qa');
 for(const url of ['wallet/getcontract','wallet/getaccount','wallet/getchainparameters','walletsolidity/gettransactioninfobyid','wallet/broadcasttransaction']){
  await provider.request(url,{address:'qa'});await provider.request(url,{address:'qa'});
 }
 assert.equal(urls.filter(url=>url==='wallet/getcontract').length,1);
 for(const url of urls.filter(url=>url!=='wallet/getcontract'))assert.equal(urls.filter(value=>value===url).length,2);
 assert.equal(tronRequestBudget.stats().queued,0);
});

test('idle wallets poll every five minutes, viewed wallets every minute without repeated acceleration',()=>{
 let time=1000;const schedule=createTronPollSchedule({now:()=>time});
 assert(schedule.due(1));schedule.complete(1);time+=60000;assert(!schedule.due(1));
 schedule.watch(1);assert(schedule.due(1));schedule.complete(1);
 schedule.watch(1);assert(!schedule.due(1));time+=60000;assert(schedule.due(1));
 schedule.complete(1);time+=900001;assert(schedule.due(1));schedule.complete(1);
 time+=60000;assert(!schedule.due(1));time+=240000;assert(schedule.due(1));
 schedule.defer(1,time+300000);assert(!schedule.due(1));time+=300000;assert(schedule.due(1));
});

test('active polling is bounded and deleting wallet schedules does not starve the rest',()=>{
 let time=1000;const schedule=createTronPollSchedule({now:()=>time,maxActive:2});
 for(const id of [1,2,3]){schedule.watch(id);time++;}
 for(const id of [1,2,3])schedule.complete(id);
 time+=60000;assert(!schedule.due(1));assert(schedule.due(2));assert(schedule.due(3));
 schedule.prune([1]);assert(schedule.due(2));
});

test('reopening an evicted active wallet cannot force another network scan within a minute',()=>{
 let time=1000;const schedule=createTronPollSchedule({now:()=>time,maxActive:1});
 schedule.watch(1);schedule.complete(1);time++;
 schedule.watch(2);schedule.watch(1);assert(!schedule.due(1));
 time=61000;assert(schedule.due(1));
});
