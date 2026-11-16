import {Capacitor} from '@capacitor/core';
import {PushNotifications} from '@capacitor/push-notifications';
import api from './api';

export const nativePushAvailable=()=>Capacitor.getPlatform()==='android'&&Capacitor.isPluginAvailable('PushNotifications');
let operation=Promise.resolve();
function serialize(work){const next=operation.then(work,work);operation=next.catch(()=>{});return next;}
export function bindPushToken(session,token){
 return serialize(async()=>{
  if(session!==localStorage.getItem('token'))return;
  await api.post('/api/push/devices',{deviceId:pushDeviceId(),token});
 });
}
export function pushDeviceId(){
 let id=localStorage.getItem('push-device-id');
 if(!id){id=crypto.randomUUID();localStorage.setItem('push-device-id',id);}
 return id;
}
export async function detachPush(){
 if(!nativePushAvailable()){
  if(!('serviceWorker'in navigator))return;
  return serialize(async()=>{
   const registration=await navigator.serviceWorker.getRegistration('/push-sw.js');
   const subscription=await registration?.pushManager?.getSubscription();
   if(!subscription)return;
   await api.post('/api/push/devices/remove',{deviceId:pushDeviceId()});
   if(!await subscription.unsubscribe())throw new Error('Не удалось отключить уведомления');
   for(const notification of await registration.getNotifications())notification.close();
  });
 }
 return serialize(detachDevice);
}
async function detachDevice(){
 let serverRemoved=false,nativeRemoved=false;
 try{await api.post('/api/push/devices/remove',{deviceId:pushDeviceId()});serverRemoved=true;}catch{/* Native token invalidation remains a second revocation path. */}
 try{await PushNotifications.unregister();nativeRemoved=true;await PushNotifications.removeAllDeliveredNotifications();}catch{/* Server revocation is sufficient if the native bridge is unavailable. */}
 if(!serverRemoved&&!nativeRemoved)throw new Error('Не удалось отключить уведомления. Проверьте соединение и повторите выход.');
}
