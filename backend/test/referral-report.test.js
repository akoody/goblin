import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/config/db.js';
import { referralReportFilter, referralReport, referralInvitees, issueReferralLink, makeReferralCode } from '../src/services/referral-report.service.js';

test('Referral search is bound, escapes wildcard input and validates pagination', () => {
  const filter = referralReportFilter({ q: ' %_! ', page: '2' });
  assert.equal(filter.page, 2);
  assert.equal(filter.params[0], '%!%!_!!%');
  assert(!filter.where.includes('%_!'));
  assert.equal(referralReportFilter({ q: '#22' }).params[3], '22');
  for (const page of [0, -1, 'NaN', '1 OR 1=1', 1.2, 1000001]) assert.throws(() => referralReportFilter({ page }));
  assert.throws(() => referralReportFilter({ q: {} }));
});

test('Referral reporting keeps exact currency totals, page bounds and separate invite counts', async () => {
  const original = db.getConnection;
  const queries = [];
  let committed = 0;
  db.getConnection = async () => ({
    beginTransaction: async () => {}, commit: async () => { committed++; }, rollback: async () => {}, release() {},
    query: async (sql, args) => {
      queries.push({ sql, args });
      if (sql.includes('COUNT(*) AS total')) return [[{ total: 26 }]];
      if (sql.includes('AS invitedCount')) return [[{ id: 7, username: 'inviter', code: 'GBL000007', invitedCount: 2 }]];
      if (sql.includes('created_at AS createdAt')) return [[{ id: 8, username: 'invitee' }]];
      if (sql.includes('referrerId')) return [[{ referrerId: 7, currency: 'ETH', gross: '0.123456789123456789', net: '0.120000000000000001', fee: '0.003456789123456788' }]];
      return [[{ userId: 8, currency: 'USDT', gross: '10.000000', net: '8.000000', pending: '5.000000', blocked: '3.000000' }]];
    },
  });
  try {
    const report = await referralReport({ page: 2 });
    assert.equal(report.total, 26); assert.equal(report.rows[0].invitedCount, 2);
    assert.equal(report.rows[0].amounts[0].gross, '0.123456789123456789');
    assert(queries.some(query => query.args.includes(25)));
    const invitees = await referralInvitees(7);
    assert.equal(invitees.rows[0].amounts[0].net, '8.000000');
    for (const { sql } of queries.filter(query => query.sql.includes('SUM('))) {
      assert(sql.includes('blockchain_deposits')); assert(sql.includes('LEFT JOIN deposit_reviews'));
      assert(sql.includes("r.status='PENDING_AML'")); assert(sql.includes("r.status='BLOCKED'"));
      assert(sql.includes('COALESCE(r.net_amount,d.amount)')); assert(sql.includes('GROUP BY'));
      assert(!sql.includes('JOIN transactions'));
    }
    assert.equal(committed, 2);
    await assert.rejects(() => referralInvitees('1 OR 1=1'));
  } finally { db.getConnection = original; }
});

test('Issuing a referral link preserves existing codes and rejects missing users', async () => {
  const original = db.execute;
  const calls = [];
  db.execute = async (sql, args) => {
    calls.push({ sql, args });
    return sql.startsWith('SELECT') ? [[{ code: 'EXISTING' }]] : [{ affectedRows: 0 }];
  };
  try {
    assert.equal(makeReferralCode(7), 'GBL000007');
    assert.deepEqual(await issueReferralLink(7), { code: 'EXISTING' });
    assert(calls[0].sql.includes('referral_code IS NULL'));
    await assert.rejects(() => issueReferralLink('0'));
    db.execute = async sql => sql.startsWith('SELECT') ? [[]] : [{ affectedRows: 0 }];
    await assert.rejects(() => issueReferralLink(999), error => error.status === 404);
  } finally { db.execute = original; await db.end(); }
});
