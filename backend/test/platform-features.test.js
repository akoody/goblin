import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/config/db.js';
import { featureKeys, getPlatformFeatures, updatePlatformFeature, assertPlatformFeature, requirePlatformFeature } from '../src/services/platform-features.service.js';
test('Commerce availability defaults, persistence, cache and administrator recovery',async()=>{
  const query=db.query,execute=db.execute,state=new Map();
  db.query=async()=>[[...state].map(([feature_key,enabled])=>({feature_key,enabled}))];
  db.execute=async(sql,args)=>{state.set(args[0],args[1]);return [{}];};
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
  }finally{db.query=query;db.execute=execute;await db.end();}
});
