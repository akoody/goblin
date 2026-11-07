// Run only against an empty, schema-only qa_interface_* database.
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import {db} from '../src/config/db.js';
import {transactionHistory} from '../src/services/transaction-history.service.js';
import {updateUserControls} from '../src/services/user-controls.service.js';
import {assertUserMarketArea} from '../src/services/market-areas.js';

const database=process.env.INTERFACE_QA_DATABASE;
if(!/^qa_interface_[a-z0-9_]+$/.test(database||'')||database===process.env.DB_NAME)throw Error('An isolated qa_interface_* database is required');
const qa=mysql.createPool({socketPath:'/var/run/mysqld/mysqld.sock',user:'root',database,connectionLimit:4});
const original={query:db.query,execute:db.execute,getConnection:db.getConnection,fetch:global.fetch};
db.query=qa.query.bind(qa);db.execute=qa.execute.bind(qa);db.getConnection=qa.getConnection.bind(qa);
global.fetch=()=>{throw Error('Network operations are forbidden in this test');};
try {
  const [[count]]=await qa.query('SELECT COUNT(*) n FROM users');assert.equal(Number(count.n),0,'QA schema must contain no user data');
  await qa.query("INSERT INTO users(id,username,email,password_hash,p2p_enabled) VALUES(1,'qa-one','qa-one@example.invalid','not-a-password',0),(2,'qa-two','qa-two@example.invalid','not-a-password',1)");
  await qa.query("INSERT INTO wallets(id,user_id,currency,address) VALUES(1,1,'BTC','qa-btc-one'),(2,1,'ETH','qa-eth-one'),(3,2,'BTC','qa-btc-two')");
  await qa.query("INSERT INTO transactions(wallet_id,tx_hash,from_address,to_address,amount,currency,type) VALUES(1,'qa-deposit','outside','qa-btc-one',0.0001,'BTC','deposit'),(2,'qa-wei','outside','qa-eth-one',0.000000000000000001,'ETH','deposit'),(1,NULL,'qa-btc-one','qa-two@example.invalid',0.00000002,'BTC','internal'),(3,'qa-other','outside','qa-btc-two',0.5,'BTC','deposit')");
  await qa.query("INSERT INTO blockchain_deposits(id,wallet_id,network,currency,tx_hash,from_address,to_address,amount,block_timestamp,credited_at) VALUES(1,1,'BITCOIN','BTC','qa-pending','outside','qa-btc-one',0.1,1793836800000,NULL),(2,1,'BITCOIN','BTC','qa-deposit','outside','qa-btc-one',0.0001,1793836800000,NOW())");
  await qa.query("INSERT INTO deposit_reviews(deposit_id,status,fee_usd,min_usd,risk_level) VALUES(1,'PENDING_AML',2,5,NULL),(2,'CREDITED',2,5,'NOT_SCREENED')");
  const plan={amount:'1',sources:[{address:'qa-eth-one'}],outputs:[{address:'qa-external-eth'}]};
  await qa.execute("INSERT INTO native_chain_jobs(id,user_id,currency,kind,request_key,status,plan_json,expires_at) VALUES(UUID(),1,'ETH','withdrawal','qa-request','prepared',?,DATE_ADD(NOW(),INTERVAL 1 HOUR))",[JSON.stringify(plan)]);
  await qa.query("INSERT INTO crypto_withdrawals(id,user_id,wallet_id,network,currency,to_address,amount,status,idempotency_key) VALUES(UUID(),2,3,'BITCOIN','BTC','qa-outside-two',0.1,'confirmed','qa-tron-request')");
  const admin=await transactionHistory({}, {administrator:true,includeP2p:true});assert.equal(admin.total,7);
  const own=await transactionHistory({}, {userId:1});assert.equal(own.total,5);
  assert(!own.rows.some(r=>r.receiverAddress==='qa-outside-two'));
  assert.equal(Number(own.rows.find(r=>r.txHash==='qa-deposit').amlNotChecked),1);
  const wei=await transactionHistory({min:'0.000000000000000001',max:'0.000000000000000001'}, {userId:1});assert.equal(wei.total,2);
  assert(wei.rows.every(r=>Number(r.amount)===1e-18),'Native job amounts must not truncate to zero');
  const native=await transactionHistory({direction:'OUT',address:'qa-external-eth'}, {userId:1});assert.equal(native.total,1);
  assert.equal((await transactionHistory({direction:'IN'}, {userId:1})).total,3);
  assert.equal((await transactionHistory({address:"%' OR 1=1 --"}, {userId:1})).total,0);
  assert.equal((await transactionHistory({until:'2000-01-01T00:00:00Z'}, {userId:1})).total,0);
  await updateUserControls(1,1,{marketAccountsEnabled:false});
  const [[user]]=await qa.query('SELECT market_accounts_enabled,market_services_enabled,p2p_enabled FROM users WHERE id=1');
  assert.equal(user.market_accounts_enabled,0);assert.equal(user.market_services_enabled,1);assert.equal(user.p2p_enabled,0);
  await assert.rejects(()=>assertUserMarketArea(1,'Аккаунты'),e=>e.status===403);await assertUserMarketArea(1,'Услуги');
  const [[audit]]=await qa.query('SELECT COUNT(*) n FROM user_access_audit');assert.equal(Number(audit.n),1);
  for(let i=0;i<55;i++)await qa.execute("INSERT INTO transactions(wallet_id,from_address,to_address,amount,currency,type) VALUES(1,'qa-btc-one','qa-destination',1,'BTC','withdrawal')");
  assert.equal((await transactionHistory({}, {userId:1})).rows.length,50);
  assert.equal((await transactionHistory({page:2}, {userId:1})).rows.length,10);
  await qa.query("INSERT INTO transactions(wallet_id,from_address,to_address,amount,currency,type) VALUES(1,'qa-btc-one','qa-legacy-out',2,'BTC','external')");
  assert.equal((await transactionHistory({direction:'OUT',address:'qa-legacy-out'}, {userId:1})).total,1);
  console.log(JSON.stringify({isolatedSql:true,historySources:4,exactWei:true,scopedCustomerHistory:true,filters:true,pagination:true,partialControls:true,audit:true,realNetworkRequests:0}));
} finally {
  db.query=original.query;db.execute=original.execute;db.getConnection=original.getConnection;global.fetch=original.fetch;
  await qa.end();await db.end();
}
