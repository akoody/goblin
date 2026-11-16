import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {db} from '../src/config/db.js';
import {referralPercent,referralRateSelection,effectiveReferralRate,saveReferralDefault,saveReferralUserRates} from '../src/services/referral-commission-policy.service.js';
import adminRoutes from '../src/routes/admin.routes.js';

test('Referral rates are exact bounded percentages and selected targets are unique and limited',()=>{
  for(const [value,expected] of [[0,'0.00'],[50,'50.00'],['12,25','12.25'],['100','100.00']])assert.equal(referralPercent(value),expected);
  for(const v of ['',null,undefined,-1,'1e2','100.01','0.001',true,{},Infinity])assert.throws(()=>referralPercent(v),e=>e.status===400);
  assert.deepEqual(referralRateSelection({userIds:[3,1],ratePercent:null}),{ids:[1,3],rate:null});
  assert.deepEqual(referralRateSelection({userIds:[1],ratePercent:0}),{ids:[1],rate:'0.00'});
  for(const v of [{userIds:[],ratePercent:50},{userIds:[1,1],ratePercent:50},{userIds:[0],ratePercent:50},{userIds:Array.from({length:201},(_,i)=>i+1),ratePercent:50}])assert.throws(()=>referralRateSelection(v));
});

test('Global and individual edits are transactional, audited and never write wallets or rewards',async()=>{
  const old=db.getConnection;let rate='50.00',overrides=new Map([[1,'25.00']]),queries=[];let rollback=0;
  const execute=async(sql,args=[])=>{
    queries.push({sql,args});
    if(sql.startsWith('SELECT rate_percent FROM referral_commission_policy'))return [[{rate_percent:rate}]];
    if(sql.startsWith('UPDATE referral_commission_policy')){rate=args[0];return [{affectedRows:1}];}
    if(sql.startsWith('DELETE FROM referral_user_rates')){overrides.clear();return [{affectedRows:1}];}
    if(sql.startsWith('INSERT INTO referral_user_rates')){overrides.set(args[0],args[1]);return [{affectedRows:1}];}
    if(sql.startsWith('INSERT INTO referral_rate_audit'))return [{affectedRows:1}];
    throw Error(sql);
  };
  db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{rollback++;},release(){},execute,query:async(sql,args)=>{
    queries.push({sql,args});
    if(sql.startsWith('SELECT id,status'))return [args[0].map(id=>({id,status:id===9?'deleted':'active'}))];
    if(sql.startsWith('SELECT user_id,rate_percent'))return [[...overrides].map(([user_id,rate_percent])=>({user_id,rate_percent}))];
    if(sql.startsWith('DELETE FROM referral_user_rates WHERE')){for(const id of args[0])overrides.delete(id);return [{affectedRows:1}];}
    throw Error(sql);
  }});
  try{
    await saveReferralDefault(7,{ratePercent:'60',resetOverrides:false});assert.equal(rate,'60.00');assert.equal(overrides.get(1),'25.00');
    await saveReferralUserRates(7,{userIds:[1,2],ratePercent:'42.5'});assert.equal(overrides.get(2),'42.50');
    await saveReferralUserRates(7,{userIds:[1],ratePercent:null});assert.equal(overrides.has(1),false);
    await saveReferralDefault(7,{ratePercent:50,resetOverrides:true});assert.equal(overrides.size,0);
    await assert.rejects(()=>saveReferralUserRates(7,{userIds:[9],ratePercent:50}),e=>e.status===400);assert.equal(rollback,1);
    assert.equal(queries.filter(q=>q.sql.startsWith('INSERT INTO referral_rate_audit')).length,4);
    assert(queries.every(q=>!/(?:wallets|referral_rewards|admin_treasury)/i.test(q.sql)));
  }finally{db.getConnection=old;}
});

test('Effective rate inherits the default but preserves an explicit zero-percent override',async()=>{
  const old=db.execute;let custom=null;
  db.execute=async()=>[[{default_percent:'50.00',custom_percent:custom,effective_percent:custom??'50.00'}]];
  try{
    assert.equal((await effectiveReferralRate(1)).ratePercent,'50.00');
    custom='0.00';const rate=await effectiveReferralRate(1);assert.equal(rate.ratePercent,'0.00');assert.equal(rate.customRatePercent,'0.00');
  }finally{db.execute=old;}
});

test('A helper may inspect referral rates but cannot change global or selected-user settings',async()=>{
  const old=db.execute,env=process.env.ADMIN_EMAILS;process.env.ADMIN_EMAILS='owner@example.invalid';
  db.execute=async sql=>{
    if(sql.startsWith('SELECT id,email,status'))return [[{id:2,email:'helper@example.invalid',status:'active'}]];
    if(sql.includes('FROM staff_helpers'))return [[{permission:'referrals'}]];
    if(sql.startsWith('SELECT rate_percent,updated_at'))return [[{rate_percent:'50.00',updated_at:new Date()}]];
    throw Error(sql);
  };
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={userId:2};next();});app.use('/admin',adminRoutes);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base=`http://127.0.0.1:${server.address().port}/admin`;
  try{
    assert.equal((await fetch(base+'/referral-policy')).status,200);
    for(const p of ['/referral-policy','/referral-rates'])assert.equal((await fetch(base+p,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({ratePercent:99,resetOverrides:true,userIds:[1]})})).status,403);
  }finally{await new Promise(resolve=>server.close(resolve));db.execute=old;if(env===undefined)delete process.env.ADMIN_EMAILS;else process.env.ADMIN_EMAILS=env;await db.end();}
});
