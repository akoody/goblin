import test from 'node:test';
import assert from 'node:assert/strict';
import {db} from '../src/config/db.js';
import {assertAccountFeature} from '../src/middleware/account-feature.js';
test('Account feature revocation applies immediately and unsupported flags fail closed',async()=>{
 const original=db.execute;let enabled=1;
 db.execute=async()=>[[{enabled}]];
 try{for(const feature of ['nft','guarantor','trading']){enabled=1;await assertAccountFeature(1,feature);enabled=0;await assert.rejects(()=>assertAccountFeature(1,feature),e=>e.status===403);}await assert.rejects(()=>assertAccountFeature(1,'unknown'));}
 finally{db.execute=original;await db.end();}
});
