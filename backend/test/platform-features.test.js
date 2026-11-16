import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/config/db.js';
import { featureKeys, getPlatformFeatures, updatePlatformFeature, assertPlatformFeature, assertFuturesAvailable, requirePlatformFeature } from '../src/services/platform-features.service.js';
import {placeOrder} from '../src/services/exchange.service.js';
test('Commerce availability defaults, persistence, cache and administrator recovery',async()=>{
  const query=db.query,execute=db.execute,getConnection=db.getConnection,state=new Map();
  let busy=1;
  db.query=async()=>[[...state].map(([feature_key,enabled])=>({feature_key,enabled}))];
  db.execute=async(sql,args)=>{state.set(args[0],args[1]);return [{}];};
  db.getConnection=async()=>({
    beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},
    query:async(sql)=>sql.includes('AS busy')?[[{busy}]]:[[{acquired:1}]],
    execute:async(sql,args)=>{
      if(sql.includes('FOR SHARE')||sql.includes('FOR UPDATE'))return [[{enabled:state.get('futures')}]];
      return db.execute(sql,args);
    },
  });
  try {
    assert(featureKeys.includes('market')&&featureKeys.includes('guarantor'));
    assert.equal((await getPlatformFeatures()).market,true);
    await updatePlatformFeature('market',false);
    await assert.rejects(()=>assertPlatformFeature('market'),e=>e.status===503&&e.code==='FEATURE_MAINTENANCE');
    await assertPlatformFeature('market',true);
    let status,payload,passed=false;
    const res={status:n=>{status=n;return res;},json:v=>{payload=v;}};
    await requirePlatformFeature('market')({path:'/catalog'},res,()=>passed=true);
    assert.equal(passed,false);assert.equal(status,503);assert.equal(payload.code,'FEATURE_MAINTENANCE');
    await updatePlatformFeature('guarantor',false);assert.equal((await getPlatformFeatures()).guarantor,false);
    await updatePlatformFeature('market',true);assert.equal((await getPlatformFeatures()).market,true);
    await assert.rejects(()=>updatePlatformFeature('other',true));
    assert.equal((await getPlatformFeatures()).futures,true);
    await assert.rejects(()=>updatePlatformFeature('futures',false),{status:409});
    busy=0;
    assert.equal((await updatePlatformFeature('futures',false)).futures,false);
    await assert.rejects(()=>placeOrder(1,{market:'futures',symbol:'BTC-USDT',side:'BUY',type:'LIMIT',price:'100',quantity:'1'}),{code:'FUTURES_DISABLED'});
    assert.equal((await updatePlatformFeature('futures',true)).futures,true);
    await assertFuturesAvailable(await db.getConnection());
  }finally{db.query=query;db.execute=execute;db.getConnection=getConnection;await db.end();}
});
