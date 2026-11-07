import test from 'node:test';
import assert from 'node:assert/strict';
import {detectNewsMedia} from '../src/services/news-media.service.js';
test('News media sniffs bytes and rejects executable HTML and SVG',()=>{
 assert.equal(detectNewsMedia(Buffer.from('89504e470d0a1a0a000000000000','hex')),'image/png');
 assert.equal(detectNewsMedia(Buffer.from('ID3abcdefghijk')),'audio/mpeg');
 assert.equal(detectNewsMedia(Buffer.from('000000186674797069736f6d00000000','hex')),'video/mp4');
 assert.equal(detectNewsMedia(Buffer.from('47494638396101000100800000000000','hex')),'image/gif');
 assert.equal(detectNewsMedia(Buffer.from('47494638376101000100800000000000','hex')),'image/gif');
 assert.equal(detectNewsMedia(Buffer.from('00000018667479704d34412000000000','hex')),'audio/mp4');
 assert.equal(detectNewsMedia(Buffer.from('OggSabcdefghijklmnop')),'audio/ogg');
 assert.throws(()=>detectNewsMedia(Buffer.from('4749463839610000000000000000','hex')));
 assert.throws(()=>detectNewsMedia(Buffer.from('<html>unsafe file</html>')));assert.throws(()=>detectNewsMedia(Buffer.from('<svg>unsafe file</svg>')));
});
