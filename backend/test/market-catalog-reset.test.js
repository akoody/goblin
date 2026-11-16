import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyCatalogPayload} from '../src/services/market-catalog-reset.service.js';
import {populatedMarketFixture} from './fixtures/market-store.js';

test('Catalog reset clears categories only, preserves account data, and does not mutate its snapshot',()=>{
  const original=populatedMarketFixture();
  original.walletTransactions=[{id:'history',amountRub:10}];
  const snapshot=structuredClone(original),next=emptyCatalogPayload(original);
  assert.equal(next.catalogItems.length,0);
  assert.deepEqual({...next,catalogItems:snapshot.catalogItems},snapshot);
  assert.deepEqual(original,snapshot);
});
test('Reset refuses any linked listings, orders, chats, messages or projects before removing categories',()=>{
  const payload=populatedMarketFixture();
  for(const field of ['listings','orders','conversations','messages','projectTasks'])
    assert.throws(()=>emptyCatalogPayload({...payload,[field]:[{id:'keep-this-record'}]}),{status:409,message:'CATALOG_HAS_LINKED_RECORDS'});
  assert.throws(()=>emptyCatalogPayload({catalogItems:[]}));
});
