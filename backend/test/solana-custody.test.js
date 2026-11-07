import test from 'node:test';
import assert from 'node:assert/strict';
import {db} from '../src/config/db.js';
import {atomicSol,safeAtomic,tokenBalance} from '../src/services/solana-client.js';
import {settleSwap} from '../src/services/solana-custody.service.js';
test('SOL conversion is exact and unsafe RPC numbers fail closed',()=>{
 assert.equal(atomicSol('0.000000001'),'1');assert.equal(atomicSol('1.123456789'),'1123456789');
 for(const value of ['0','-1','NaN','1.0000000001'])assert.throws(()=>atomicSol(value));
 assert.throws(()=>safeAtomic(Number.MAX_SAFE_INTEGER+1));
 assert.equal(tokenBalance([{mint:'a',owner:'u',uiTokenAmount:{amount:'9007199254740993'}},{mint:'b',owner:'u',uiTokenAmount:{amount:'4'}}],'a','u'),9007199254740993n);
});
test('Finalized swap settles the exact cost and credits mint-specific output once',async()=>{
 const old=db.getConnection;let status='submitted',balance='10',locked='1.01',credits=0,commits=0;
 db.getConnection=async()=>({beginTransaction:async()=>{},rollback:async()=>{},commit:async()=>{commits++;},release(){},execute:async(sql,args)=>{
  if(sql.startsWith('SELECT status'))return [[{status}]];
  if(sql.startsWith('UPDATE wallets')){assert.deepEqual(args,['1.002000000','1.010000000',3,'1.002000000','1.010000000']);balance='8.998';locked='0';return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO solana_holdings')){assert.deepEqual(args,[3,'mint',6,'1234567890123456789']);credits++;return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE solana_swaps')){status=args[0];return [{affectedRows:1}];}
  throw new Error('Unexpected SQL');
 }});
 try{
  const job={id:'swap',user_id:3,mint:'mint',decimals:6,reserve_atomic:'1010000000'};
  await settleSwap(job,1002000000n,1234567890123456789n,'completed');
  await settleSwap(job,1002000000n,1234567890123456789n,'completed');
  assert.equal(status,'completed');assert.equal(balance,'8.998');assert.equal(locked,'0');assert.equal(credits,1);assert.equal(commits,2);
 }finally{db.getConnection=old;await db.end();}
});
