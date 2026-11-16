import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import {randomUUID} from 'node:crypto';
import {createTreasuryPayoutService} from '../src/services/treasury-payout.service.js';

function fixture(currency='SOL'){
 const policies={currency,mode:'manual',destination:'external',threshold_amount:'5',maximum_amount:'100',maximum_fee:'1',gas_reserve:'0',cooldown_seconds:60,revision:1};
 const rows=new Map(),state={balance:new Decimal(100),signs:0,sends:0,receipt:{success:true,fee:'0.01'}};
 const execute=async(sql,args=[])=>{
  if(sql.includes('GET_LOCK'))return [[{ok:1}]];
  if(sql.includes('RELEASE_LOCK'))return [[{ok:1}]];
  if(sql.startsWith('SELECT * FROM treasury_payout_policy'))return [[policies]];
  if(sql.startsWith('SELECT network,address FROM treasury_collection_wallets'))return [[{address:'vault'}]];
  if(sql.startsWith('SELECT * FROM treasury_collection_wallets'))return [[{address:'vault',encrypted_key:'encrypted'}]];
  if(sql.startsWith('SELECT balance FROM admin_treasury'))return [[{balance:state.balance.toFixed()}]];
  if(sql.includes('COALESCE(SUM(received)'))return [[{amount:'100'}]];
  if(sql.includes(' spent, COALESCE')){
   const active=[...rows.values()].filter(row=>['prepared','submitted','review'].includes(row.status));
   const done=[...rows.values()].filter(row=>row.status==='confirmed');
   return [[{spent:done.reduce((sum,row)=>sum.plus(row.gross_amount),new Decimal(0)).toFixed(),reserved:active.reduce((sum,row)=>sum.plus(row.gross_amount),new Decimal(0)).toFixed()}]];
  }
  if(sql.startsWith('SELECT id,actor_id,currency'))return [[...rows.values()].filter(row=>row.request_key===args[0])];
  if(sql.startsWith('SELECT id FROM treasury_payouts'))return [[...rows.values()].filter(row=>row.currency===args[0]&&['prepared','submitted','review'].includes(row.status))];
  if(sql.includes('FROM wallets WHERE LOWER')||sql.includes('FROM treasury_collection_wallets WHERE LOWER')||sql.includes('FROM solana_accounts')||sql.includes('FROM treasury_collection_jobs')||sql.includes('FROM treasury_collection_gas_grants'))return [[]];
  if(sql.startsWith('INSERT INTO treasury_payouts')){
   const [id,currency,actor_id,request_key,policy_revision,destination,gross_amount,received_amount,fee_budget,plan_json]=args;
   rows.set(id,{id,currency,actor_id,request_key,policy_revision,destination,gross_amount,received_amount,fee_budget,plan_json,status:'preview',fresh:1});return [{affectedRows:1}];
  }
  if(sql.startsWith('SELECT plan_json'))return [[rows.get(args[0])]];
  if(sql.startsWith('SELECT *,expires_at'))return [[rows.get(args[0])]];
  if(sql.startsWith('SELECT * FROM treasury_payouts WHERE id='))return [[rows.get(args[0])]];
  if(sql.startsWith('SELECT id,currency,status')||sql.startsWith('SELECT status FROM treasury_payouts'))return [[rows.get(args[0])]];
  if(sql.startsWith('UPDATE admin_treasury SET balance=balance-')){if(state.balance.lt(args[0]))return [{affectedRows:0}];state.balance=state.balance.minus(args[0]);return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE admin_treasury SET balance=balance+')){state.balance=state.balance.plus(args[0]);return [{affectedRows:1}];}
  if(sql.startsWith("UPDATE treasury_payouts SET status='prepared'")){const [signed_transaction,tx_hash,plan_json,id]=args;Object.assign(rows.get(id),{status:'prepared',signed_transaction,tx_hash,plan_json});return [{affectedRows:1}];}
  if(sql.startsWith("UPDATE treasury_payouts SET status='submitted'")){rows.get(args[0]).status='submitted';return [{affectedRows:1}];}
  if(sql.startsWith("UPDATE treasury_payouts SET error_code='BROADCAST_UNCERTAIN'")){rows.get(args[0]).error_code='BROADCAST_UNCERTAIN';return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE treasury_payouts SET status=?')){const [status,fee_charged,received_amount,id]=args;Object.assign(rows.get(id),{status,fee_charged,received_amount,signed_transaction:null});return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO treasury_collection_audit'))return [{affectedRows:1}];
  throw Error('Unexpected SQL: '+sql);
 };
 const database={execute,query:execute,getConnection:async()=>({query:execute,release(){}})};
 const service=createTreasuryPayoutService({database,transaction:work=>work({execute,query:execute}),decrypt:()=>{return 'fake-test-key';},transport:{
  payoutAddress:(_currency,address)=>address,
  vaultChain:async()=>({balance:'100',gas:'100',chain:{balance:'100000000000'}}),
  payoutQuote:async(currency,source,to,gross)=>({fee:'0.01',received:currency==='USDT'?gross:new Decimal(gross).minus('0.01').toFixed(),source:source.address}),
  signPayout:async()=>{state.signs++;return {signed:'persisted-signed-bytes',hash:'test-hash'};},
  sendPayout:async row=>{assert.equal(rows.get(row.id).signed_transaction,'persisted-signed-bytes');assert.equal(state.balance.toFixed(),'90');state.sends++;if(state.sendError)throw Error('uncertain provider response');},
  payoutReceipt:async()=>state.receipt,
 }});
 return {service,state,rows,policies};
}
test('All treasury assets reserve once, persist before broadcast, and reconcile without a second debit',async()=>{
 for(const currency of ['USDT','SOL','BTC','ETH']){
  const {service,state}=fixture(currency),key=randomUUID();
  const plan=await service.previewTreasuryPayout(currency,1,{amount:'10',destination:'external',requestKey:key});
  assert.equal(state.balance.toFixed(),'100');assert.equal(state.signs,0);
  assert.equal((await service.previewTreasuryPayout(currency,1,{amount:'10',destination:'external',requestKey:key})).id,plan.id);
  await service.executeTreasuryPayout(plan.id,1);await service.executeTreasuryPayout(plan.id,1);
  assert.equal(state.signs,1);assert.equal(state.sends,1);assert.equal(state.balance.toFixed(),'90');
  assert.equal((await service.recheckTreasuryPayout(plan.id)).status,'confirmed');assert.equal(state.balance.toFixed(),'90');
 }
});
test('A failed native payout returns principal minus actual gas; an uncertain receipt holds the reserve',async()=>{
 const {service,state}=fixture();
 const plan=await service.previewTreasuryPayout('SOL',1,{amount:'10',destination:'external',requestKey:randomUUID()});
 await service.executeTreasuryPayout(plan.id,1);
 state.receipt={pending:true};await service.recheckTreasuryPayout(plan.id);assert.equal(state.balance.toFixed(),'90');assert.equal(state.signs,1);
 state.receipt={success:false,fee:'0.005'};await service.recheckTreasuryPayout(plan.id);assert.equal(state.balance.toFixed(),'99.995');
});
test('Changed policy or expired preview cannot sign, and ambiguous broadcasting never signs a second transaction',async()=>{
 const {service,state,rows,policies}=fixture();
 const plan=await service.previewTreasuryPayout('SOL',1,{amount:'10',destination:'external',requestKey:randomUUID()});
 policies.revision=2;await assert.rejects(()=>service.executeTreasuryPayout(plan.id,1));assert.equal(state.signs,0);
 policies.revision=1;rows.get(plan.id).fresh=0;await assert.rejects(()=>service.executeTreasuryPayout(plan.id,1));assert.equal(state.signs,0);
 rows.get(plan.id).fresh=1;state.sendError=true;
 assert.equal((await service.executeTreasuryPayout(plan.id,1)).status,'prepared');
 await service.executeTreasuryPayout(plan.id,1);assert.equal(state.signs,1);assert.equal(state.balance.toFixed(),'90');
 state.sendError=false;state.receipt={pending:true};await service.recheckTreasuryPayout(plan.id);assert.equal(state.signs,1);assert.equal(state.sends,2);
});
test('TRON failure returns all USDT principal and records TRX gas separately',async()=>{
 const {service,state,rows}=fixture('USDT');
 const plan=await service.previewTreasuryPayout('USDT',1,{amount:'10',destination:'external',requestKey:randomUUID()});
 await service.executeTreasuryPayout(plan.id,1);state.receipt={success:false,fee:'0.005'};
 await service.recheckTreasuryPayout(plan.id);assert.equal(state.balance.toFixed(),'100');assert.equal(rows.get(plan.id).fee_charged,'0.005');
});
