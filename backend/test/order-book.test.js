import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateBook,priceSteps} from '../../src/Pages/Trade/orderBookMath.mjs';
test('Depth groups asks up, bids down and sums base and actual quote volumes exactly',()=>{
 const rows=[{price:'100.01',quantity:'0.1'},{price:'100.09',quantity:'0.2'},{price:'100.2',quantity:'0.3'}];
 assert.deepEqual(aggregateBook(rows,'asks','0.1'),[
  {price:'100.1',quantity:'0.3',total:'0.3',totalQuote:'30.019'},
  {price:'100.2',quantity:'0.3',total:'0.6',totalQuote:'60.079'},
 ]);
 assert.deepEqual(aggregateBook(rows,'bids','0.1'),[
  {price:'100.2',quantity:'0.3',total:'0.3',totalQuote:'30.06'},
  {price:'100',quantity:'0.3',total:'0.6',totalQuote:'60.079'},
 ]);
});
test('Depth handles tiny meme prices, duplicate levels, invalid rows and explicit display limits',()=>{
 const rows=[{price:'0.000000001',quantity:'0.1'},{price:'0.000000001',quantity:'0.2'},{price:'0.000000002',quantity:'1'},{price:'NaN',quantity:'2'},{price:'1',quantity:'-1'}];
 assert.deepEqual(aggregateBook(rows,'asks','0',1),[{price:'0.000000001',quantity:'0.3',total:'0.3',totalQuote:'0.0000000003'}]);
 assert(priceSteps('0.000001').includes('0.000000001'));
 assert(priceSteps('78000').includes('10'));
 assert.throws(()=>aggregateBook(rows,'asks','bad'));
});
