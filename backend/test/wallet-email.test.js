import test from 'node:test';
import assert from 'node:assert/strict';
import {sendWalletEmail} from '../src/services/wallet-email.service.js';

test('wallet emails use the account address and a stable operation key without sending other events',async()=>{
 const calls=[];
 const options={
  env:{RESEND_API_KEY:'mock',EMAIL_FROM:'sender@example.invalid',PUSH_ENABLED:'false'},
  database:{execute:async(_sql,args)=>{assert.deepEqual(args,['7']);return [[{email:'recipient@example.invalid'}]];}},
  request:async(url,request)=>{calls.push({url,request});return {ok:true};},
 };
 await sendWalletEmail('deposit_credited',[7,'7'],'deposit:1',options);
 await sendWalletEmail('deposit_credited',[7],'deposit:1',options);
 await sendWalletEmail('withdrawal_failed',[7],'withdrawal:1',options);
 await sendWalletEmail('referral_credited',[7],'referral:1',options);
 assert.equal(calls.length,3);
 assert.equal(calls[0].request.headers['Idempotency-Key'],calls[1].request.headers['Idempotency-Key']);
 assert.notEqual(calls[0].request.headers['Idempotency-Key'],calls[2].request.headers['Idempotency-Key']);
 assert.deepEqual(JSON.parse(calls[0].request.body).to,['recipient@example.invalid']);
});
