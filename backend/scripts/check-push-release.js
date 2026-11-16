import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db} from '../src/config/db.js';
import {signAccessToken} from '../src/config/jwt.js';
import {tokenHash} from '../src/services/push-crypto.js';
import {configuredFcmClient} from '../src/services/fcm-client.js';

const base=process.env.RELEASE_CHECK_URL||'https://cryptogoblin.ru',deviceId=randomUUID();
const deviceToken=`qa-no-real-device-${randomUUID()}`;
try{
 const [[user]]=await db.execute("SELECT id,token_version FROM users WHERE status='active' ORDER BY id LIMIT 1");
 assert(user);
 const token=signAccessToken({userId:user.id,tokenVersion:Number(user.token_version||0)});
 const request=(path,body,authorized=true)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 assert.equal((await request('/api/push/devices',{deviceId,token:deviceToken},false)).status,401);
 assert.equal((await request('/api/push/devices',{deviceId:'invalid',token:deviceToken})).status,400);
 assert.equal((await request('/api/push/devices',{deviceId,token:deviceToken})).status,200);
 const [[row]]=await db.execute('SELECT user_id,token_cipher FROM push_devices WHERE device_id=?',[deviceId]);
 assert.equal(Number(row.user_id),Number(user.id));assert(!row.token_cipher.includes(deviceToken));
 assert.equal((await request('/api/push/devices/remove',{deviceId})).status,200);
 const [remaining]=await db.execute('SELECT device_id FROM push_devices WHERE device_id=?',[deviceId]);assert.equal(remaining.length,0);
 const configured=configuredFcmClient();assert(configured,'Push sender must be enabled');
 const result=await (await configured).send({token:deviceToken,recipientId:user.id,path:'/deal/1'},true);
 assert.equal(result.code,'INVALID_ARGUMENT','Expected invalid fake-device token, not failed authentication or permissions');
 console.log(JSON.stringify({deviceRegistration:true,encryptedAtRest:true,logoutRevocation:true,unauthorizedDenied:true,liveFcmAuthentication:true,dryRunOnly:true,realNotificationsSent:0}));
}finally{
 await db.execute('DELETE FROM push_devices WHERE device_id=? AND token_hash=?',[deviceId,tokenHash(deviceToken)]);
 await db.end();
}
