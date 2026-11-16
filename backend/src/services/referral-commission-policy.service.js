import Decimal from 'decimal.js';
import {db} from '../config/db.js';

const fail = message => { throw Object.assign(new Error(message), {status:400}); };
export function referralPercent(value) {
  const raw=String(value ?? '').trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(raw)) fail('Укажите процент от 0 до 100, не более двух знаков после запятой');
  const rate=new Decimal(raw);
  if (rate.gt(100)) fail('Процент не может превышать 100');
  return rate.toFixed(2);
}
export function referralRateSelection(body) {
  if (!Array.isArray(body?.userIds)||!body.userIds.length||body.userIds.length>200) fail('Выберите от 1 до 200 пользователей');
  if(body.userIds.some(id=>typeof id!=='number'&&(typeof id!=='string'||!/^\d+$/.test(id)))) fail('Некорректные ID пользователей');
  const ids=body.userIds.map(Number);
  if (ids.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(ids).size!==ids.length) fail('Некорректные или повторяющиеся ID');
  return {ids:ids.sort((a,b)=>a-b),rate:body.ratePercent===null?null:referralPercent(body.ratePercent)};
}

export async function referralCommissionPolicy() {
  const [[policy]]=await db.execute('SELECT rate_percent,updated_at FROM referral_commission_policy WHERE id=1');
  if (!policy) throw Object.assign(new Error('Настройки реферальной программы не найдены'), {status:503});
  return {ratePercent:String(policy.rate_percent),updatedAt:policy.updated_at,basis:'PLATFORM_COMMISSION'};
}
export async function effectiveReferralRate(userId, executor=db) {
  const [[rate]]=await executor.execute(`SELECT p.rate_percent AS default_percent,r.rate_percent AS custom_percent,
    COALESCE(r.rate_percent,p.rate_percent) AS effective_percent
    FROM referral_commission_policy p LEFT JOIN referral_user_rates r ON r.user_id=? WHERE p.id=1`,[userId]);
  if (!rate) throw Object.assign(new Error('Настройки реферальной программы не найдены'), {status:503});
  return {ratePercent:String(rate.effective_percent),customRatePercent:rate.custom_percent===null?null:String(rate.custom_percent),defaultRatePercent:String(rate.default_percent)};
}

async function change(work) {
  const connection=await db.getConnection();
  try {await connection.beginTransaction();const result=await work(connection);await connection.commit();return result;}
  catch(error){await connection.rollback();throw error;}
  finally{connection.release();}
}

export async function saveReferralDefault(actorId, body) {
  const rate=referralPercent(body?.ratePercent);
  if (typeof body?.resetOverrides!=='boolean') fail('Укажите, нужно ли сбрасывать индивидуальные ставки');
  return change(async c=>{
    const [[old]]=await c.execute('SELECT rate_percent FROM referral_commission_policy WHERE id=1 FOR UPDATE');
    if (!old) throw Object.assign(new Error('Настройки реферальной программы не найдены'),{status:503});
    const [overrides]=body.resetOverrides?await c.query('SELECT user_id,rate_percent FROM referral_user_rates ORDER BY user_id FOR UPDATE'):[[]];
    await c.execute('UPDATE referral_commission_policy SET rate_percent=?,updated_by=? WHERE id=1',[rate,actorId]);
    if (body.resetOverrides) await c.execute('DELETE FROM referral_user_rates');
    await c.execute('INSERT INTO referral_rate_audit(actor_id,scope,previous_json,new_json) VALUES(?,?,?,?)',[
      actorId,body.resetOverrides?'ALL':'DEFAULT',JSON.stringify({ratePercent:String(old.rate_percent),overrides}),JSON.stringify({ratePercent:rate,resetOverrides:body.resetOverrides}),
    ]);
    return {ratePercent:rate,resetOverrides:body.resetOverrides};
  });
}

export async function saveReferralUserRates(actorId, body) {
  const {ids,rate}=referralRateSelection(body);
  return change(async c=>{
    // The singleton policy lock serializes batch edits and an all-users reset.
    const [[policy]]=await c.execute('SELECT rate_percent FROM referral_commission_policy WHERE id=1 FOR UPDATE');
    if (!policy) throw Object.assign(new Error('Настройки реферальной программы не найдены'),{status:503});
    const [users]=await c.query('SELECT id,status FROM users WHERE id IN (?) ORDER BY id FOR UPDATE',[ids]);
    if (users.length!==ids.length||users.some(u=>u.status==='deleted')) fail('Один из выбранных пользователей не найден или удалён');
    const [old]=await c.query('SELECT user_id,rate_percent FROM referral_user_rates WHERE user_id IN (?) ORDER BY user_id FOR UPDATE',[ids]);
    if (rate===null) await c.query('DELETE FROM referral_user_rates WHERE user_id IN (?)',[ids]);
    else for (const id of ids) await c.execute(`INSERT INTO referral_user_rates(user_id,rate_percent,updated_by) VALUES(?,?,?)
      ON DUPLICATE KEY UPDATE rate_percent=VALUES(rate_percent),updated_by=VALUES(updated_by)`,[id,rate,actorId]);
    await c.execute('INSERT INTO referral_rate_audit(actor_id,scope,previous_json,new_json) VALUES(?,?,?,?)',[
      actorId,'SELECTED',JSON.stringify(old),JSON.stringify({userIds:ids,ratePercent:rate}),
    ]);
    return {updated:ids.length,ratePercent:rate,defaultRatePercent:String(policy.rate_percent)};
  });
}
