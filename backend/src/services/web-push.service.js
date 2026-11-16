import * as webpush from 'web-push';
import {readFileSync} from 'node:fs';
export function vapid(){
 const file=process.env.WEB_PUSH_KEY_FILE||'/root/.config/goblin-push/vapid.json';
 try{return JSON.parse(readFileSync(file,'utf8'));}catch{return null;}
}
export function webSubscription(token){
 if(typeof token!=='string'||!token.startsWith('webpush:'))return null;
 try{
  const value=JSON.parse(Buffer.from(token.slice(8),'base64url').toString());
  const url=new URL(value.endpoint);
  if(url.protocol!=='https:'||url.port||url.username||url.password||!url.hostname.endsWith('.push.apple.com')||!/^\/[A-Za-z0-9/_=-]+$/.test(url.pathname)||url.search||url.hash)return null;
  if(!/^[A-Za-z0-9_-]{87}$/.test(value.keys?.p256dh)||!/^[A-Za-z0-9_-]{22}$/.test(value.keys?.auth))return null;
  return {endpoint:url.href,keys:value.keys};
 }catch{return null;}
}
export async function sendWebPush({token,recipientId,path,content,key}){
 const subscription=webSubscription(token),keys=vapid();
 if(!subscription||!keys)return {ok:false,code:'WEB_PUSH_UNAVAILABLE'};
 try{
  await webpush.sendNotification(subscription,JSON.stringify({...content,recipientId:String(recipientId),path,key}),{vapidDetails:{subject:'https://cryptogoblin.ru',publicKey:keys.publicKey,privateKey:keys.privateKey},TTL:300,timeout:8000});
  return {ok:true};
 }catch(error){return {ok:false,invalidToken:[404,410].includes(error.statusCode),code:'WEB_PUSH_REJECTED'};}
}
