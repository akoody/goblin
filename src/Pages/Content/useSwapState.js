import {useCallback,useEffect,useState} from 'react';
import api from '../../api';
// Memory only, scoped to the current login. Re-entering a tab renders immediately;
// settlement amounts are always verified by the server, never by this cache.
const cache=new Map();
export function useSwapState(endpoint){
 const key=`${localStorage.getItem('token')||''}:${endpoint}`;
 const [state,setState]=useState(()=>cache.get(key)?.data??null);
 const [loadError,setLoadError]=useState('');
 const load=useCallback(async()=>{
  let entry=cache.get(key);if(!entry){entry={};cache.set(key,entry);}
  if(!entry.pending)entry.pending=api.get(endpoint).then(r=>{entry.data=r.data;entry.at=Date.now();return r.data;}).finally(()=>{entry.pending=null;});
  const data=await entry.pending;setState(data);setLoadError('');return data;
 },[endpoint,key]);
 useEffect(()=>{
  const refresh=()=>{if(document.visibilityState==='visible')load().catch(()=>setLoadError('Не удалось обновить данные. Проверьте соединение.'));};
  if(!cache.get(key)?.data||Date.now()-(cache.get(key)?.at||0)>5000)refresh();
  const timer=setInterval(refresh,15000);document.addEventListener('visibilitychange',refresh);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
 },[key,load]);
 return {state,load,loadError};
}
