import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {createTreasuryPayoutService} from '../src/services/treasury-payout.service.js';

const databaseName=process.argv[2];
if(!/^qa_treasury_[0-9]+$/.test(databaseName||''))throw Error('An isolated QA database is required');
const database=mysql.createPool({user:'root',socketPath:'/var/run/mysqld/mysqld.sock',database:databaseName});
const transaction=async work=>{const connection=await database.getConnection();try{await connection.beginTransaction();const result=await work(connection);await connection.commit();return result;}catch(error){await connection.rollback();throw error;}finally{connection.release();}};
let signs=0,attempts=0,receipt={success:true,fee:'0.01'};
const transport={payoutAddress:(_currency,address)=>address,vaultChain:async()=>({balance:'100',gas:'100',chain:{balance:'100'}}),payoutQuote:async(_currency,source,to,gross)=>({fee:'0.01',received:String(Number(gross)-0.01),source:source.address}),signPayout:async()=>{signs++;return {hash:randomUUID(),signed:'qa-signed-bytes'};},sendPayout:async row=>{const [[stored]]=await database.execute('SELECT signed_transaction FROM treasury_payouts WHERE id=?',[row.id]);assert.equal(stored.signed_transaction,'qa-signed-bytes');attempts++;},payoutReceipt:async()=>receipt};
const service=createTreasuryPayoutService({database,transport,transaction,decrypt:()=>{return 'qa-only-key';}});
try{
 for(const [currency,network] of [['USDT','TRON'],['SOL','SOLANA'],['BTC','BTC'],['ETH','ETH']]){
  await database.execute('INSERT INTO admin_treasury(currency,balance) VALUES(?,100)',[currency]);
  await database.execute('INSERT INTO treasury_collection_wallets(network,currency,address,encrypted_key,created_by) VALUES(?,?,?,?,1)',[network,currency,`qa-vault-${currency}`,'qa-encrypted']);
  await database.execute('UPDATE treasury_payout_policy SET maximum_amount=1000,maximum_fee=1,gas_reserve=0 WHERE currency=?',[currency]);
  if(['BTC','ETH'].includes(currency))await database.execute("INSERT INTO native_chain_jobs(id,currency,kind,request_key,status,plan_json,received,expires_at) VALUES(?,?,'collection',?,'confirmed','{}',100,NOW())",[randomUUID(),currency,randomUUID()]);
  else await database.execute("INSERT INTO treasury_collection_jobs(id,plan_id,network,user_id,wallet_id,source_address,destination_address,amount,received,fee_budget,status) VALUES(?,?,?,1,1,?,?,100,100,1,'completed')",[randomUUID(),randomUUID(),network,'qa-source',`qa-vault-${currency}`]);
  const input={amount:'10',destination:`qa-external-${currency}`,requestKey:randomUUID()};
  const plan=await service.previewTreasuryPayout(currency,1,input);
  await service.executeTreasuryPayout(plan.id,1);await service.executeTreasuryPayout(plan.id,1);
  assert.equal((await service.payoutState(currency)).reserved,'10.000000000000000000');
  await service.recheckTreasuryPayout(plan.id);
  assert.equal(Number((await service.payoutState(currency)).bookBalance),90);
 }
 assert.equal(signs,4);assert.equal(attempts,4);
 const failed=await service.previewTreasuryPayout('SOL',1,{amount:'10',destination:'qa-external-SOL',requestKey:randomUUID()});
 await service.executeTreasuryPayout(failed.id,1);receipt={success:false,fee:'0.005'};await service.recheckTreasuryPayout(failed.id);
 assert.equal(Number((await service.payoutState('SOL')).bookBalance),89.995);
 const rollback=await service.previewTreasuryPayout('ETH',1,{amount:'10',destination:'qa-external-ETH',requestKey:randomUUID()});
 const blocker=await service.previewTreasuryPayout('ETH',1,{amount:'1',destination:'qa-external-ETH',requestKey:randomUUID()});
 await database.execute("UPDATE treasury_payouts SET active_currency='ETH' WHERE id=?",[blocker.id]);
 const before=(await service.payoutState('ETH')).bookBalance;
 await assert.rejects(()=>service.executeTreasuryPayout(rollback.id,1));
 assert.equal((await service.payoutState('ETH')).bookBalance,before);
 console.log(JSON.stringify({isolatedDatabase:databaseName,allFourAssets:true,atomicReservation:true,signedBytesPersistedBeforeBroadcast:true,idempotency:true,failedFeeRefund:true,realMoneyTransferred:false}));
}finally{await database.end();}
