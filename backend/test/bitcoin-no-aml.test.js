import test from 'node:test';
import assert from 'node:assert/strict';
import {Wallet} from 'ethers';
import * as bitcoin from 'bitcoinjs-lib';
import {db} from '../src/config/db.js';
import {bitcoinUnscreenedAllowed} from '../src/services/deposit-policy.js';
import {nativePolicy} from '../src/services/native-chain-policy.js';
import {nativeKeyAddress} from '../src/services/native-chain-client.js';
import {autoApproveBitcoinWithoutAml,recordPendingDeposit} from '../src/services/deposit-compliance.service.js';

test('No-AML scope requires explicit BTC policy and discovery snapshot, never other networks or old reviews',()=>{
 const d={currency:'BTC',network:'BITCOIN',status:'PENDING_CHAIN',aml_exempt:1},p={currency:'BTC',aml_disabled:1,deposits_enabled:1};
 assert(bitcoinUnscreenedAllowed(d,p));
 for(const change of [{currency:'ETH'},{network:'ETHEREUM'},{status:'PENDING_AML'},{status:'BLOCKED'},{aml_exempt:0}])assert.equal(bitcoinUnscreenedAllowed({...d,...change},p),false);
 for(const change of [{currency:'ETH'},{aml_disabled:0},{deposits_enabled:0}])assert.equal(bitcoinUnscreenedAllowed(d,{...p,...change}),false);
 const policy={deposits_enabled:true,withdrawals_enabled:true,withdrawal_fee_usd:'1',minimum_withdrawal_usd:'10',collection_mode:'manual',collection_threshold:'1',minimum_source:'1',maximum_network_fee:'1',aml_disabled:true};
 assert.throws(()=>nativePolicy(policy,'ETH'));assert.equal(nativePolicy(policy,'BTC').aml_disabled,true);
});
test('New BTC discovery snapshots no-AML mode; other deposits keep AML unchanged',async()=>{
 const old=db.getConnection;let enabled=1,inserted;
 db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute:async(sql,args)=>{
  if(sql.startsWith('SELECT fee_usd'))return [[{fee_usd:'2',min_usd:'5'}]];
  if(sql.startsWith('SELECT aml_disabled'))return [[{aml_disabled:enabled}]];
  if(sql.startsWith('INSERT INTO deposit_reviews'))inserted=args;
  return [{affectedRows:1,insertId:7}];
 }});
 try{
  const event={wallet:{id:1},currency:'BTC',network:'BITCOIN',txHash:'test',eventIndex:0,from:'sender',to:'receiver',amount:'0.0001',timestamp:Date.now()};
  await recordPendingDeposit(event);assert.deepEqual(inserted.slice(3),['PENDING_CHAIN',1]);
  enabled=0;await recordPendingDeposit(event);assert.deepEqual(inserted.slice(3),['PENDING_AML',0]);
  enabled=1;await recordPendingDeposit({...event,currency:'ETH',network:'ETHEREUM'});assert.deepEqual(inserted.slice(3),['PENDING_AML',0]);
 }finally{db.getConnection=old;}
});
test('Unscreened BTC credit keeps chain proof, minimum and fees; records NOT_SCREENED and settles once',async()=>{
 const old={execute:db.execute,getConnection:db.getConnection,fetch:global.fetch};
 const address=nativeKeyAddress('BTC',Wallet.createRandom().privateKey),tx=new bitcoin.Transaction();tx.addInput(Buffer.alloc(32,4),0);tx.addOutput(bitcoin.address.toOutputScript(address),10000n);
 let status='PENDING_CHAIN',policyEnabled=1,exempt=1,confirmations=11,credits=0,fees=0,currency='BTC';
 const hash='aa'.repeat(32);
 global.fetch=async(input)=>{
  const url=new URL(input);if(url.hostname==='api.binance.com')return new Response(JSON.stringify({price:'100000'}));
  if(url.hostname!=='blockstream.info')throw new Error('No AML or unknown provider may be called');
  let body;const path=url.pathname.replace(/^\/api/,'');
  if(path==='/block-height/0')body='000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';
  else if(path==='/blocks/tip/height')body='100';
  else if(path==='/block-height/'+(101-confirmations))body=hash;
  else if(path.includes('/address/'))body=[{txid:tx.getId(),vout:0,value:10000,status:{confirmed:true,block_height:101-confirmations,block_hash:hash}}];
  else if(path.endsWith('/hex'))body=tx.toHex();else throw new Error('Unexpected request');
  return new Response(typeof body==='string'?body:JSON.stringify(body));
 };
 db.execute=async()=>[[{currency}]];
 db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute:async(sql,args)=>{
  if(sql.startsWith('SELECT d.*'))return [[{id:1,wallet_id:1,currency:'BTC',network:'BITCOIN',status,aml_exempt:exempt,amount:'0.0001',fee_usd:'2',min_usd:'5',tx_hash:tx.getId(),from_address:'sender',to_address:address}]];
  if(sql.startsWith('SELECT currency,aml_disabled'))return [[{currency:'BTC',aml_disabled:policyEnabled,deposits_enabled:1}]];
  if(sql.includes('deposit_aml_checks'))throw new Error('A fake AML check must never be consulted');
  if(sql.startsWith('SELECT w.*'))return [[{id:1,user_id:1,address,balance:'0',status:'active',user_status:'active',deposits_enabled:1}]];
  if(sql.startsWith('SELECT COALESCE'))return [[{amount:sql.includes('credited_at IS NULL')?'0.0001':'0'}]];
  if(sql.startsWith('UPDATE wallets')){credits++;assert.equal(args[0],'0.00008000');}
  if(sql.startsWith('INSERT INTO admin_treasury (')){fees++;assert.equal(args[1],'0.00002000');}
  if(sql.startsWith("UPDATE deposit_reviews SET status='CREDITED'")){status='CREDITED';assert.equal(args[5],'NO_AML');assert.equal(args[7],'NOT_SCREENED');assert(args[8].includes('AML не выполнялся'));}
  return [{affectedRows:1}];
 }});
 try{
  currency='ETH';await assert.rejects(autoApproveBitcoinWithoutAml(1),e=>e.status===403);currency='BTC';
  policyEnabled=0;await assert.rejects(autoApproveBitcoinWithoutAml(1));policyEnabled=1;
  exempt=0;await assert.rejects(autoApproveBitcoinWithoutAml(1));exempt=1;
  status='PENDING_AML';await assert.rejects(autoApproveBitcoinWithoutAml(1));status='PENDING_CHAIN';
  confirmations=5;await assert.rejects(autoApproveBitcoinWithoutAml(1),e=>e.code==='SOURCE_BUSY');confirmations=11;
  assert.equal(credits,0);assert.equal(fees,0);
  assert.equal((await autoApproveBitcoinWithoutAml(1)).status,'CREDITED');
  assert.equal((await autoApproveBitcoinWithoutAml(1)).status,'CREDITED');assert.equal(credits,1);assert.equal(fees,1);
 }finally{db.execute=old.execute;db.getConnection=old.getConnection;global.fetch=old.fetch;await db.end();}
});
