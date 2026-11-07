import test from 'node:test';
import assert from 'node:assert/strict';
import { createSafioClient, validateSafioResult } from '../src/services/safio-client.js';
const deposit = { id: 42, from_address: 'Tsender', currency: 'USDT' };
const check = { status: 'completed', result: { product: 'screen', subject: {
  type: 'address', value: 'Tsender', network: 'tron', asset: 'USDT',
}, risk_level: 'low', risk_score: 4, coverage_status: 'complete', decision: 'allow' } };
test('Safio rejects business errors inside HTTP 200 without leaking provider messages', async () => {
  const client = createSafioClient('test-key', async () => ({ok:true,json:async()=>({error:{message:'sensitive'},data:null})}));
  await assert.rejects(client.capabilities(), /SAFIO_PROVIDER_ERROR/);
});
test('Screen requests keep stable billing idempotency and disable upgrades', async () => {
  const requests=[];
  const client=createSafioClient('test-key',async(url,options)=>{requests.push({url,...options});return {ok:true,json:async()=>({data:{check_id:'id'},error:null})};});
  await client.create(deposit); await client.create(deposit);
  assert.equal(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key']);
  assert.equal(JSON.parse(requests[0].body).allow_product_upgrade,false);
  assert.equal(requests[0].redirect,'error');
});
test('Incomplete, unknown or mismatched results never become low-risk evidence',()=>{
  assert.equal(validateSafioResult(check,deposit).riskLevel,'LOW');
  assert.equal(validateSafioResult({...check,result:{...check.result,coverage_status:'partial'}},deposit).riskLevel,'UNKNOWN');
  assert.equal(validateSafioResult({...check,result:{...check.result,decision:'unknown'}},deposit).riskLevel,'UNKNOWN');
  assert.throws(()=>validateSafioResult(check,{...deposit,from_address:'Tother'}),/MISMATCH/);
  assert.equal(validateSafioResult({...check,status:'running'},deposit),null);
});
