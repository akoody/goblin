import {useEffect,useState} from 'react';
import {useNavigate,useLocation} from 'react-router-dom';
import api from '../../api';
import {bindPushToken} from '../../push';
import {pushDestination} from '../../utils/pushNavigation.mjs';

export function IosPush(){
 const location=useLocation(),navigate=useNavigate(),[state,setState]=useState(''),[busy,setBusy]=useState(false);
 const token=localStorage.getItem('token');
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const standalone=navigator.standalone||window.matchMedia('(display-mode: standalone)').matches;
 async function enable(ask){
  setBusy(true);
  try{
   if(ask&&await Notification.requestPermission()!=='granted'){setState('Разрешите уведомления в настройках iPhone.');return;}
   const registration=await navigator.serviceWorker.register('/push-sw.js',{scope:'/'});
   await navigator.serviceWorker.ready;
   const {data}=await api.get('/api/push/web-config');
   const bytes=Uint8Array.from(atob(data.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
   const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
   if(token!==localStorage.getItem('token')){await subscription.unsubscribe();return;}
   const value='webpush:'+btoa(JSON.stringify(subscription.toJSON())).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
   await bindPushToken(token,value);setState('Уведомления подключены');
  }catch{setState('Не удалось подключить уведомления. Попробуйте ещё раз.');}finally{setBusy(false);}
 }
 useEffect(()=>{
  if(ios&&standalone&&token&&'Notification'in window&&Notification.permission==='granted')void enable(false);
 },[token]);
 useEffect(()=>{
  const params=new URLSearchParams(location.search);if(!token||!params.has('pushRecipient'))return;
  let alive=true;
  api.get('/api/auth/me').then(({data})=>{const path=pushDestination({recipientId:params.get('pushRecipient'),path:params.get('pushPath')},data.id);if(alive)navigate(path||'/',{replace:true});}).catch(()=>setState('Войдите в аккаунт получателя уведомления.'));
  return()=>{alive=false;};
 },[token,location.search,navigate]);
 if(!ios||!token)return null;
 if(!standalone)return <aside style={{padding:'12px 20px'}}>Для уведомлений на iPhone: Safari → Поделиться → На экран Домой. Затем откройте сайт с новой иконки.</aside>;
 if(!('PushManager'in window)||!('Notification'in window))return <aside>Для уведомлений требуется iOS 16.4 или новее.</aside>;
 return <aside style={{padding:'12px 20px'}}><button type="button" disabled={busy} onClick={()=>enable(true)}>Включить уведомления на iPhone</button>{state&&<p role="status">{state}</p>}</aside>;
}
