// Run only against a newly created isolated QA schema. No RPC or production data.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import mysql from 'mysql2/promise';
import {db} from '../src/config/db.js';
import {transact} from '../src/services/commerce.service.js';
import {accrueReferral,creditReferralEvent,deliverReferralRewards,referralCustody,referralCustodyBalances} from '../src/services/referral-accrual.service.js';
import {saveReferralUserRates} from '../src/services/referral-commission-policy.service.js';
import {applyP2pCommission} from '../src/services/p2p-fee.service.js';

const database=process.env.REFERRAL_QA_DATABASE;
if(!/^qa_referral_[a-z0-9_]+$/.test(database||'')||database===process.env.DB_NAME)throw Error('An isolated qa_referral_* database is required');
const qa=mysql.createPool({socketPath:'/var/run/mysqld/mysqld.sock',user:'root',database,connectionLimit:5,multipleStatements:true});
const original={execute:db.execute,query:db.query,getConnection:db.getConnection};
db.execute=qa.execute.bind(qa);db.query=qa.query.bind(qa);db.getConnection=qa.getConnection.bind(qa);
const one=async(sql,args=[]) => (await qa.execute(sql,args))[0][0];
async function earn({kind='DEPOSIT',sourceId,payerId=2,sourceUserId=payerId,currency='USDT',fee='2'}) {
  return transact(async c=>{
    await c.execute('INSERT INTO admin_treasury(currency,balance) VALUES(?,?) ON DUPLICATE KEY UPDATE balance=balance+VALUES(balance)',[currency,fee]);
    return accrueReferral(c,{kind,sourceId,payerId,sourceUserId,currency,fee});
  });
}
try {
  const [[tables]]=await qa.query('SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=?',[database]);
  assert.equal(Number(tables.n),0,'QA schema must be empty');
  const directory=new URL('../sql/',import.meta.url);
  for(const name of (await readdir(directory)).filter(n=>/^\d+.*\.sql$/.test(n)).sort()) await qa.query(await readFile(new URL(name,directory),'utf8'));
  await qa.query("INSERT INTO users(id,username,email,password_hash,status) VALUES(1,'referrer','referrer@example.invalid','invalid','active'),(2,'invited','invited@example.invalid','invalid','active'),(3,'other','other@example.invalid','invalid','active')");
  await qa.query('UPDATE users SET referred_by=1 WHERE id=2');
  await qa.query("INSERT INTO wallets(user_id,currency,balance,locked_balance) VALUES(1,'USDT',10,3),(2,'USDT',8,0)");
  const event=await earn({sourceId:'deposit-1'});
  assert.equal((await one("SELECT balance FROM admin_treasury WHERE currency='USDT'")).balance,'1.000000000000000000');
  assert.equal((await one("SELECT balance FROM wallets WHERE user_id=1 AND currency='USDT'")).balance,'10.000000000000000000');
  // Simultaneous delivery and repeated source processing cannot duplicate a reward.
  await Promise.all([creditReferralEvent(event),creditReferralEvent(event)]);
  assert.equal(await creditReferralEvent(event),false);
  const wallet=await one("SELECT balance,locked_balance FROM wallets WHERE user_id=1 AND currency='USDT'");
  assert.equal(wallet.balance,'11.000000000000000000');assert.equal(wallet.locked_balance,'3.000000000000000000');
  await transact(c=>accrueReferral(c,{kind:'DEPOSIT',sourceId:'deposit-1',payerId:2,currency:'USDT',fee:'2'}));
  assert.equal(Number((await one('SELECT COUNT(*) n FROM referral_rewards')).n),1);
  assert.equal(referralCustodyBalances('8','2',await referralCustody(qa,2,'USDT')).earned,'1');
  assert.equal(referralCustodyBalances('11','0',await referralCustody(qa,1,'USDT')).local,'10');
  await assert.rejects(()=>transact(c=>accrueReferral(c,{kind:'DEPOSIT',sourceId:'deposit-1',payerId:2,currency:'USDT',fee:'3'})),/mismatch/);
  // Snapshot survives policy changes before delivery; SOL wallet can be initialized later.
  const sol=await earn({kind:'PUMP',sourceId:'launch-1',currency:'SOL',fee:'1'});
  await saveReferralUserRates(1,{userIds:[1],ratePercent:25});
  await creditReferralEvent(sol);
  assert.equal((await one("SELECT balance,address FROM wallets WHERE user_id=1 AND currency='SOL'")).balance,'0.500000000000000000');
  const next=await earn({kind:'ESCROW',sourceId:'escrow-1',fee:'4'});await creditReferralEvent(next);
  assert.equal((await one('SELECT reward_amount FROM referral_commission_events WHERE id=?',[next])).reward_amount,'1.000000000000000000');
  await saveReferralUserRates(1,{userIds:[1],ratePercent:0});
  const zero=await earn({sourceId:'zero'});assert.equal((await one('SELECT status FROM referral_commission_events WHERE id=?',[zero])).status,'skipped');
  await saveReferralUserRates(1,{userIds:[1],ratePercent:null});
  const other=await earn({sourceId:'not-invited',payerId:3});assert.equal((await one('SELECT status FROM referral_commission_events WHERE id=?',[other])).status,'skipped');
  // A deferred recipient does not block source settlement or lose their entitlement.
  await qa.query("UPDATE wallets SET collection_lock_id='qa-collection' WHERE user_id=1 AND currency='USDT'");
  const busy=await earn({sourceId:'busy'});assert.equal(await creditReferralEvent(busy),false);
  assert.equal((await one('SELECT status FROM referral_commission_events WHERE id=?',[busy])).status,'pending');
  await deliverReferralRewards();
  assert.equal(Number((await one('SELECT attempts FROM referral_commission_events WHERE id=?',[busy])).attempts),1);
  await qa.query("UPDATE wallets SET collection_lock_id=NULL WHERE user_id=1 AND currency='USDT'");
  await qa.execute('UPDATE referral_commission_events SET next_attempt_at=NOW(6) WHERE id=?',[busy]);
  await deliverReferralRewards();
  assert.equal((await one('SELECT status FROM referral_commission_events WHERE id=?',[busy])).status,'credited');
  // P2P uses the recipient who actually paid the fee, not both parties.
  await qa.query("INSERT INTO orders(id,user_id,type,amount,price,min_limit,max_limit,payment_methods) VALUES(42,3,'SELL',100,100,1,10000,'[]')");
  await qa.query("INSERT INTO deals(id,order_id,buyer_id,seller_id,crypto_amount,fiat_amount,price,payment_method) VALUES(42,42,2,3,100,10000,100,'QA')");
  await transact(c=>applyP2pCommission(c,{dealId:42,sellerId:3,beneficiaryId:2,grossAmount:'100',feePercent:'5'}));
  const p2p=await one("SELECT * FROM referral_commission_events WHERE source_kind='P2P'");
  assert.equal(Number(p2p.payer_id),2);assert.equal(Number(p2p.source_user_id),3);assert.equal(p2p.reward_amount,'2.500000000000000000');
  await creditReferralEvent(p2p.id);
  for(const currency of ['BTC','ETH','TRX']) {
    const id=await earn({kind:'WITHDRAWAL',sourceId:`withdrawal-${currency}`,currency,fee:currency==='BTC'?'0.00000003':'0.2'});
    await creditReferralEvent(id);
    assert.equal((await one('SELECT balance FROM wallets WHERE user_id=1 AND currency=?',[currency])).balance,currency==='BTC'?'0.000000010000000000':'0.100000000000000000');
  }
  const before=await one('SELECT COUNT(*) n FROM referral_commission_events');
  await assert.rejects(()=>transact(async c=>{await accrueReferral(c,{kind:'DEPOSIT',sourceId:'rollback',payerId:2,currency:'USDT',fee:'1'});throw Error('rollback');}));
  assert.equal((await one('SELECT COUNT(*) n FROM referral_commission_events')).n,before.n);
  console.log(JSON.stringify({isolatedSql:true,allMigrations:true,creditToMainWallet:true,treasuryReserved:true,concurrentExactlyOnce:true,rateSnapshot:true,zeroAndUninvited:true,lazySolWallet:true,busyWalletRetry:true,p2pFeePayer:true,atomicRollback:true,custodyBacking:true}));
} finally {Object.assign(db,original);await qa.end();await db.end();}
