import test from 'node:test';
import assert from 'node:assert/strict';
import {db} from '../src/config/db.js';
import {walletAssets} from '../src/services/wallet-assets.service.js';
import {assetDecimal,atomicDecimal} from '../../src/Pages/Profile/walletAmounts.mjs';
test('Wallet asset amounts retain atomic precision without floating point',()=>{
 assert.equal(assetDecimal('10.600000000000000000'),'10,6');
 assert.equal(assetDecimal('0.000000000000000001'),'0,000000000000000001');
 assert.equal(atomicDecimal('9007199254740993123456',6),'9\u00a0007\u00a0199\u00a0254\u00a0740\u00a0993,123456');
 assert.equal(atomicDecimal('1',9),'0,000000001');assert.equal(atomicDecimal('0',6),'0');
});
test('Asset inventory is user-scoped and includes SOL, future currencies and mint-specific holdings',async()=>{
 const execute=db.execute;db.execute=async(sql,args)=>{
  if(sql.includes('FROM wallets')){assert.deepEqual(args,[42]);assert(!sql.includes('private_key'));return [[{currency:'USDT',total:'10.6',available:'8.6',locked:'2'},{currency:'NEW',total:'1',available:'1',locked:'0'}]];}
  assert.deepEqual(args,[42,42]);return [[{mint:'mint',name:'Test',symbol:'MEME',decimals:6,amount_atomic:'1234567',created_by_you:1}]];
 };
 try{const inventory=await walletAssets(42);assert.equal(inventory.coins.find(c=>c.symbol==='SOL').total,'0');assert.equal(inventory.coins.find(c=>c.symbol==='USDT').available,'8.6');assert.equal(inventory.coins.find(c=>c.symbol==='NEW').action,'readOnly');assert.equal(inventory.tokens[0].amountAtomic,'1234567');assert.equal(inventory.tokens[0].createdByYou,true);assert.equal(inventory.tokens[0].mint,'mint');}finally{db.execute=execute;await db.end();}
});
