import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { db } from '../src/config/db.js';
import { recordPendingDeposit, reviewDeposit } from '../src/services/deposit-compliance.service.js';
import { transact } from '../src/services/commerce.service.js';
if(process.env.DEPOSIT_DB_CHECK!=='1')throw new Error('Explicit DEPOSIT_DB_CHECK=1 required');
const tag='depositqa-'+randomUUID().slice(0,8);let userId,walletId;
const report={action:'APPROVE',provider:'QA simulated report - NOT a real AML check',reference:'https://example.invalid/qa-report',riskLevel:'LOW',note:'Disposable QA settlement only, no real chain transfer'};
const receipt=amount=>({wallet:{id:walletId},currency:'USDT',txHash:tag+'-'+randomUUID(),from:'QA-source',to:tag,amount,timestamp:Date.now()});
const walletBalance=async()=>{const [[r]]=await db.execute('SELECT balance FROM wallets WHERE id=?',[walletId]);return new Decimal(r.balance);};
try{
  const [u]=await db.execute("INSERT INTO users (username,email,password_hash,status) VALUES (?,?,?,'active')",[tag,tag+'@example.invalid','!disabled-qa-account']);userId=u.insertId;
  const [w]=await db.execute("INSERT INTO wallets (user_id,currency,balance,address,status) VALUES (?,'USDT',0,?,'active')",[userId,tag]);walletId=w.insertId;
  const [[policy]]=await db.execute('SELECT fee_usd FROM deposit_policy WHERE id=1');
  const item=receipt('10');assert.equal(await recordPendingDeposit(item),true);assert.equal(await recordPendingDeposit(item),false);assert((await walletBalance()).isZero());
  const [[d]]=await db.execute('SELECT id,credited_at FROM blockchain_deposits WHERE wallet_id=? AND tx_hash=?',[walletId,item.txHash]);assert.equal(d.credited_at,null);
  await assert.rejects(()=>reviewDeposit(userId,d.id,{...report,reference:''}),e=>e.status===400);
  const results=await Promise.allSettled([reviewDeposit(userId,d.id,report),reviewDeposit(userId,d.id,report)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert((await walletBalance()).eq(new Decimal(10).minus(policy.fee_usd)));
  const [ledger]=await db.execute('SELECT amount FROM admin_treasury_ledger WHERE deposit_id=?',[d.id]);assert.equal(ledger.length,1);assert(new Decimal(ledger[0].amount).eq(policy.fee_usd));
  const tiny=receipt('4.999999');await recordPendingDeposit(tiny);const [[t]]=await db.execute('SELECT id FROM blockchain_deposits WHERE tx_hash=?',[tiny.txHash]);await assert.rejects(()=>reviewDeposit(userId,t.id,report),e=>e.code==='DEPOSIT_BELOW_MINIMUM');
  await assert.rejects(()=>reviewDeposit(userId,t.id,{...report,riskLevel:'HIGH'}),e=>e.status===400);
  await reviewDeposit(userId,t.id,{action:'BLOCK',note:'QA below minimum, blocked without credit'});await assert.rejects(()=>reviewDeposit(userId,t.id,report),e=>e.status===409);
  console.log('PASS pending deposits are unavailable; deduplicated receipt; report required; minimum enforced; atomic net credit and treasury fee; concurrent release pays once; blocked deposit never credited');
}finally{
  if(userId)await transact(async c=>{
    const [income]=await c.execute('SELECT currency,SUM(amount) amount FROM admin_treasury_ledger WHERE user_id=? GROUP BY currency',[userId]);
    for(const r of income)await c.execute('UPDATE admin_treasury SET balance=balance-? WHERE currency=?',[r.amount,r.currency]);
    await c.execute('DELETE FROM admin_treasury_ledger WHERE user_id=?',[userId]);
    await c.execute('DELETE r FROM deposit_reviews r JOIN blockchain_deposits d ON d.id=r.deposit_id WHERE d.wallet_id=?',[walletId]);
    await c.execute('DELETE FROM blockchain_deposits WHERE wallet_id=?',[walletId]);await c.execute('DELETE FROM transactions WHERE wallet_id=?',[walletId]);await c.execute('DELETE FROM wallets WHERE user_id=?',[userId]);await c.execute('DELETE FROM users WHERE id=?',[userId]);
  });
  await db.end();
}
