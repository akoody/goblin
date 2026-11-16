import DecimalJs from 'decimal.js';
import {notifyUsers} from './push.service.js';
import {db} from '../config/db.js';
import {effectiveReferralRate} from './referral-commission-policy.service.js';

const precisions = {USDT:6, TRX:6, SOL:9, BTC:8, ETH:18};
const Decimal = DecimalJs.clone({precision:80});
const sources = new Set(['DEPOSIT', 'P2P', 'ESCROW', 'PUMP', 'WITHDRAWAL']);

export function referralReward(fee, rate, currency) {
  const amount = new Decimal(fee);
  const percent = new Decimal(rate);
  if (!Object.hasOwn(precisions, currency) || !amount.isFinite() || amount.lt(0) ||
      !percent.isFinite() || percent.lt(0) || percent.gt(100)) throw new Error('Invalid referral commission');
  return amount.mul(percent).div(100).toFixed(precisions[currency], Decimal.ROUND_DOWN);
}

// Called only within the transaction which records an earned platform fee.
// Reserve the entitlement now; delivery to a busy recipient wallet is retried separately.
export async function accrueReferral(c, {kind, sourceId, payerId, sourceUserId=payerId, currency, fee}) {
  if (!sources.has(kind) || sourceId==null || !String(sourceId) || String(sourceId).length>80 || !payerId || !sourceUserId)
    throw new Error('Invalid referral source');
  referralReward(fee, 0, currency);
  const [[existing]] = await c.execute(
    'SELECT id,payer_id,source_user_id,currency,fee_amount FROM referral_commission_events WHERE source_kind=? AND source_id=? FOR UPDATE',
    [kind, String(sourceId)],
  );
  if (existing) {
    if (String(existing.payer_id)!==String(payerId) || String(existing.source_user_id)!==String(sourceUserId) ||
        existing.currency!==currency || !new Decimal(existing.fee_amount).eq(fee)) throw new Error('Referral source mismatch');
    return existing.id;
  }
  const [[inviter]] = await c.execute(`SELECT r.id,r.status FROM users u
    JOIN users r ON r.id=u.referred_by WHERE u.id=? AND r.id<>u.id`, [payerId]);
  const referrer = inviter && inviter.status!=='deleted' ? inviter.id : null;
  const rate = referrer ? (await effectiveReferralRate(referrer, c)).ratePercent : '0';
  const reward = referralReward(fee, rate, currency);
  const pending = new Decimal(reward).gt(0);
  const [event] = await c.execute(`INSERT INTO referral_commission_events
    (source_kind,source_id,payer_id,source_user_id,referrer_id,currency,fee_amount,rate_percent,reward_amount,status)
    VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [kind,String(sourceId),payerId,sourceUserId,referrer,currency,String(fee),rate,reward,pending?'pending':'skipped']);
  if (pending) {
    const [reserved] = await c.execute('UPDATE admin_treasury SET balance=balance-? WHERE currency=? AND balance>=?', [reward,currency,reward]);
    if (reserved.affectedRows!==1) throw new Error('Referral commission is not covered by treasury');
  }
  return event.insertId;
}

export async function creditReferralEvent(id) {
  const c = await db.getConnection();
  try {
    await c.beginTransaction();
    const [[event]] = await c.execute('SELECT * FROM referral_commission_events WHERE id=? FOR UPDATE', [id]);
    if (!event || event.status!=='pending') { await c.commit(); return false; }
    await c.execute(`INSERT INTO wallets(user_id,currency,balance) VALUES(?,?,0)
      ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)`, [event.referrer_id,event.currency]);
    const [[wallet]] = await c.execute('SELECT id,collection_lock_id FROM wallets WHERE user_id=? AND currency=? FOR UPDATE', [event.referrer_id,event.currency]);
    if (wallet.collection_lock_id) { await c.rollback(); return false; }
    // Blocked accounts retain their entitlement, but existing access restrictions still apply.
    await c.execute('UPDATE wallets SET balance=balance+? WHERE id=?', [event.reward_amount,wallet.id]);
    await c.execute(`INSERT INTO referral_rewards(referrer_id,referred_user_id,currency,amount,event_id)
      VALUES(?,?,?,?,?)`, [event.referrer_id,event.payer_id,event.currency,event.reward_amount,event.id]);
    await c.execute("UPDATE referral_commission_events SET status='credited',credited_at=NOW(),last_error=NULL WHERE id=?", [id]);
    await c.commit();
    notifyUsers('referral_credited',[event.referrer_id],{key:`referral:${id}:credited`});
    return true;
  } catch (error) {
    await c.rollback();
    throw error;
  } finally { c.release(); }
}

export async function deliverReferralRewards() {
  const [events] = await db.query("SELECT id FROM referral_commission_events WHERE status='pending' AND next_attempt_at<=NOW(6) ORDER BY next_attempt_at,id LIMIT 100");
  for (const event of events) {
    let retry = null;
    try { if (!await creditReferralEvent(event.id)) retry='WALLET_BUSY'; }
    catch (error) {
      retry=String(error.code || 'CREDIT_FAILED').slice(0,64);
      console.error('Referral credit deferred', {eventId:event.id, code:retry});
    }
    if (retry) await db.execute(`UPDATE referral_commission_events SET
      next_attempt_at=TIMESTAMPADD(SECOND,LEAST(300,POW(2,LEAST(attempts+1,8))),NOW(6)),
      attempts=attempts+1,last_error=? WHERE id=? AND status='pending'`, [retry,event.id]);
  }
}

export function startReferralAccrual() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await deliverReferralRewards(); }
    catch (error) { console.error('Referral delivery unavailable', {code:error.code || 'DELIVERY_FAILED'}); }
    finally { running = false; }
  };
  void tick();
  const timer = setInterval(tick, 1000);
  timer.unref();
  return timer;
}

// Internal credits stay physically backed at the fee source until rebalanced.
// Collection may take only the remaining exchange-owned share, never that backing.
export async function referralCustody(c, userId, currency) {
  const [[row]] = await c.execute(`SELECT
    COALESCE(SUM(CASE WHEN source_user_id=? THEN reward_amount ELSE 0 END),0) AS outgoing,
    COALESCE(SUM(CASE WHEN referrer_id=? AND status='credited' THEN reward_amount ELSE 0 END),0) AS incoming
    FROM referral_commission_events WHERE currency=? AND reward_amount>0
    AND (source_user_id=? OR referrer_id=?)`, [userId,userId,currency,userId,userId]);
  return {outgoing:new Decimal(row.outgoing),incoming:new Decimal(row.incoming)};
}

export function referralCustodyBalances(balance, grossFees, exposure) {
  const local = new Decimal(balance).minus(exposure.incoming);
  const earned = new Decimal(grossFees).minus(exposure.outgoing);
  if (local.lt(0) || earned.lt(0)) throw Object.assign(new Error('Реферальные обязательства требуют адресной сверки'), {status:409,code:'PROVENANCE_REVIEW'});
  return {local:local.toFixed(),liability:local.plus(exposure.outgoing).toFixed(),earned:earned.toFixed()};
}
