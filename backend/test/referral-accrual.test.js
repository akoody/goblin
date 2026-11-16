import test from 'node:test';
import assert from 'node:assert/strict';
import {referralReward,referralCustodyBalances} from '../src/services/referral-accrual.service.js';
import {validateNativePlan} from '../src/services/native-chain-policy.js';

test('Referral rewards use actual commission, exact precision and round down',()=>{
  assert.equal(referralReward('2','50','USDT'),'1.000000');
  assert.equal(referralReward('2.5','50','USDT'),'1.250000');
  assert.equal(referralReward('0.00000001','50','BTC'),'0.00000000');
  assert.equal(referralReward('0.00000003','50','BTC'),'0.00000001');
  assert.equal(referralReward('0.000000001','100','SOL'),'0.000000001');
  assert.equal(referralReward('123456789012345678.123456789123456789','50','ETH'),'61728394506172839.061728394561728394');
  assert.equal(referralReward('1','0','USDT'),'0.000000');
  for(const [fee,rate,coin] of [['NaN','50','SOL'],['-1','50','USDT'],['1','101','BTC'],['1','50','RUB']])
    assert.throws(()=>referralReward(fee,rate,coin));
});

test('Consolidation leaves referral backing at the source, without inventing recipient chain funds',()=>{
  assert.deepEqual(referralCustodyBalances('8','2',{outgoing:'1',incoming:'0'}),{local:'8',liability:'9',earned:'1'});
  assert.deepEqual(referralCustodyBalances('11','0',{outgoing:'0',incoming:'1'}),{local:'10',liability:'10',earned:'0'});
  // After collecting only the exchange-owned 1 USDT, the other 1 remains reserved.
  assert.deepEqual(referralCustodyBalances('8','1',{outgoing:'1',incoming:'0'}),{local:'8',liability:'9',earned:'0'});
  assert.throws(()=>referralCustodyBalances('0','0',{outgoing:'0',incoming:'1'}),{code:'PROVENANCE_REVIEW'});
  assert.throws(()=>referralCustodyBalances('8','0.5',{outgoing:'1',incoming:'0'}),{code:'PROVENANCE_REVIEW'});
});

test('Native signing preserves referral liabilities in the change instead of collecting them',()=>{
  const source={address:'source',balance:'8',bookBalance:'8',liability:'9',earned:'1000000000000000000',gross:'1000000000000000000',chain:{balance:'10000000000000000000',nonce:0}};
  const plan={kind:'collection',currency:'ETH',sources:[source],gross:source.gross,cost:{fee:'21000',gasPrice:'1'},outputs:[{address:'treasury',value:'999999999999979000'}]};
  assert.equal(validateNativePlan(plan),true);
  assert.throws(()=>validateNativePlan({...plan,sources:[{...source,liability:'8'}]}),{code:'CUSTODY_MISMATCH'});
});
