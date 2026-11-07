// Integration check against an explicitly isolated, empty QA database only.
// All blockchain HTTP calls are replaced; this script cannot broadcast real funds.
import 'dotenv/config';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import * as bitcoin from 'bitcoinjs-lib';
import {Wallet,Transaction as EthTransaction,keccak256} from 'ethers';
import {db} from '../src/config/db.js';
import {encryptWalletPrivateKey} from '../src/services/wallet-generator.service.js';
import {nativeKeyAddress} from '../src/services/native-chain-client.js';
import {createNativeVaults,quoteNativeWithdrawal,executeNativePlan,previewNativeCollection,runNativeJobs} from '../src/services/native-chain.service.js';
import {recordPendingDeposit,autoApproveBitcoinWithoutAml} from '../src/services/deposit-compliance.service.js';

const database=process.env.NATIVE_QA_DATABASE;
if(!/^qa_native_[a-z0-9_]+$/.test(database||'')||database===process.env.DB_NAME)throw new Error('An isolated qa_native_* database is required');
const qa=mysql.createPool({socketPath:process.env.NATIVE_QA_SOCKET||'/var/run/mysqld/mysqld.sock',user:'root',database,connectionLimit:8});
const original={query:db.query,execute:db.execute,getConnection:db.getConnection,fetch:global.fetch};
db.query=qa.query.bind(qa);db.execute=qa.execute.bind(qa);db.getConnection=qa.getConnection.bind(qa);
process.env.NATIVE_CHAINS_ENABLED='true';
let ethBalance=1010000000000000000n,ethNonce=0,confirmed=false,broadcasts=0;
const keys={ETH:Wallet.createRandom().privateKey,BTC:Wallet.createRandom().privateKey};
const addresses=Object.fromEntries(Object.entries(keys).map(([c,k])=>[c,nativeKeyAddress(c,k)]));
const txs=new Map(),utxos=new Map(),seen=new Set();
const previous=new bitcoin.Transaction();previous.addInput(Buffer.alloc(32,7),0);previous.addOutput(bitcoin.address.toOutputScript(addresses.BTC),120000n);
txs.set(previous.getId(),{hex:previous.toHex(),fee:0});utxos.set(previous.getId()+':0',{txid:previous.getId(),vout:0,value:120000,script:Buffer.from(previous.outs[0].script).toString('hex')});
const hash90='ab'.repeat(32),hash99='cd'.repeat(32),hash100='ef'.repeat(32);
function response(value){return new Response(typeof value==='string'?value:JSON.stringify(value),{status:200});}
global.fetch=async(input,options={})=>{
 const url=new URL(input);
 if(url.hostname==='ethereum-rpc.publicnode.com'){
  const {method,params}=JSON.parse(options.body);let result;
  if(method==='eth_chainId')result='0x1';
  else if(method==='eth_getBalance')result='0x'+ethBalance.toString(16);
  else if(method==='eth_getTransactionCount')result='0x'+ethNonce.toString(16);
  else if(method==='eth_getCode')result='0x';
  else if(method==='eth_gasPrice')result='0x3b9aca00';
  else if(method==='eth_getBlockByNumber')result={number:params[0]==='finalized'?'0x64':params[0],hash:'0x'+(params[0]==='finalized'?hash100:hash99)};
  else if(method==='eth_sendRawTransaction'){
   broadcasts++;const hex=params[0],tx=EthTransaction.from(hex),hash=keccak256(hex);
   if(!seen.has(hash)){seen.add(hash);ethBalance-=tx.value+tx.gasLimit*tx.gasPrice;ethNonce++;txs.set(hash,{hex,tx});}result=hash;
  }else if(method==='eth_getTransactionReceipt'){
   const saved=txs.get(params[0]);result=confirmed&&saved?{transactionHash:params[0],from:saved.tx.from,to:saved.tx.to,status:'0x1',blockNumber:'0x63',blockHash:'0x'+hash99,gasUsed:'0x5208',effectiveGasPrice:'0x3b9aca00'}:null;
  }else throw new Error('Unexpected Ethereum RPC '+method);
  return response({jsonrpc:'2.0',id:1,result});
 }
 if(url.hostname==='api.binance.com')return response({price:url.searchParams.get('symbol')==='ETHUSDT'?'2000':'100000'});
 if(url.hostname!=='blockstream.info')throw new Error('External request blocked in QA');
 const p=url.pathname.replace(/^\/api/,'');
 if(p==='/block-height/0')return response('000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f');
 if(p==='/blocks/tip/height')return response('100');
 if(p==='/block-height/90')return response(hash90);
 if(p==='/fee-estimates')return response({'6':1});
 if(p.startsWith('/address/')){
  const address=p.split('/')[2],script=Buffer.from(bitcoin.address.toOutputScript(address)).toString('hex');
  return response([...utxos.values()].filter(u=>u.script===script).map(({script,...u})=>({...u,status:{confirmed:true,block_height:90,block_hash:hash90}})));
 }
 if(p==='/tx'){
  broadcasts++;const hex=options.body,tx=bitcoin.Transaction.fromHex(hex),hash=tx.getId();
  if(!seen.has(hash)){
   seen.add(hash);let total=0;
   for(const input of tx.ins){const key=Buffer.from(input.hash).reverse().toString('hex')+':'+input.index;const old=utxos.get(key);assert(old);total+=old.value;utxos.delete(key);}
   tx.outs.forEach((out,index)=>utxos.set(hash+':'+index,{txid:hash,vout:index,value:Number(out.value),script:Buffer.from(out.script).toString('hex')}));
   txs.set(hash,{hex,fee:total-tx.outs.reduce((sum,o)=>sum+Number(o.value),0)});
  }return response(hash);
 }
 const parts=p.split('/');if(parts[1]==='tx'){
  const saved=txs.get(parts[2]);assert(saved);
  if(parts[3]==='hex')return response(saved.hex);
  return response({fee:saved.fee,status:{confirmed,block_height:90,block_hash:hash90}});
 }
 throw new Error('Unexpected Bitcoin request '+p);
};
try{
 const [[count]]=await qa.query('SELECT COUNT(*) n FROM users');assert.equal(Number(count.n),0,'QA database must be empty');
 await qa.query("INSERT IGNORE INTO native_chain_policy(currency,collection_threshold,minimum_source,maximum_network_fee) VALUES('BTC',0.001,0.0001,0.00005),('ETH',0.05,0.0025,0.001)");
 await qa.query('INSERT IGNORE INTO deposit_policy(id,fee_usd,min_usd) VALUES(1,2,5)');
 await qa.execute("INSERT INTO users(id,username,email,password_hash,status) VALUES(1,'native-qa','native-qa@example.invalid','qa','active')");
 for(const c of ['BTC','ETH']){
  const balance=c==='ETH'?'1':'0.001',fee=c==='ETH'?'0.01':'0.0002';
  const [r]=await qa.execute('INSERT INTO wallets(user_id,currency,balance,address,private_key) VALUES(1,?,?,?,?)',[c,balance,addresses[c],encryptWalletPrivateKey(keys[c],1,c)]);
  await qa.execute("INSERT INTO native_fee_ledger(job_id,wallet_id,currency,kind,amount) VALUES('qa-seed',?,?,'withdrawal',?)",[r.insertId,c,fee]);
  await qa.execute('INSERT INTO admin_treasury(currency,balance) VALUES(?,?)',[c,fee]);
 }
 await qa.query('UPDATE native_chain_policy SET deposits_enabled=1,withdrawals_enabled=1');
 await createNativeVaults(1);
 for(const currency of ['ETH','BTC']){
  confirmed=false;const recipient=nativeKeyAddress(currency,Wallet.createRandom().privateKey);
  const q=await quoteNativeWithdrawal(1,currency,recipient,currency==='ETH'?'0.01':'0.0001','qa-withdrawal-'+currency+'-001');
  await executeNativePlan(q.id,1);await executeNativePlan(q.id,1);await runNativeJobs();
  const [[pending]]=await qa.execute('SELECT locked_balance,collection_lock_id FROM wallets WHERE user_id=1 AND currency=?',[currency]);assert(pending.collection_lock_id);assert(Number(pending.locked_balance)>0);
  confirmed=true;await runNativeJobs();await runNativeJobs();
  const [[before]]=await qa.execute('SELECT balance FROM wallets WHERE user_id=1 AND currency=?',[currency]);
  const plan=await previewNativeCollection(currency,1,'qa-collection-'+currency+'-001');assert(!plan.empty);
  await executeNativePlan(plan.id,null,1);await runNativeJobs();
  const [[after]]=await qa.execute('SELECT balance,locked_balance,collection_lock_id FROM wallets WHERE user_id=1 AND currency=?',[currency]);
  assert.equal(after.balance,before.balance);assert.equal(Number(after.locked_balance),0);assert.equal(after.collection_lock_id,null);
 }
 const [[jobs]]=await qa.query("SELECT COUNT(*) n FROM native_chain_jobs WHERE status='confirmed'");assert.equal(Number(jobs.n),4);
 const [[guards]]=await qa.query('SELECT COUNT(*) n FROM wallets WHERE collection_lock_id IS NOT NULL');assert.equal(Number(guards.n),0);
 await qa.query("UPDATE native_chain_policy SET aml_disabled=1,deposits_enabled=1 WHERE currency='BTC'");
 const depositTx=new bitcoin.Transaction();depositTx.addInput(Buffer.alloc(32,9),0);depositTx.addOutput(bitcoin.address.toOutputScript(addresses.BTC),10000n);
 const depositHash=depositTx.getId();txs.set(depositHash,{hex:depositTx.toHex(),fee:0});utxos.set(depositHash+':0',{txid:depositHash,vout:0,value:10000,script:Buffer.from(depositTx.outs[0].script).toString('hex')});
 const [[wallet]]=await qa.execute("SELECT id FROM wallets WHERE user_id=1 AND currency='BTC'");
 await recordPendingDeposit({wallet,currency:'BTC',network:'BITCOIN',txHash:depositHash,eventIndex:0,from:'qa-sender',to:addresses.BTC,amount:'0.0001',timestamp:Date.now()});
 const [[deposit]]=await qa.execute('SELECT id FROM blockchain_deposits WHERE tx_hash=?',[depositHash]);
 await autoApproveBitcoinWithoutAml(deposit.id);await autoApproveBitcoinWithoutAml(deposit.id);
 const [[review]]=await qa.execute('SELECT status,risk_level,report_provider,net_amount FROM deposit_reviews WHERE deposit_id=?',[deposit.id]);
 assert.equal(review.status,'CREDITED');assert.equal(review.risk_level,'NOT_SCREENED');assert.equal(review.report_provider,'NO_AML');assert.equal(Number(review.net_amount),0.00008);
 console.log(JSON.stringify({isolatedSql:true,withdrawalsConfirmed:2,collectionsConfirmed:2,customerChangePreserved:true,replayedIdenticalBytes:true,unscreenedBitcoinCredit:true,broadcastAttempts:broadcasts,realNetworkRequests:0}));
}finally{
 global.fetch=original.fetch;db.query=original.query;db.execute=original.execute;db.getConnection=original.getConnection;await qa.end();await db.end();
}
