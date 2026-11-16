import {db} from '../config/db.js';
import {configuredFcmClient} from './fcm-client.js';
import {getJwtSecret} from '../config/jwt.js';
import {decryptPushToken} from './push-crypto.js';
import {validateBroadcast} from './push-events.js';

const eligible="u.status='active' AND COALESCE(u.token_version,0)=d.token_version AND d.updated_at>NOW()-INTERVAL 30 DAY";
const jobs=new Map();
let active=false;
export async function broadcastAudience(){
 const [[count]]=await db.execute(`SELECT COUNT(*) devices,COUNT(DISTINCT d.user_id) users FROM push_devices d JOIN users u ON u.id=d.user_id WHERE ${eligible}`);
 return {devices:Number(count.devices),users:Number(count.users),enabled:process.env.PUSH_ENABLED==='true'};
}
export function broadcastProgress(id){return jobs.get(id)?.progress||null;}
export async function startBroadcast(body){
 return beginBroadcast(validateBroadcast(body),{expectedDevices:body.expectedDevices});
}
async function beginBroadcast(content,{expectedDevices,claim}){
 const now=Date.now();
 for(const [id,job] of jobs)if(now-job.at>3600000&&job.progress.status!=='sending')jobs.delete(id);
 const existing=jobs.get(content.key);if(existing)return existing.progress;
 if(active)throw Object.assign(new Error('Дождитесь завершения текущей рассылки'),{status:409});
 const configured=configuredFcmClient();if(!configured)throw Object.assign(new Error('Push-отправка не подключена'),{status:503});
 // Reserve the single sender before async reads to serialize concurrent requests.
 active=true;
 try{
  const client=await configured;
  const [devices]=await db.execute(`SELECT d.device_id,d.user_id,d.token_hash,d.token_cipher FROM push_devices d JOIN users u ON u.id=d.user_id WHERE ${eligible} ORDER BY d.device_id LIMIT 10001`);
  if(devices.length>10000)throw Object.assign(new Error('Превышен лимит одной рассылки: 10 000 устройств'),{status:400});
  if(!claim&&(!Number.isInteger(expectedDevices)||expectedDevices!==devices.length))throw Object.assign(new Error('Количество получателей изменилось. Обновите предпросмотр.'),{status:409});
  if(!claim&&!devices.length)throw Object.assign(new Error('Нет устройств с включёнными уведомлениями'),{status:400});
  if(claim&&!await claim()){active=false;return null;}
  const progress={id:content.key,status:'sending',total:devices.length,accepted:0,failed:0,skipped:0};
  jobs.set(content.key,{at:now,progress});
  while(jobs.size>20){const first=jobs.keys().next().value;if(first===content.key)break;jobs.delete(first);}
  void (async()=>{
   for(const device of devices){
    try{
     const [[current]]=await db.execute(`SELECT d.device_id FROM push_devices d JOIN users u ON u.id=d.user_id WHERE d.device_id=? AND d.user_id=? AND d.token_hash=? AND ${eligible}`,[device.device_id,device.user_id,device.token_hash]);
     if(!current){progress.skipped++;continue;}
     const result=await client.send({token:decryptPushToken(device.token_cipher,process.env.PUSH_TOKEN_SECRET||getJwtSecret()),recipientId:device.user_id,path:content.path,key:content.key,content});
     if(result.ok)progress.accepted++;else progress.failed++;
     if(result.invalidToken)try{await db.execute('DELETE FROM push_devices WHERE device_id=? AND token_hash=?',[device.device_id,device.token_hash]);}catch{console.error('Failed to remove invalid broadcast token');}
    }catch{progress.failed++;}
   }
  })().finally(()=>{progress.status='finished';active=false;});
  return progress;
 }catch(error){active=false;throw error;}
}

export async function dispatchPendingNewsNotification(){
  if(active||process.env.PUSH_ENABLED!=='true')return;
  const [[article]]=await db.execute(`SELECT a.id,a.title,a.category FROM site_news_notifications n
    JOIN site_articles a ON a.id=n.article_id WHERE n.dispatched_at IS NULL AND a.published=1
    ORDER BY n.article_id LIMIT 1`);
  if(!article)return;
  const category=article.category==='crypto'?'crypto':'project';
  const content={key:`news:${article.id}`,title:'Новая новость в Гоблине',body:article.title,
    path:`/news?category=${category}&article=${article.id}`,eventType:'news'};
  return beginBroadcast(content,{claim:async()=>{
   const [result]=await db.execute(`UPDATE site_news_notifications n JOIN site_articles a ON a.id=n.article_id
     SET n.dispatched_at=CURRENT_TIMESTAMP(6) WHERE n.article_id=? AND n.dispatched_at IS NULL AND a.published=1`,[article.id]);
   return result.affectedRows===1;
  }});
}

export function startNewsNotifications(){
 if(process.env.PUSH_ENABLED!=='true')return;
 const timer=setInterval(()=>dispatchPendingNewsNotification().catch(error=>{
  if(error.status!==409)console.error('Could not dispatch news notification');
 }),15000);
 timer.unref();
}
