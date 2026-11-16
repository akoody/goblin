// Isolated SQL check; never target production or move customer funds.
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import {db} from '../src/config/db.js';
import {saveReferralDefault,saveReferralUserRates,effectiveReferralRate} from '../src/services/referral-commission-policy.service.js';
import {referralReport} from '../src/services/referral-report.service.js';

const database=process.env.REFERRAL_QA_DATABASE;
if(!/^qa_referral_[a-z0-9_]+$/.test(database||'')||database===process.env.DB_NAME)throw Error('An isolated qa_referral_* database is required');
const qa=mysql.createPool({socketPath:'/var/run/mysqld/mysqld.sock',user:'root',database,connectionLimit:5});
const original={execute:db.execute,query:db.query,getConnection:db.getConnection};
db.execute=qa.execute.bind(qa);db.query=qa.query.bind(qa);db.getConnection=qa.getConnection.bind(qa);
try{
 const [[count]]=await qa.query('SELECT COUNT(*) n FROM users');assert.equal(Number(count.n),0);
 await qa.query("INSERT INTO users(id,username,email,password_hash,status) VALUES(1,'qa-referrer','qa-referrer@example.invalid','not-a-password','active'),(2,'qa-invited','qa-invited@example.invalid','not-a-password','active'),(3,'qa-other','qa-other@example.invalid','not-a-password','active')");
 await qa.query('UPDATE users SET referred_by=1 WHERE id=2');
 await qa.query("INSERT INTO wallets(user_id,currency,balance) VALUES(1,'USDT',100),(2,'USDT',10)");
 await qa.query("INSERT INTO referral_rewards(referrer_id,referred_user_id,currency,amount) VALUES(1,2,'USDT',3)");
 assert.equal((await effectiveReferralRate(1)).ratePercent,'50.00');
 await saveReferralUserRates(1,{userIds:[1,3],ratePercent:'25.5'});
 assert.equal((await effectiveReferralRate(1)).ratePercent,'25.50');
 await saveReferralDefault(1,{ratePercent:60,resetOverrides:false});
 assert.equal((await effectiveReferralRate(1)).ratePercent,'25.50');assert.equal((await effectiveReferralRate(2)).ratePercent,'60.00');
 await saveReferralUserRates(1,{userIds:[1],ratePercent:null});assert.equal((await effectiveReferralRate(1)).ratePercent,'60.00');
 await saveReferralUserRates(1,{userIds:[1],ratePercent:0});assert.equal((await effectiveReferralRate(1)).ratePercent,'0.00');
 const report=await referralReport({q:'qa-referrer'});assert.equal(report.total,1);assert.equal(report.rows[0].invitedCount,1);assert.equal(report.rows[0].effectiveRatePercent,'0.00');
 await saveReferralDefault(1,{ratePercent:50,resetOverrides:true});assert.equal((await effectiveReferralRate(1)).customRatePercent,null);
 await assert.rejects(()=>saveReferralUserRates(1,{userIds:[1,99999],ratePercent:80}));assert.equal((await effectiveReferralRate(1)).ratePercent,'50.00');
 await assert.rejects(()=>qa.query('UPDATE referral_commission_policy SET rate_percent=101 WHERE id=1'));
 const [[audit]]=await qa.query('SELECT COUNT(*) n FROM referral_rate_audit');assert.equal(Number(audit.n),5);
 const [wallets]=await qa.query('SELECT balance FROM wallets ORDER BY user_id');assert.equal(wallets[0].balance,'100.000000000000000000');assert.equal(wallets[1].balance,'10.000000000000000000');
 const [[reward]]=await qa.query('SELECT amount FROM referral_rewards');assert.equal(reward.amount,'3.000000000000000000');
 console.log(JSON.stringify({isolatedSql:true,default50:true,batchAndReset:true,zeroOverride:true,report:true,audit:true,walletsUnchanged:true,previousRewardsUnchanged:true}));
}finally{Object.assign(db,original);await qa.end();await db.end();}
