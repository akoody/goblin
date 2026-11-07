import test from 'node:test';
import assert from 'node:assert/strict';
import * as bitcoin from 'bitcoinjs-lib';
import {Wallet,Transaction as EthTransaction} from 'ethers';
import {db} from '../src/config/db.js';
import {atomic,nativeAmount,nativePolicy,proveCustody,withdrawalTotals,validateNativePlan,sameNativePolicy,sameNativeChain} from '../src/services/native-chain-policy.js';
import {nativeKeyAddress,buildNativeTransaction,nativeAddress,btcSigner} from '../src/services/native-chain-client.js';
import {settleNativeJob} from '../src/services/native-chain.service.js';
import {safioNetwork,validateSafioResult,createSafioClient} from '../src/services/safio-client.js';
import {proveNativeDepositFunding} from '../src/services/native-deposit-proof.js';

test('BTC/ETH accounting keeps satoshi/wei precision and never infers fees from surplus',()=>{
 assert.equal(atomic('0.00000001','BTC'),1n);assert.equal(atomic('0.000000000000000001','ETH'),1n);
 assert.equal(nativeAmount(1n,'ETH'),'0.000000000000000001');
 assert.throws(()=>atomic('0.000000001','BTC'));assert.throws(()=>atomic('-1','ETH'));
 assert.throws(()=>proveCustody(11n,8n,2n));assert.throws(()=>proveCustody(9n,8n,2n));
 assert.equal(withdrawalTotals(5n,1n,2n,8n),8n);assert.throws(()=>withdrawalTotals(5n,1n,2n,7n));
});
test('Native policy validates server flags, limits and editable non-negative service fee',()=>{
 const body={deposits_enabled:true,withdrawals_enabled:true,withdrawal_fee_usd:'1',minimum_withdrawal_usd:'10',collection_mode:'manual',collection_threshold:'0.001',minimum_source:'0.0001',maximum_network_fee:'0.00005'};
 assert.equal(nativePolicy(body,'BTC').withdrawal_fee_usd,'1.00');
 const policy={...body,currency:'BTC'};assert(sameNativePolicy(policy,Object.fromEntries(Object.entries(policy).reverse())));
 assert(sameNativeChain({balance:'1',utxos:[{txid:'id',vout:0,value:'1',script:'a'}]},{utxos:[{script:'a',value:'1',vout:0,txid:'id'}],balance:'1'}));
 for(const invalid of [{withdrawal_fee_usd:'-1'},{deposits_enabled:'yes'},{collection_mode:'unsafe'},{minimum_source:'0.000000001'},{minimum_withdrawal_usd:'1'}])assert.throws(()=>nativePolicy({...body,...invalid},'BTC'));
});
function btcSource(key,index,balance='0.001',earned='0.0002'){
 const address=nativeKeyAddress('BTC',key),script=bitcoin.address.toOutputScript(address),total=atomic(balance,'BTC')+atomic(earned,'BTC');
 const tx=new bitcoin.Transaction();tx.addInput(Buffer.alloc(32,index+1),0);tx.addOutput(script,total);
 return {walletId:index+1,userId:index+1,address,balance,earned:atomic(earned,'BTC').toString(),gross:atomic(earned,'BTC').toString(),chain:{balance:total.toString(),utxos:[{txid:tx.getId(),vout:0,value:total.toString(),script:Buffer.from(script).toString('hex')}]}};
}
test('Bitcoin consolidation signs a multi-wallet batch and returns every customer liability intact',async()=>{
 const keys=[Wallet.createRandom().privateKey,Wallet.createRandom().privateKey],sources=keys.map((key,i)=>btcSource(key,i));
 const vault=nativeKeyAddress('BTC',Wallet.createRandom().privateKey),fee='1000',gross='40000';
 const plan={currency:'BTC',kind:'collection',sources,cost:{fee,satVbyte:1},gross,outputs:[{address:vault,value:'39000'},...sources.map(s=>({address:s.address,value:'100000'}))]};
 const signed=await buildNativeTransaction(plan,keys),tx=bitcoin.Transaction.fromHex(signed.hex);
 assert.equal(tx.ins.length,2);assert.equal(tx.getId(),signed.hash);assert.equal(tx.outs[0].value,39000n);assert.equal(tx.outs[1].value,100000n);assert.equal(tx.outs[2].value,100000n);
 for(const input of tx.ins)assert.equal(input.witness.length,2);
 const damaged=structuredClone(plan);damaged.outputs[1].value='99999';assert.throws(()=>validateNativePlan(damaged));
 await assert.rejects(async()=>buildNativeTransaction(plan,[Wallet.createRandom().privateKey,keys[1]]));
});
test('Bitcoin withdrawal includes customer change and rejects dust rather than donating it',async()=>{
 const key=Wallet.createRandom().privateKey,source=btcSource(key,0),to=nativeKeyAddress('BTC',Wallet.createRandom().privateKey);
 const plan={currency:'BTC',kind:'withdrawal',sources:[source],amount:'10000',serviceFee:'1000',total:'12000',cost:{fee:'1000',satVbyte:1},outputs:[{address:to,value:'10000'},{address:source.address,value:'109000'}]};
 const signed=await buildNativeTransaction(plan,[key]);assert.equal(bitcoin.Transaction.fromHex(signed.hex).outs[1].value,109000n);
 const dust=structuredClone(plan);dust.amount='100';dust.total='2100';dust.outputs[0].value='100';dust.outputs[1].value='118900';await assert.rejects(async()=>buildNativeTransaction(dust,[key]),e=>e.code==='DUST_OUTPUT');
 assert.throws(()=>nativeAddress('BTC','0xinvalid'));
});
test('Ethereum collection signs only mainnet, approved recipient and exact fee budget',async()=>{
 const key=Wallet.createRandom().privateKey,source={walletId:1,userId:1,address:nativeKeyAddress('ETH',key),balance:'1',earned:'10000000000000000',gross:'10000000000000000',chain:{balance:'1010000000000000000',nonce:3}};
 const plan={currency:'ETH',kind:'collection',sources:[source],gross:source.gross,cost:{fee:'21000000000000',gasPrice:'1000000000'},outputs:[{address:Wallet.createRandom().address,value:'9979000000000000'}]};
 const signed=await buildNativeTransaction(plan,[key]),tx=EthTransaction.from(signed.hex);
 assert.equal(tx.chainId,1n);assert.equal(tx.nonce,3);assert.equal(tx.gasLimit,21000n);assert.equal(tx.gasPrice,1000000000n);assert.equal(tx.from,source.address);assert.equal(tx.hash,signed.hash);
 const invalid=structuredClone(plan);invalid.outputs[0].value='10000000000000000';assert.throws(()=>validateNativePlan(invalid));
});
test('Safio never maps Bitcoin to TRON; Ethereum uses its own capability',async()=>{
 assert.equal(safioNetwork('ETH'),'ethereum');assert.equal(safioNetwork('BTC'),null);
 const report={status:'completed',result:{product:'screen',subject:{type:'address',value:'sender',network:'tron',asset:'BTC'},coverage_status:'complete',risk_level:'LOW',decision:'allow'}};
 assert.throws(()=>validateSafioResult(report,{currency:'BTC',from_address:'sender'}));
 await assert.rejects(async()=>createSafioClient('test',()=>{throw new Error('Must not call provider');}).create({id:1,currency:'BTC'}),/UNSUPPORTED_NETWORK/);
});
test('Native deposit credit requires coverage of every client liability, fee and quarantined deposit',async()=>{
 const original=global.fetch;let balance=100n;
 global.fetch=async(_url,options)=>{const {method}=JSON.parse(options.body);const result=method==='eth_chainId'?'0x1':method==='eth_getTransactionCount'?'0x0':method==='eth_getCode'?'0x':'0x'+balance.toString(16);return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result}));};
 const executor={execute:async sql=>[[{amount:sql.includes('admin_treasury_ledger')?'0.000000000000000001':sql.includes('native_fee_ledger')?'0.000000000000000001':'0.000000000000000020'}]]};
 try{const wallet={id:1,address:Wallet.createRandom().address,balance:'0.000000000000000078'};await proveNativeDepositFunding(executor,wallet,'ETH');balance=101n;await assert.rejects(proveNativeDepositFunding(executor,wallet,'ETH'),e=>e.code==='CUSTODY_MISMATCH');}finally{global.fetch=original;}
});
test('Withdrawal settles once: service fee on success only, actual gas deducted and full reserve released',async()=>{
 const original=db.getConnection;let status='submitted',expenses=0,profit=0;const writes=[];
 db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute:async(sql,args)=>{
  writes.push({sql,args});if(sql.startsWith('SELECT status'))return [[{status}]];
  if(sql.startsWith('SELECT id,collection_lock_id'))return [[{id:1,collection_lock_id:'job'}]];
  if(sql.startsWith('UPDATE wallets SET balance')){expenses++;assert.equal(args[0],'0.000000000000000107');assert.equal(args[1],'0.000000000000000120');}
  if(sql.startsWith('INSERT INTO native_fee_ledger')){profit++;assert.equal(args.at(-1),'0.000000000000000005');}
  if(sql.startsWith('UPDATE native_chain_jobs'))status=args[0];return [{affectedRows:1}];
 }});
 const plan={currency:'ETH',kind:'withdrawal',sources:[{walletId:1,address:'source'}],outputs:[{address:'to',value:'100'}],amount:'100',serviceFee:'5',total:'120',cost:{fee:'15'}};
 try{const job={id:'job',kind:'withdrawal',currency:'ETH',tx_hash:'hash',plan_json:plan};await settleNativeJob(job,{success:true,fee:2n});await settleNativeJob(job,{success:true,fee:2n});assert.equal(expenses,1);assert.equal(profit,1);assert.equal(status,'confirmed');assert(writes.some(w=>w.sql==='UPDATE wallets SET collection_lock_id=NULL WHERE id=?'));}
 finally{db.getConnection=original;await db.end();}
});
