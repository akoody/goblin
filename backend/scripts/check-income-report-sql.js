// Проверка отчёта по деньгам платформы на настоящей MySQL: только на отдельной QA-базе с применёнными миграциями.
// Заполняет журналы всех видов, сверяет строки, фильтры, итоги, CSV и сверку с остатком казны.
//   DB_HOST=… DB_PORT=… DB_USER=… DB_PASSWORD=… DB_NAME=qa_income node scripts/check-income-report-sql.js
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

if (!/^(qa_|goblin_qa)/.test(process.env.DB_NAME || '')) throw new Error('Нужна отдельная QA-база: DB_NAME начинается с qa_ или goblin_qa');
const { db } = await import('../src/config/db.js');
const { incomeReport, incomeReportCsv } = await import('../src/services/platform-income-report.service.js');
const run = (sql, args = []) => db.query(sql, args).then(([result]) => result);

try {
  const user = async name => (await run("INSERT INTO users(username,password_hash) VALUES(?,'qa')", [name])).insertId;
  const admin = await user('qa_admin'), seller = await user('qa_seller'), referrer = await user('refman'), buyer = await user('qa_buyer');

  const order = (await run("INSERT INTO orders(user_id,type,amount,price,min_limit,max_limit,payment_methods) VALUES(?,'sell',100,95,1,100,'[]')", [seller])).insertId;
  const deal = (await run("INSERT INTO deals(order_id,buyer_id,seller_id,crypto_amount,fiat_amount,price,payment_method) VALUES(?,?,?,100,9500,95,'sber')", [order, buyer, seller])).insertId;
  await run('INSERT INTO p2p_fee_ledger(deal_id,seller_id,gross_amount,fee_percent,fee_amount,net_amount) VALUES(?,?,100,1,1,99)', [deal, seller]);

  const escrow = randomUUID(), free = randomUUID();
  for (const id of [escrow, free]) await run("INSERT INTO commerce_deals(id,kind,currency,creator_id,buyer_id,seller_id,title,terms,amount,request_key) VALUES(?,'ESCROW','USDT',?,?,?,'Аккаунт','qa',100,?)", [id, buyer, buyer, seller, randomUUID()]);
  await run('INSERT INTO commerce_guarantor_fee_ledger(deal_id,seller_id,gross_amount,fee_percent,fee_amount,net_amount) VALUES(?,?,100,2,2,98)', [escrow, seller]);
  await run('INSERT INTO commerce_guarantor_fee_ledger(deal_id,seller_id,gross_amount,fee_percent,fee_amount,net_amount) VALUES(?,?,100,0,0,100)', [free, seller]);

  const btcWallet = (await run("INSERT INTO wallets(user_id,currency) VALUES(?,'BTC')", [seller])).insertId;
  const ethWallet = (await run("INSERT INTO wallets(user_id,currency) VALUES(?,'ETH')", [seller])).insertId;
  const deposit = (await run("INSERT INTO blockchain_deposits(wallet_id,network,currency,tx_hash,to_address,amount,block_timestamp) VALUES(?,'BTC','BTC','qa-deposit-hash','qa-address',0.01,1)", [btcWallet])).insertId;
  await run("INSERT INTO admin_treasury_ledger(deposit_id,user_id,currency,amount,fee_usd) VALUES(?,?,'BTC',0.0002,2)", [deposit, seller]);

  await run('INSERT INTO pump_fee_ledger(launch_id,user_id,amount_sol) VALUES(?,?,0.05)', [randomUUID(), seller]);

  const withdrawal = randomUUID(), collection = randomUUID();
  await run("INSERT INTO native_chain_jobs(id,currency,kind,user_id,request_key,status,plan_json,tx_hash,expires_at) VALUES(?,'ETH','withdrawal',?,?,'confirmed','{}','qa-withdrawal-hash',NOW())", [withdrawal, seller, randomUUID()]);
  await run("INSERT INTO native_fee_ledger(job_id,wallet_id,currency,kind,amount) VALUES(?,?,'ETH','withdrawal',0.001)", [withdrawal, ethWallet]);
  await run("INSERT INTO native_chain_jobs(id,currency,kind,user_id,request_key,status,plan_json,network_fee,expires_at) VALUES(?,'ETH','collection',?,?,'confirmed','{}',0.0003,NOW())", [collection, seller, randomUUID()]);
  await run("INSERT INTO native_fee_ledger(job_id,wallet_id,currency,kind,amount) VALUES(?,?,'ETH','collection',-0.0004)", [collection, ethWallet]);

  await run("INSERT INTO referral_commission_events(source_kind,source_id,payer_id,source_user_id,referrer_id,currency,fee_amount,rate_percent,reward_amount,status) VALUES('P2P',?,?,?,?,'USDT',1,20,0.2,'pending')", [String(deal), seller, seller, referrer]);
  await run("INSERT INTO referral_commission_events(source_kind,source_id,payer_id,source_user_id,referrer_id,currency,fee_amount,rate_percent,reward_amount,status) VALUES('ESCROW',?,?,?,NULL,'USDT',2,0,0,'skipped')", [escrow, seller, seller]);

  await run("INSERT INTO treasury_collection_jobs(id,plan_id,network,user_id,wallet_id,source_address,destination_address,amount,fee_budget,fee_charged,status,tx_hash) VALUES(?,?,'SOLANA',?,?,'qa-src','qa-vault',1,0.01,0.000005,'completed','qa-sol-hash')", [randomUUID(), randomUUID(), seller, btcWallet]);

  const payout = (currency, status, gross, fee) => run("INSERT INTO treasury_payouts(id,currency,actor_id,request_key,status,policy_revision,destination,gross_amount,fee_budget,fee_charged,plan_json,expires_at) VALUES(?,?,?,?,?,1,'qa-external',?,1,?,'{}',NOW())", [randomUUID(), currency, admin, randomUUID(), status, gross, fee]);
  await payout('USDT', 'confirmed', 0.5, 0.1);
  await payout('SOL', 'failed', 1, 0.00001);
  await payout('USDT', 'failed', 3, 0.2);
  await payout('USDT', 'preview', 7, 0);

  // Казна, как её довели бы сервисы; у ETH лишние 0.0001, которых нет в журналах
  for (const [currency, balance] of [['USDT', '2.3'], ['BTC', '0.0002'], ['SOL', '0.049985'], ['ETH', '0.0008']])
    await run('INSERT INTO admin_treasury(currency,balance) VALUES(?,?)', [currency, balance]);

  const report = await incomeReport();
  assert.equal(report.total, 10, 'каждая операция ровно одной строкой; нулевые и предпросмотры не попадают');
  const kinds = report.rows.map(row => row.kind).sort();
  assert.deepEqual(kinds, ['COLLECTION_FEE', 'COLLECTION_FEE', 'DEPOSIT_FEE', 'GUARANTOR_FEE', 'P2P_FEE', 'PUMP_FEE', 'REFERRAL_REWARD', 'TREASURY_PAYOUT', 'TREASURY_PAYOUT', 'WITHDRAWAL_FEE']);
  const p2p = report.rows.find(row => row.kind === 'P2P_FEE');
  assert.equal(p2p.username, 'qa_seller'); assert.equal(p2p.sourceId, String(deal)); assert.equal(Number(p2p.amount), 1); assert.equal(Number(p2p.gross), 100); assert.equal(Number(p2p.net), 99);
  const depositRow = report.rows.find(row => row.kind === 'DEPOSIT_FEE');
  assert.equal(Number(depositRow.net), 0.0098); assert.match(depositRow.details, /qa-deposit-hash/);
  const referral = report.rows.find(row => row.kind === 'REFERRAL_REWARD');
  assert.equal(referral.username, 'refman'); assert.equal(referral.sourceType, 'REFERRAL'); assert.equal(referral.sourceId, `P2P:${deal}`);
  assert.equal(Number(report.rows.find(row => row.kind === 'TREASURY_PAYOUT' && row.currency === 'SOL').amount), 0.00001, 'неудачная выплата SOL: расход только на сеть');

  const recon = Object.fromEntries(report.reconciliation.map(row => [row.currency, row]));
  for (const currency of ['USDT', 'BTC', 'SOL']) assert.equal(recon[currency].matches, true, `${currency}: казна сходится с журналами`);
  assert.equal(recon.ETH.matches, false); assert.equal(Number(recon.ETH.difference), 0.0001);
  assert.equal(Number(recon.USDT.income), 3); assert.equal(Number(recon.USDT.expense), 0.7);

  assert.equal((await incomeReport({ kind: 'P2P_FEE' })).total, 1);
  assert.equal((await incomeReport({ direction: 'OUT' })).total, 5);
  assert.equal((await incomeReport({ currency: 'sol' })).total, 3);
  assert.equal((await incomeReport({ q: 'refman' })).rows[0].kind, 'REFERRAL_REWARD');
  assert.equal((await incomeReport({ q: 'qa-withdrawal-hash' })).rows[0].kind, 'WITHDRAWAL_FEE');
  assert.equal((await incomeReport({ q: `#${seller}` })).total, 8, "7 операций продавца и реферальная выплата из его комиссии (плательщик #id)");
  assert.equal((await incomeReport({ q: '50%_' })).total, 0, 'спецсимволы поиска экранированы');
  assert.equal((await incomeReport({ from: '2999-01-01' })).total, 0);
  assert.equal((await incomeReport({ page: 2 })).rows.length, 0);
  const totals = (await incomeReport({ currency: 'USDT' })).totals;
  assert.equal(Number(totals.find(row => row.kind === 'GUARANTOR_FEE').total), 2);

  const csv = await incomeReportCsv({ currency: 'USDT' });
  assert(csv.startsWith('﻿Дата;Операция;'));
  assert.equal(csv.trim().split('\r\n').length, 1 + 4);
  console.log('PASS income report: 10 operations, filters, totals, CSV, reconciliation (USDT/BTC/SOL match, ETH +0.0001 flagged)');
} finally {
  await db.end();
}
