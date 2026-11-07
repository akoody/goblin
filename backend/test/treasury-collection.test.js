import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionPolicy} from '../src/services/treasury-collection.service.js';
test('Collection policy validates modes and exact network thresholds',()=>{
 assert.deepEqual(collectionPolicy({mode:'threshold',threshold:'0.000000001'}),{mode:'threshold',threshold:'0.000000001'});
 assert.deepEqual(collectionPolicy({mode:'manual',threshold:'100'}),{mode:'manual',threshold:'100.000000000'});
 for(const threshold of ['0','-1','NaN','Infinity','0.0000000001'])assert.throws(()=>collectionPolicy({mode:'manual',threshold}));
 assert.throws(()=>collectionPolicy({mode:'unknown',threshold:10}));
});
