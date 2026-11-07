import test from 'node:test';
import assert from 'node:assert/strict';
import {consumeFeeBonus,bonusDiscount,discountedFeePercent} from '../src/services/fee-bonus.service.js';
import {applyP2pCommission} from '../src/services/p2p-fee.service.js';
test('A coupon is consumed once for its beneficiary and deal kind using a row lock',async()=>{
 let used=false;
 const connection={execute:async(sql,args)=>{
  if(sql.startsWith('SELECT')){assert(sql.includes('FOR UPDATE'));assert.deepEqual(args,[42,'ESCROW']);return [used?[]:[{id:7}]];}
  assert.deepEqual(args,['deal-1',7]);used=true;return [{affectedRows:1}];
 }};
 assert.equal(await consumeFeeBonus(connection,42,'ESCROW','deal-1'),100);
 assert.equal(await consumeFeeBonus(connection,42,'ESCROW','deal-2'),false);
 await assert.rejects(()=>consumeFeeBonus(connection,42,'invalid','deal-2'));
});
test('P2P credits reduced fee to treasury and consumes only one coupon',async()=>{
 let treasury,consumed=0;
 const c={execute:async(sql,args)=>{
  if(sql.startsWith('SELECT'))return [[{id:7,discount_percent:'50.00'}]];
  if(sql.startsWith('UPDATE fee_bonuses')){consumed++;return [{affectedRows:1}];}
  if(sql.includes('INSERT INTO admin_treasury'))treasury=args[0];
  return [{affectedRows:1}];
 }};
 const result=await applyP2pCommission(c,{dealId:1,sellerId:2,beneficiaryId:2,grossAmount:'100',feePercent:'5'});
 assert.equal(result.feeAmount,'2.500000');assert.equal(result.netAmount,'97.5');assert.equal(treasury,'2.500000');assert.equal(consumed,1);
});
test('Percentage bonus reduces fee, not trade amount, with exact decimal math',async()=>{
 assert.equal(discountedFeePercent('5','50'),'2.500000');assert.equal(discountedFeePercent('5','100'),'0.000000');assert.equal(discountedFeePercent('5','0.01'),'4.999500');
 for(const value of ['0','-1','100.01','NaN','1.001'])assert.throws(()=>bonusDiscount(value));
 assert.equal(bonusDiscount('37.5'),'37.50');
 const c={execute:async sql=>sql.startsWith('SELECT')?[[{id:1,discount_percent:'37.50'}]]:[{affectedRows:1}]};assert.equal(await consumeFeeBonus(c,1,'P2P','test'),37.5);
});
