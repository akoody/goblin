import test from 'node:test';
import assert from 'node:assert/strict';

test('idle polling skips duplicate cycles and a limited history never advances a deposit cursor',async()=>{
 process.env.TRONGRID_API_KEY='qa-only';
 const {db}=await import('../src/config/db.js');
 const {runBlockchainCycle}=await import('../src/services/blockchain-processing.service.js');
 const {tronPollSchedule}=await import('../src/services/tron-poll-schedule.js');
 const previous={fetch:global.fetch,query:db.query,execute:db.execute};
 let requests=0,saves=0,limited=false,malicious=true;
 const wallet={id:901,currency:'USDT',address:'qa-only',scan_cursor:123};
 db.query=async sql=>sql.includes('FROM wallets w')?[[wallet]]:[[]];
 db.execute=async sql=>{assert(sql.includes('INSERT INTO blockchain_scan_state'));saves++;return [{affectedRows:1}];};
 global.fetch=async()=>{requests++;return new Response(JSON.stringify(limited?{error:'limited'}:{data:[],...(malicious?{meta:{links:{next:'https://attacker.invalid/leak'}}}:{})}),{status:limited?429:200});};
 try{
  await runBlockchainCycle();assert.equal(requests,1);assert.equal(saves,0);
  tronPollSchedule.prune([]);malicious=false;
  await runBlockchainCycle();assert.equal(requests,2);assert.equal(saves,1);
  await runBlockchainCycle();assert.equal(requests,2);assert.equal(saves,1);
  tronPollSchedule.prune([]);limited=true;
  await runBlockchainCycle();assert.equal(requests,3);assert.equal(saves,1);
  await runBlockchainCycle();assert.equal(requests,3);assert.equal(saves,1);
 }finally{global.fetch=previous.fetch;db.query=previous.query;db.execute=previous.execute;await db.end();}
});
