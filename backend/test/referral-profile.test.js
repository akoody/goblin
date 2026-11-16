import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {db} from '../src/config/db.js';
import router from '../src/routes/referral.routes.js';

test('Referral profile uses the effective configured rate and never sums different assets as USDT',async()=>{
 const original=db.execute;
 db.execute=async(sql,args)=>{
  assert(args.includes(1));
  if(sql.includes('SELECT id, referral_code'))return [[{id:1,referral_code:'QA1',referred_by:null}]];
  if(sql.includes('WHERE referred_by'))return [[{id:2,username:'invited',email:'qa@example.invalid',created_at:new Date()}]];
  if(sql.includes('FROM referral_rewards'))return [[{currency:'BTC',total:'0.123456789123456789',count:1},{currency:'USDT',total:'2.000000000000000000',count:2}]];
  if(sql.includes('FROM referral_commission_policy'))return [[{default_percent:'50.00',custom_percent:'0.00',effective_percent:'0.00'}]];
  throw Error(sql);
 };
 const app=express();app.use((req,res,next)=>{req.user={userId:1};next();});app.use('/referrals',router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
  const r=await fetch(`http://127.0.0.1:${server.address().port}/referrals/me`);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
  const data=await r.json();assert.equal(data.ratePercent,'0.00');assert.equal(data.defaultRatePercent,'50.00');assert.equal(data.rewardTotal,2);assert.equal(data.rewardCount,3);assert.equal(data.rewardBalances[0].amount,'0.123456789123456789');assert.equal(data.accrualEnabled,true);
 }finally{await new Promise(resolve=>server.close(resolve));db.execute=original;await db.end();}
});
