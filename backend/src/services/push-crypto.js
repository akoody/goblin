import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {webSubscription} from './web-push.service.js';

export const tokenHash=value=>createHash('sha256').update(value).digest('hex');
const key=secret=>createHash('sha256').update(`goblin:push:v1:${secret}`).digest();
export function encryptPushToken(token,secret){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);
 const body=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64');
}
export function decryptPushToken(value,secret){
 const bytes=Buffer.from(value,'base64');
 if(bytes.length<29)throw new Error('Invalid push token ciphertext');
 const decipher=createDecipheriv('aes-256-gcm',key(secret),bytes.subarray(0,12));
 decipher.setAuthTag(bytes.subarray(12,28));
 return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');
}
export function validPushDevice(deviceId,token){
 return typeof deviceId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(deviceId)
  &&typeof token==='string'&&token.length<=4096&&(/^[A-Za-z0-9_:.-]{20,4096}$/.test(token)&&(!token.startsWith('webpush:')||Boolean(webSubscription(token))));
}
