import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import { depositSettlement, validateManualReview } from '../src/services/deposit-policy.js';
test('USDT minimum and configurable per-deposit fee settle exactly',()=>{
  assert.deepEqual(depositSettlement({amount:'5',currency:'USDT',feeUsd:'2',quote:'1'}),{gross:'5.000000',fee:'2.000000',net:'3.000000'});
  assert.equal(depositSettlement({amount:'5',currency:'USDT',feeUsd:'1.25',quote:'1'}).net,'3.750000');
  assert.throws(()=>depositSettlement({amount:'4.999999',currency:'USDT',feeUsd:'2',quote:'1'}),e=>e.code==='DEPOSIT_BELOW_MINIMUM');
  assert.throws(()=>depositSettlement({amount:'5',currency:'USDT',feeUsd:'5',quote:'1'}),e=>e.code==='DEPOSIT_BELOW_FEE');
});
test('Other crypto fees use a quote and conservative native precision, not floating point',()=>{
  for(const [currency,amount,quote] of [['BTC','0.00012345','85000'],['ETH','0.003','3300'],['TRX','50','0.26']]){
    const s=depositSettlement({amount,currency,feeUsd:'2',quote});assert(new Decimal(s.net).plus(s.fee).eq(amount));assert(new Decimal(s.fee).times(quote).gte(2));
  }
  assert.throws(()=>depositSettlement({amount:'10',currency:'TRX',feeUsd:'2',quote:'0.26'}),e=>e.code==='DEPOSIT_BELOW_MINIMUM');
  assert.throws(()=>depositSettlement({amount:'10',currency:'USDT',feeUsd:'-2',quote:'1'}));
  assert.throws(()=>depositSettlement({amount:'10',currency:'USDT',feeUsd:'2',quote:'0'}));
});
test('Manual release requires a report and cannot approve high or unknown risk',()=>{
  const approved={action:'APPROVE',provider:'AMLBot',reference:'https://example.invalid/report/qa',riskLevel:'LOW',note:'Report checked for this transaction'};
  assert.equal(validateManualReview(approved),approved);
  for(const change of [{reference:''},{riskLevel:'HIGH'},{riskLevel:''},{note:'ok'}])assert.throws(()=>validateManualReview({...approved,...change}),e=>e.status===400);
  assert.doesNotThrow(()=>validateManualReview({action:'BLOCK',note:'Suspected illicit source, release prohibited'}));
});
