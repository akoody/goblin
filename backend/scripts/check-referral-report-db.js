import 'dotenv/config';
import assert from 'node:assert/strict';
import { db } from '../src/config/db.js';
import { referralReport, referralInvitees } from '../src/services/referral-report.service.js';

// Connection-local temporary tables shadow real tables. No application records
// or balances are changed, even when this is run against the production database.
const original = db.getConnection;
const connection = await original.call(db);
try {
  for (const [table, columns] of Object.entries({
    users: 'id BIGINT,username VARCHAR(64),email VARCHAR(255),referral_code VARCHAR(32),referred_by BIGINT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    wallets: 'id BIGINT,user_id BIGINT',
    blockchain_deposits: 'id BIGINT,wallet_id BIGINT,currency VARCHAR(16),amount DECIMAL(36,18),credited_at TIMESTAMP NULL',
    deposit_reviews: 'deposit_id BIGINT,status VARCHAR(32),fee_amount DECIMAL(36,18),net_amount DECIMAL(36,18)',
  })) await connection.query(`CREATE TEMPORARY TABLE ${table} (${columns})`);
  await connection.query(`INSERT INTO users(id,username,email,referral_code,referred_by) VALUES
    (1,'first','first@example.test','GBL000001',NULL),(2,'second','second@example.test','GBL000002',NULL),
    (3,'invitee-a','a@example.test','GBL000003',1),(4,'invitee-b','b@example.test','GBL000004',1),
    (5,'other','other@example.test','GBL000005',2)`);
  await connection.query('INSERT INTO wallets VALUES (30,3),(40,4),(50,5)');
  await connection.query(`INSERT INTO blockchain_deposits VALUES
    (1,30,'USDT',10,NOW()),(2,30,'USDT',5,NULL),(3,40,'USDT',7,NOW()),
    (4,40,'TRX',123.123456,NOW()),(5,40,'USDT',3,NULL),(6,50,'USDT',999,NOW())`);
  await connection.query(`INSERT INTO deposit_reviews VALUES
    (1,'CREDITED',2,8),(2,'PENDING_AML',NULL,NULL),(4,'CREDITED',6,117.123456),(5,'BLOCKED',NULL,NULL)`);
  // MySQL cannot reopen one TEMPORARY table twice in a statement. Use an
  // identical snapshot for the correlated invite count in this fixture only.
  await connection.query('CREATE TEMPORARY TABLE referral_fixture_invites AS SELECT * FROM users');
  db.getConnection = async () => new Proxy(connection, {
    get(target, property) {
      if (property === 'release') return () => {};
      if (property === 'query') return (sql, args) => target.query(sql.replace('FROM users i WHERE i.referred_by=u.id', 'FROM referral_fixture_invites i WHERE i.referred_by=u.id'), args);
      const value = target[property]; return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const report = await referralReport({ q: '#1' });
  assert.equal(report.total, 1); assert.equal(report.rows[0].invitedCount, 2);
  const usdt = report.rows[0].amounts.find(row => row.currency === 'USDT');
  assert.equal(Number(usdt.gross), 17); assert.equal(Number(usdt.net), 15);
  assert.equal(Number(usdt.fee), 2); assert.equal(Number(usdt.pending), 5); assert.equal(Number(usdt.blocked), 3);
  assert.equal(Number(report.rows[0].amounts.find(row => row.currency === 'TRX').net), 117.123456);
  const details = await referralInvitees(1);
  assert.equal(details.total, 2); assert.equal(details.rows.length, 2);
  assert(!details.rows.some(row => Number(row.id) === 5));
  assert.equal((await referralReport({ q: '%' })).total, 0);
  assert.equal((await referralReport({ page: 2 })).rows.length, 0);
  console.log('PASS real MySQL temporary tables: inviter attribution, no join multiplication, gross/fee/net, pending/blocked, legacy credits, currencies, details, search and pagination. No permanent writes.');
} finally {
  db.getConnection = original;
  // Disconnecting destroys all temporary tables, including on assertion failure.
  connection.destroy();
  await db.end();
}
