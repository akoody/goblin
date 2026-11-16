import test from 'node:test';
import assert from 'node:assert/strict';
import {payoutAmount,payoutAvailability,payoutPolicy} from '../src/services/treasury-payout-policy.js';
test('Treasury payout never treats ledger totals, donations or client liability as collected funds',()=>{
 assert.equal(payoutAvailability({collected:'100',spent:'30',reserved:'20',chain:'1000',book:'500'}),'50');
 assert.equal(payoutAvailability({collected:'0',spent:'0',reserved:'0',chain:'1000',book:'500'}),'0');
 assert.equal(payoutAvailability({collected:'100',spent:'0',reserved:'0',chain:'12',book:'10'}),'10');
 assert.throws(()=>payoutAvailability({collected:'1',spent:'1',reserved:'1',chain:'10',book:'10'}));
});
test('Payout limits preserve atomic precision and auto mode requires an address',()=>{
 assert.equal(payoutAmount('0.000000000000000001','ETH'),'0.000000000000000001');
 assert.throws(()=>payoutAmount('0.000000001','BTC'));
 const input={mode:'manual',threshold:'100',maximumAmount:'1000',maximumFee:'100',gasReserve:'10',cooldownSeconds:3600,destination:''};
 assert.equal(payoutPolicy(input,'USDT').mode,'manual');
 assert.throws(()=>payoutPolicy({...input,mode:'threshold'},'USDT'));
 assert.throws(()=>payoutPolicy({...input,maximumAmount:'10'},'USDT'));
});
