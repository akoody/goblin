import test from 'node:test';
import assert from 'node:assert/strict';
import {db} from '../src/config/db.js';
import {collectionUnits,collectionNative,reconcileOwnedFunds,collectionSettlement} from '../src/services/collection-math.js';
import {settleCollection,queueCollection,cancelCollectionJob} from '../src/services/collection-engine.service.js';
import {recordPendingDeposit} from '../src/services/deposit-compliance.service.js';
test('Collection never treats an unexplained chain surplus or deficit as owned fees',()=>{
 assert.equal(reconcileOwnedFunds({chain:12000000n,liability:10000000n,earned:2000000n}),2000000n);
 assert.throws(()=>reconcileOwnedFunds({chain:13000000n,liability:10000000n,earned:2000000n}));
 assert.throws(()=>reconcileOwnedFunds({chain:11000000n,liability:10000000n,earned:2000000n}));
 assert.throws(()=>reconcileOwnedFunds({chain:1n,liability:2n,earned:-1n}));
 assert.equal(collectionUnits('0.000000001','SOLANA'),1n);assert.equal(collectionNative(1n,'TRON'),'0.000001');
 assert.throws(()=>collectionUnits('0.0000001','TRON'));
});
test('Network cost is explicit; custody movement never pays itself as another fee',()=>{
 const sol={network:'SOLANA',amount:'1',fee_budget:'0.0001'};
 assert.deepEqual(collectionSettlement(sol,true,'0.000005'),{received:'0.999995000',fee:'0.000005000'});
 assert.deepEqual(collectionSettlement(sol,false,'0.000005'),{received:'0.000000000',fee:'0.000005000'});
 assert.deepEqual(collectionSettlement({network:'TRON',amount:'25',fee_budget:'10'},true,'2'),{received:'25.000000',fee:'2.000000'});
 assert.throws(()=>collectionSettlement(sol,true,'0.001'));
});
test('Finalized collection expenses SOL once, releases the guard, and never debits customer balance',async()=>{
 const original=db.getConnection;let status='submitted',expenses=0,releases=0;
 db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute:async(sql,args)=>{
  if(sql.startsWith('SELECT status'))return [[{status}]];
  if(sql.startsWith('UPDATE admin_treasury')){expenses++;assert.equal(args[0],'0.000005000');return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE wallets SET collection_lock_id=NULL')){releases++;assert(!sql.includes('balance='));return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE treasury_collection_jobs')){status=args[0];assert.equal(args[1],'0.999995000');return [{affectedRows:1}];}
  throw new Error(sql);
 }});
 try{const job={id:'job',network:'SOLANA',amount:'1',fee_budget:'0.0001'};await settleCollection(job,true,'0.000005');await settleCollection(job,true,'0.000005');assert.equal(expenses,1);assert.equal(releases,1);}finally{db.getConnection=original;}
});
test('Treasury gas grants are excluded before creating customer deposit or AML records',async()=>{
 const original=db.getConnection;let queries=0;
 db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute:async(sql,args)=>{
  queries++;if(sql.includes('tron_swap_transactions'))return [[]];
  if(sql.includes('treasury_collection_gas_grants')){assert.deepEqual(args,['gas-hash','source']);return [[{id:'grant'}]];}
  throw new Error('Gas grant must not insert a customer deposit');
 }});
 try{assert.equal(await recordPendingDeposit({wallet:{id:1},currency:'TRX',network:'TRON',txHash:'gas-hash',from:'vault',to:'source',amount:'5',timestamp:Date.now()}),false);assert.equal(queries,2);}finally{db.getConnection=original;await db.end();}
});

test('Queueing reserves treasury availability without locking a waiting customer wallet',async()=>{
 const originalConnection=db.getConnection,originalExecute=db.execute;
 const rpc=process.env.SOLANA_RPC_URL,paused=process.env.TREASURY_COLLECTION_PAUSED;
 process.env.SOLANA_RPC_URL='https://unused.invalid';delete process.env.TREASURY_COLLECTION_PAUSED;
 const policy={mode:'manual',maximum_network_fee:'0.0001',minimum_source_amount:'0.05',threshold_amount:'1'};
 const entries=[{ready:true,userId:7,walletId:9,address:'source',amount:'1',feeBudget:'0.000005'}];
 let inserted=0,committed=0;
 db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{committed++;},rollback:async()=>{},release(){},
  query:async sql=>{
   if(sql.startsWith('SELECT id,collection_lock_id'))return [[{id:9,locked_balance:'0',collection_lock_id:null}]];
   if(sql.startsWith('SELECT currency FROM admin_treasury'))return [[]];
   throw new Error(sql);
  },execute:async(sql,args)=>{
   if(sql.startsWith('SELECT *,expires_at'))return [[{id:'plan',network:'SOLANA',actor_id:1,fresh:1,status:'preview',policy_json:policy,entries_json:entries}]];
   if(sql.startsWith('SELECT * FROM treasury_collection_policy'))return [[policy]];
   if(sql.startsWith('SELECT address'))return [[{address:'vault'}]];
   if(sql.startsWith('SELECT id FROM treasury_collection_jobs'))return [[]];
   if(sql.startsWith('SELECT balance'))return [[{balance:'5'}]];
   if(sql.includes('AS amount FROM treasury_collection_jobs'))return [[{amount:'0'}]];
   if(sql.startsWith('INSERT INTO treasury_collection_jobs')){inserted++;assert(sql.includes("'queued'"));assert.equal(args[7],'1');return [{affectedRows:1}];}
   if(sql.startsWith('UPDATE treasury_collection_plans')||sql.startsWith('INSERT INTO treasury_collection_audit'))return [{affectedRows:1}];
   throw new Error('Unexpected write or query: '+sql);
  }});
 db.execute=async()=>[[{id:'plan',network:'SOLANA',status:'queued',entries_json:entries,expires_at:new Date()}]];
 try{const plan=await queueCollection('plan',1);assert.equal(plan.status,'queued');assert.equal(inserted,1);assert.equal(committed,1);}
 finally{db.getConnection=originalConnection;db.execute=originalExecute;if(rpc===undefined)delete process.env.SOLANA_RPC_URL;else process.env.SOLANA_RPC_URL=rpc;if(paused===undefined)delete process.env.TREASURY_COLLECTION_PAUSED;else process.env.TREASURY_COLLECTION_PAUSED=paused;}
});

test('Cancellation cannot unlock a source with a signed transfer',async()=>{
 const originalConnection=db.getConnection,originalExecute=db.execute;let released=0;
 db.getConnection=async()=>({release(){},query:async sql=>{if(sql.includes('GET_LOCK'))return [[{ok:1}]];if(sql.includes('RELEASE_LOCK')){released++;return [[{ok:1}]];}throw new Error(sql);}});
 db.execute=async sql=>{if(sql.startsWith('SELECT *'))return [[{id:'signed-job',tx_hash:'signed-hash'}]];if(sql.startsWith('SELECT id'))return [[]];throw new Error('Cancellation must not write: '+sql);};
 try{await assert.rejects(cancelCollectionJob('signed-job',1),/Подписанная/);assert.equal(released,1);}finally{db.getConnection=originalConnection;db.execute=originalExecute;}
});
