import {useEffect,useRef,useState} from 'react';
import api from '../../api';
import styles from './Admin.module.scss';

const message=error=>error.response?.data?.message||'Не удалось выполнить запрос';
export function PushBroadcast(){
 const requestKey=useRef(crypto.randomUUID());
 function change(next){requestKey.current=crypto.randomUUID();setForm(next);}
 const [audience,setAudience]=useState(null),[form,setForm]=useState({title:'Гоблин',body:'',path:'/news'}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[job,setJob]=useState(null);
 async function refresh(){try{setAudience((await api.get('/api/push/broadcasts/audience')).data);setError('');}catch(error){setError(message(error));}}
 useEffect(()=>{void refresh();},[]);
 useEffect(()=>{
  if(job?.status!=='sending')return;
  let alive=true;
  const timer=setInterval(()=>api.get(`/api/push/broadcasts/${job.id}`).then(({data})=>{if(alive)setJob(data);}).catch(error=>{if(alive){setError(message(error));setJob(null);}}),5000);
  return()=>{alive=false;clearInterval(timer);};
 },[job?.id,job?.status]);
 async function send(event){
  event.preventDefault();
  if(!audience?.devices||!window.confirm(`Отправить push-уведомление ${audience.users} пользователям (${audience.devices} устройств)?\n\n${form.title}\n${form.body}\n\nПосле отправки отозвать уведомление нельзя.`))return;
  setBusy(true);setError('');
  try{const {data}=await api.post('/api/push/broadcasts',{...form,expectedDevices:audience.devices,requestKey:requestKey.current});setJob(data);}
  catch(error){setError(message(error));}finally{setBusy(false);}
 }
 return <section className={styles.loginSecurity}><h2>Push-рассылка</h2><p>Только пользователям приложения, включившим уведомления. Текст не сохраняется в истории. Не указывайте персональные данные. Отправка не гарантирует доставку на выключенный телефон.</p>{error&&<p role="alert">{error}</p>}<p>{audience?`Получателей: ${audience.users}, устройств: ${audience.devices}`:'Загрузка получателей…'}</p><button type="button" onClick={refresh}>Обновить получателей</button><form className={styles.depositSettings} onSubmit={send}><label>Заголовок уведомления<input required maxLength={80} value={form.title} onChange={event=>change({...form,title:event.target.value})}/></label><label>Текст уведомления<textarea required rows={5} maxLength={500} value={form.body} onChange={event=>change({...form,body:event.target.value})}/></label><label>Открыть по нажатию<select value={form.path} onChange={event=>change({...form,path:event.target.value})}>{[['/news','Новости'],['/about','О проекте'],['/me','Кошелёк'],['/swap','Swap'],['/p2p/my-deals','Мои сделки']].map(([path,label])=><option key={path} value={path}>{label}</option>)}</select></label><button disabled={busy||job?.status==='sending'||!audience?.enabled||!audience?.devices}>Отправить рассылку</button></form>{job&&<p role="status">{job.status==='sending'?'Отправка':'Отправка завершена'}. Устройств: {job.total}. Принято FCM: {job.accepted}. Ошибок: {job.failed}. Пропущено: {job.skipped}. Это не подтверждение прочтения.</p>}</section>;
}
