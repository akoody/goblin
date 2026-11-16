import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { db } from '../src/config/db.js';
import adminRoutes from '../src/routes/admin.routes.js';
import { incomeReportFilter, reconcile, incomeReport, incomeReportCsv, INCOME_KINDS } from '../src/services/platform-income-report.service.js';

test('Income report filters are validated and only bound as parameters', () => {
  const filter = incomeReportFilter({ kind: 'P2P_FEE', direction: 'IN', currency: 'usdt', from: '2026-11-01', to: '2026-11-16', q: '50%_!', page: '2' });
  assert.equal(filter.page, 2);
  assert.deepEqual(filter.params.slice(0, 5), ['P2P_FEE', 'IN', 'USDT', '2026-11-01 00:00:00', '2026-11-16 00:00:00']);
  assert.equal(filter.params[7], '%50!%!_!!%', 'спецсимволы LIKE экранированы');
  assert(!filter.where.includes('50%'), 'текст поиска не попадает в SQL');
  assert.equal(incomeReportFilter({ q: '#42' }).params[0], '42');
  assert.equal(incomeReportFilter({ q: 'kolpikl' }).params[0], -1, 'не число: по id не ищем');
  for (const bad of [{ kind: 'DROP' }, { kind: "P2P_FEE' OR 1=1" }, { direction: 'SIDEWAYS' }, { currency: 'US D' }, { from: '2026-1-1' }, { to: "2026-11-16' --" },
    { page: 0 }, { page: '1 OR 1=1' }, { page: 1.5 }, { q: {} }, { q: 'x'.repeat(101) }]) assert.throws(() => incomeReportFilter(bad), JSON.stringify(bad));
  assert.equal(incomeReportFilter({}).where, '');
});

test('Reconciliation compares the treasury with the ledgers exactly, per currency', () => {
  const rows = reconcile(
    [
      { currency: 'USDT', direction: 'IN', total: '3.000000000000000001' },
      { currency: 'USDT', direction: 'OUT', total: '0.7' },
      { currency: 'ETH', direction: 'IN', total: '0.001' },
      { currency: 'ETH', direction: 'OUT', total: '0.0003' },
    ],
    [{ currency: 'USDT', balance: '2.300000000000000001' }, { currency: 'ETH', balance: '0.0008' }, { currency: 'TRX', balance: '5' }],
  );
  const by = Object.fromEntries(rows.map(row => [row.currency, row]));
  assert.equal(by.USDT.matches, true); assert.equal(by.USDT.ledgerNet, '2.300000000000000001');
  assert.equal(by.ETH.matches, false); assert.equal(by.ETH.difference, '0.0001');
  assert.equal(by.TRX.matches, false, 'остаток казны без журнала виден как расхождение'); assert.equal(by.TRX.difference, '5');
  assert.deepEqual(rows.map(row => row.currency), ['ETH', 'TRX', 'USDT']);
});

test('Income report maps rows, totals and CSV without losing precision', async () => {
  const original = db.query;
  const row = { entry_id: 'P2P_FEE:1', at: new Date('2026-11-16T12:00:00Z'), kind: 'P2P_FEE', direction: 'IN', currency: 'USDT', amount: '1.000000000000000001',
    gross: '100.000000000000000000', net: '98.999999999999999999', percent: '1.000000', user_id: 2, username: 'seller;"x"', source_type: 'P2P_DEAL', source_id: '9', details: null };
  db.query = async (sql, args) => {
    if (sql.includes('COUNT(*) AS total')) return [[{ total: 51 }]];
    if (sql.includes('GROUP BY e.kind')) return [[{ kind: 'P2P_FEE', direction: 'IN', currency: 'USDT', total: '1.000000000000000001', count: 1 }]];
    if (sql.includes('GROUP BY e.currency')) return [[{ currency: 'USDT', direction: 'IN', total: '1.000000000000000001' }]];
    if (sql.includes('FROM admin_treasury') && !sql.includes('UNION')) return [[{ currency: 'USDT', balance: '1.000000000000000001' }]];
    assert(args.includes(50) || args.includes(100000), 'размер страницы или предел CSV'); return [[row]];
  };
  try {
    const report = await incomeReport({ page: 2 });
    assert.equal(report.total, 51); assert.equal(report.rows[0].amount, '1.000000000000000001');
    assert.equal(report.rows[0].label, INCOME_KINDS.P2P_FEE.label); assert.equal(report.rows[0].userId, 2);
    assert.equal(report.reconciliation[0].matches, true); assert.equal(report.totals[0].count, 1);
    const csv = await incomeReportCsv({});
    assert(csv.startsWith('﻿')); assert(csv.includes('"seller;""x"""'), 'CSV экранирует разделитель и кавычки');
    assert(csv.includes(';1.000000000000000001;'));
  } finally { db.query = original; }
});

test('Only administrators reach the income report', async () => {
  const original = db.execute, originalQuery = db.query, originalEnv = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = 'owner@example.test';
  let email = 'helper@example.test';
  db.execute = async sql => sql.includes('FROM users') ? [[{ id: 2, email, status: 'active' }]] : [[{ permission: 'transactions' }, { permission: 'referrals' }]];
  db.query = async sql => sql.includes('COUNT(*)') ? [[{ total: 0 }]] : [[]];
  const app = express(); app.use((req, _res, next) => { req.user = { userId: 2 }; next(); }); app.use('/admin', adminRoutes);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const path of ['income-report', 'income-report.csv']) assert.equal((await fetch(`${base}/admin/${path}`)).status, 403, `хелпер: ${path}`);
    email = 'owner@example.test';
    const ok = await fetch(`${base}/admin/income-report`); assert.equal(ok.status, 200); assert.equal((await ok.json()).total, 0);
    const csv = await fetch(`${base}/admin/income-report.csv`);
    assert.equal(csv.status, 200); assert.match(csv.headers.get('content-disposition'), /goblin-income-\d{4}-\d{2}-\d{2}\.csv/);
    assert.equal((await fetch(`${base}/admin/income-report?kind=EVIL`)).status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve)); db.execute = original; db.query = originalQuery;
    if (originalEnv === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = originalEnv;
    await db.end();
  }
});
