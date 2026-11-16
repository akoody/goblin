import test from 'node:test';
import assert from 'node:assert/strict';
import {webSubscription} from '../src/services/web-push.service.js';
import {validPushDevice} from '../src/services/push-crypto.js';
test('iOS push accepts only encrypted Apple subscriptions, rejects SSRF and malformed keys',()=>{
 const make=endpoint=>'webpush:'+Buffer.from(JSON.stringify({endpoint,keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}})).toString('base64url');
 const token=make('https://web.push.apple.com/qa-endpoint');
 assert(webSubscription(token));assert(validPushDevice('6ba7b810-9dad-4d80-80b4-00c04fd430c8',token));
 for(const endpoint of ['http://web.push.apple.com/qa','https://127.0.0.1/a','https://web.push.apple.com.evil.test/a','https://web.push.apple.com:8080/a','https://user@web.push.apple.com/a'])assert.equal(webSubscription(make(endpoint)),null);
 assert.equal(webSubscription('webpush:invalid'),null);
});
