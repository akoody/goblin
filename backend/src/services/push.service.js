import {db} from '../config/db.js';
import {getJwtSecret} from '../config/jwt.js';
import {configuredFcmClient} from './fcm-client.js';
import {encryptPushToken,decryptPushToken,tokenHash,validPushDevice} from './push-crypto.js';
import {eventContent} from './push-events.js';
import {notifyWalletEmail} from './wallet-email.service.js';

const secret=()=>process.env.PUSH_TOKEN_SECRET||getJwtSecret();
export async function registerPushDevice(user,session,deviceId,token){
 if(!validPushDevice(deviceId,token))return false;
 const connection=await db.getConnection();
 try{
  await connection.beginTransaction();
  await connection.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[user.userId]);
  await connection.execute('DELETE FROM push_devices WHERE token_hash=? OR device_id=?',[tokenHash(token),deviceId]);
  await connection.execute(`INSERT INTO push_devices(device_id,user_id,token_version,token_hash,token_cipher,session_hash) VALUES(?,?,?,?,?,?)`,[deviceId,user.userId,Number(user.tokenVersion||0),tokenHash(token),encryptPushToken(token,secret()),tokenHash(session)]);
  await connection.execute('DELETE FROM push_devices WHERE updated_at < NOW() - INTERVAL 30 DAY');
  await connection.commit();
  return true;
 }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}
export async function unregisterPushDevice(userId,session,deviceId){
 await db.execute('DELETE FROM push_devices WHERE user_id=? AND session_hash=? AND device_id=?',[userId,tokenHash(session),String(deviceId||'')]);
}
let inflight=0;
const recent=new Map();
function enqueue(task,key){
 if(process.env.PUSH_ENABLED!=='true'||inflight>=32)return;
 const now=Date.now();
 for(const [id,until] of recent)if(until<now)recent.delete(id);
 if(key&&recent.has(key))return;
 if(key){if(recent.size>=2000)recent.delete(recent.keys().next().value);recent.set(key,now+300000);}
 inflight++;
 void Promise.resolve().then(task).catch(()=>console.error('Push delivery failed')).finally(()=>{inflight--;});
}
export function notifyUsers(type,userIds,{path='/me?section=transactions',key}={}){
 notifyWalletEmail(type,userIds,key);
 const content=eventContent(type);
 enqueue(()=>deliverUsers(userIds,{path,key,content}),`${type}:${key}`);
}
export function notifyDealEvent(kind,dealId,type){
 enqueue(()=>deliver(kind,dealId,null,type),`${kind}:${dealId}:${type}`);
}
export function notifyDealMessage(kind,dealId,senderId){
 // Best-effort delivery, bounded in memory. Message persistence must never wait on FCM.
 enqueue(()=>deliver(kind,dealId,senderId));
}
async function deliver(kind,dealId,senderId,type='message'){
 const table=kind==='p2p'?'deals':'commerce_deals';
 const [[deal]]=await db.execute(`SELECT buyer_id,seller_id FROM ${table} WHERE id=?`,[dealId]);
 if(!deal)return;
 const recipients=[...new Set([deal.buyer_id,deal.seller_id].filter(id=>id&&Number(id)!==Number(senderId)))];
 const path=kind==='p2p'?`/deal/${dealId}`:`/commerce/deals/${dealId}`;
 return deliverUsers(recipients,{path,key:`${kind}:${dealId}:${type}`,content:eventContent(type)});
}
async function deliverUsers(userIds,options){
 const configured=configuredFcmClient();if(!configured)return;
 const client=await configured;
 for(const userId of [...new Set(userIds.filter(Boolean))]){
  const [devices]=await db.execute(`SELECT d.device_id,d.token_hash,d.token_cipher FROM push_devices d JOIN users u ON u.id=d.user_id WHERE d.user_id=? AND u.status='active' AND COALESCE(u.token_version,0)=d.token_version AND d.updated_at>NOW()-INTERVAL 30 DAY ORDER BY d.updated_at DESC LIMIT 10`,[userId]);
  for(const device of devices){
   try{
    const result=await client.send({token:decryptPushToken(device.token_cipher,secret()),recipientId:userId,...options});
    if(result.invalidToken)await db.execute('DELETE FROM push_devices WHERE device_id=? AND token_hash=?',[device.device_id,device.token_hash]);
    else if(!result.ok)console.error('FCM delivery rejected',result.code);
   }catch{console.error('Push device delivery failed');}
  }
 }
}
