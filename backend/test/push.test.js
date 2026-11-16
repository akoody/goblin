import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {encryptPushToken,decryptPushToken,validPushDevice} from '../src/services/push-crypto.js';
import {createFcmClient} from '../src/services/fcm-client.js';
import {pushDestination} from '../../src/utils/pushNavigation.mjs';

test('Push tokens are authenticated encrypted, not stored as plaintext',()=>{
 const token='fcm-confidential-test-token',cipher=encryptPushToken(token,'secret');
 assert(!cipher.includes(token));
 assert.equal(decryptPushToken(cipher,'secret'),token);
 assert.throws(()=>decryptPushToken(cipher,'different-secret'));
 assert.notEqual(cipher,encryptPushToken(token,'secret'));
 assert(validPushDevice('6ba7b810-9dad-4d80-80b4-00c04fd430c8',token));
 assert(!validPushDevice('../arbitrary-id',token));
 assert(!validPushDevice('6ba7b810-9dad-4d80-80b4-00c04fd430c8','bad token'));
});
test('Notification links require matching recipient and an internal allowlisted deal route',()=>{
 assert.equal(pushDestination({recipientId:'1',path:'/deal/123'},1),'/deal/123');
 assert.equal(pushDestination({recipientId:'2',path:'/deal/123'},1),null);
 for(const path of ['https://evil.test','//evil.test','/admin','/deal/1?redirect=evil','javascript:alert(1)'])assert.equal(pushDestination({recipientId:'1',path},1),null);
 assert.equal(pushDestination({recipientId:'1',path:'/commerce/deals/6ba7b810-9dad-4d80-80b4-00c04fd430c8'},1),'/commerce/deals/6ba7b810-9dad-4d80-80b4-00c04fd430c8');
});
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const credentials={project_id:'qa-project',client_email:'qa@qa-project.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})};
test('FCM uses scoped OAuth, generic notifications, short TTL and no automatic resend',async()=>{
 const calls=[];
 const request=async(url,options)=>{
  calls.push({url,options});
  if(url.includes('oauth2')){
   const jwt=options.body.get('assertion'),[header,payload,signature]=jwt.split('.');
   assert(verify('RSA-SHA256',Buffer.from(`${header}.${payload}`),publicKey,Buffer.from(signature,'base64url')));
   const claims=JSON.parse(Buffer.from(payload,'base64url'));
   assert.equal(claims.scope,'https://www.googleapis.com/auth/firebase.messaging');
   return {ok:true,json:async()=>({access_token:'qa-access',expires_in:3600})};
  }
  return {ok:true,status:200,json:async()=>({name:'qa-response'})};
 };
 const client=createFcmClient({credentials,request});
 const data={token:'fcm-test-token',recipientId:1,path:'/deal/123'};
 assert((await client.send(data,true)).ok);
 await client.send(data);
 assert.equal(calls.length,3,'OAuth access token is cached');
 const body=JSON.parse(calls[1].options.body);
 assert.equal(body.validate_only,true);
 assert.equal(body.message.android.ttl,'300s');
 assert.equal(body.message.android.restricted_package_name,'ru.cryptogoblin.app');
 assert.equal(body.message.data.path,'/deal/123');
 assert(!JSON.stringify(body).includes('balance'));
});
test('Only explicit UNREGISTERED removes a token, provider failures do not',async()=>{
 let code='UNREGISTERED';
 const client=createFcmClient({credentials,request:async(url)=>url.includes('oauth2')?{ok:true,json:async()=>({access_token:'qa',expires_in:3600})}:{ok:false,status:400,json:async()=>({error:{status:'INVALID_ARGUMENT',details:[{'@type':'type.googleapis.com/google.firebase.fcm.v1.FcmError',errorCode:code}]}})}});
 assert((await client.send({token:'qa',path:'/deal/1',recipientId:1})).invalidToken);
 code='INVALID_ARGUMENT';
 assert(!(await client.send({token:'qa',path:'/deal/1',recipientId:1})).invalidToken);
});
