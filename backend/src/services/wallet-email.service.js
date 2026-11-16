import {createHash} from 'node:crypto';
import {db} from '../config/db.js';

const subjects=Object.freeze({
 deposit_credited:'Пополнение зачислено',
 withdrawal_confirmed:'Вывод подтверждён',
 withdrawal_failed:'Вывод не выполнен',
});
let pending=0;
export async function sendWalletEmail(type,userIds,key,{database=db,request=fetch,env=process.env}={}){
 if(!Object.hasOwn(subjects,type)||!key||!env.RESEND_API_KEY?.trim()||!env.EMAIL_FROM?.trim())return;
 for(const id of new Set(userIds.filter(Boolean).map(String))){
  const [[user]]=await database.execute("SELECT email FROM users WHERE id=? AND status='active'",[id]);
  if(!user?.email)continue;
  const subject=subjects[type];
  const response=await request('https://api.resend.com/emails',{
   method:'POST',signal:AbortSignal.timeout(10000),
   headers:{Authorization:`Bearer ${env.RESEND_API_KEY.trim()}`,'Content-Type':'application/json','Idempotency-Key':'wallet-'+createHash('sha256').update(JSON.stringify([type,id,key])).digest('hex')},
   body:JSON.stringify({from:env.EMAIL_FROM.trim(),to:[user.email],subject:`CryptoGoblin: ${subject}`,text:`${subject}. Подробности в истории операций: https://cryptogoblin.ru/me?section=transactions`})
  });
  if(!response.ok)throw new Error(`Wallet email rejected: HTTP ${response.status}`);
 }
}

export function notifyWalletEmail(type,userIds,key){
 if(!Object.hasOwn(subjects,type)||pending>=32)return;
 pending++;
 void sendWalletEmail(type,userIds,key).catch(()=>console.error('Wallet email delivery request failed',type)).finally(()=>{pending--;});
}
