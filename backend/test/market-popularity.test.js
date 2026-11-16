import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogVisitorHash,attachCatalogPopularity,recordCatalogVisit} from '../src/services/market-popularity.service.js';

test('Catalog visitor hashes use a private namespace, stable account identity, and no raw IP storage',()=>{
  const secret='qa-only-secret';
  const first=catalogVisitorHash({userId:1,ip:'192.0.2.1',userAgent:'A'},secret);
  assert.equal(first.length,32);
  assert.deepEqual(first,catalogVisitorHash({userId:1,ip:'192.0.2.2',userAgent:'B'},secret));
  assert.notDeepEqual(first,catalogVisitorHash({userId:2},secret));
  assert.notDeepEqual(catalogVisitorHash({ip:'192.0.2.1',userAgent:'A'},secret),catalogVisitorHash({ip:'192.0.2.2',userAgent:'A'},secret));
});
test('Public catalog popularity is attached per area only to returned categories',async()=>{
  const result=await attachCatalogPopularity({query:async(sql,args)=>{assert.deepEqual(args,[['one','two']]);return [[{slug:'one',area:'accounts',views:'3'},{slug:'one',area:'services',views:'7'}]];}},[{slug:'one'},{slug:'two'}]);
  assert.deepEqual(result,[{slug:'one',visitCounts:{accounts:3,services:7}},{slug:'two',visitCounts:{accounts:0,services:0}}]);
  for(const input of [{slug:'../invalid',area:'accounts'},{slug:'valid',area:'other'}])await assert.rejects(()=>recordCatalogVisit({...input,visitorHash:Buffer.alloc(32)}),{status:400});
});
