import {useEffect,useRef} from 'react';
import {useNavigate,useLocation} from 'react-router-dom';
import {useSnackbar} from 'notistack';
import {PushNotifications} from '@capacitor/push-notifications';
import api from '../../api';
import {nativePushAvailable,bindPushToken,detachPush} from '../../push';
import {pushDestination} from '../../utils/pushNavigation.mjs';

export function PushNotificationsBridge(){
 const navigate=useNavigate(),{enqueueSnackbar,closeSnackbar}=useSnackbar();
 const navigation=useRef(navigate);
 navigation.current=navigate;
 useLocation();
 const session=localStorage.getItem('token');
 useEffect(()=>{
  if(!nativePushAvailable())return;
  let alive=true,permissionNotice=null,refreshing=false;
  const listeners=[];
  const current=()=>alive&&session===localStorage.getItem('token');
  const report=()=>{if(current())enqueueSnackbar('Не удалось подключить уведомления. Повторите при следующем открытии приложения.',{variant:'warning'});};
  async function open(data){
   if(!current()||!session)return;
   try{
    const {data:user}=await api.get('/api/auth/me');
    if(!current())return;
    const destination=pushDestination(data,user.id);
    if(destination)navigation.current(destination);
    else enqueueSnackbar('Войдите в аккаунт получателя уведомления.',{variant:'info'});
   }catch{report();}
  }
  async function bind({value}){
   if(!current()||!session)return;
   try{await bindPushToken(session,value);}catch{report();}
  }
  async function register(){
   if(!current()||refreshing||!session)return;
   refreshing=true;
   try{
    const permission=await PushNotifications.checkPermissions();
    if(!current())return;
    if(permission.receive==='granted')await PushNotifications.register();
    else if(permission.receive==='denied')await detachPush();
    else if(permissionNotice===null&&(permission.receive==='prompt'||permission.receive==='prompt-with-rationale')){
     permissionNotice=enqueueSnackbar('Включить уведомления об операциях и сообщениях?',{persist:true,preventDuplicate:true,action:key=><><button type="button" onClick={async()=>{closeSnackbar(key);try{const result=await PushNotifications.requestPermissions();if(current()&&result.receive==='granted')await PushNotifications.register();}catch{report();}}}>Включить</button><button type="button" onClick={()=>closeSnackbar(key)}>Позже</button></>});
    }
   }catch{report();}finally{refreshing=false;}
  }
  async function setup(){
   if(!session){await detachPush();return;}
   const events=[['registration',bind],['registrationError',report],['pushNotificationActionPerformed',event=>open(event.notification.data)],['pushNotificationReceived',event=>{
    if(!current())return;
    enqueueSnackbar(event.body||'Новое уведомление в Гоблине',{action:key=><button type="button" onClick={()=>{closeSnackbar(key);void open(event.data);}}>Открыть</button>});
   }]];
   for(const [name,callback] of events){
    const listener=await PushNotifications.addListener(name,callback);
    if(!alive){await listener.remove();return;}
    listeners.push(listener);
   }
   await PushNotifications.createChannel({id:'goblin_messages',name:'Уведомления Goblin',description:'Операции, сделки и сообщения',importance:4,visibility:0});
   await register();
  }
  void setup().catch(report);
  const refresh=()=>{if(document.visibilityState==='visible')void register();};
  document.addEventListener('visibilitychange',refresh);
  return()=>{alive=false;document.removeEventListener('visibilitychange',refresh);if(permissionNotice!==null)closeSnackbar(permissionNotice);listeners.forEach(listener=>void listener.remove());};
 },[session,enqueueSnackbar,closeSnackbar]);
 return null;
}
