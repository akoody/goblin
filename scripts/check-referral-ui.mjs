import { chromium } from '/Users/vladislav/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const email = (fs.readFileSync('.env', 'utf8').match(/^VITE_ADMIN_EMAILS=(.*)$/m)?.[1] || '').replace(/^['"]|['"]$/g, '').split(/[,;\n]/)[0].trim();
const base = process.env.ADMIN_UI_BASE || 'http://127.0.0.1:5178';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript(() => localStorage.setItem('token', 'mock-admin-ui'));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      if (!/^\/(admin|api|support|payment-methods|wallets|referrals|processing|exchange|order|deal)\//.test(path)) return route.continue();
      let data = [];
      if (path === '/api/market-app/session') data = { token: null };
      if (path === '/api/auth/me') data = { id: 1, email, username: 'QA admin', wallets: [] };
      if (path === '/api/features' || path === '/admin/features') data = { p2p: true, market: true, guarantor: true };
      if (path === '/admin/login-ips') data = { rows: [], total: 0, unread: 0 };
      const amounts = [{ currency: 'USDT', gross: '17.000000000000000000', fee: '2.000000', net: '15.000000', pending: '5', blocked: '3' }];
      if (path === '/admin/referrals') data = { page: 1, pageSize: 25, total: url.searchParams.get('q') === 'missing' ? 0 : 1, rows: url.searchParams.get('q') === 'missing' ? [] : [{ id: 7, username: 'inviter', email: 'inviter@example.test', code: 'GBL000007', invitedCount: 2, amounts }] };
      if (path === '/admin/referrals/7/invitees') data = { page: 1, total: 1, rows: [{ id: 8, username: 'invited-person', email: 'invited@example.test', createdAt: new Date().toISOString(), amounts }] };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(base + '/admin');
    await page.getByRole('button', { name: 'Приглашения', exact: true }).click();
    await page.getByText('inviter · #7').waitFor();
    await page.getByText('Зачислено: 15', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Приглашённые #7', exact: true }).click();
    await page.getByText('invited-person · #8').waitFor();
    await page.getByRole('button', { name: 'Скопировать ссылку', exact: true }).click();
    await page.getByText(/\/signin\?ref=GBL000007/).waitFor();
    await page.getByRole('searchbox').fill('missing');
    await page.getByText('Ничего не найдено', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.deepEqual(errors, []);
    await context.close();
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/api/market-app/session', route => route.fulfill({ json: { token: null } }));
  await page.route('**/api/features', route => route.fulfill({ json: {} }));
  await page.goto(base + '/?ref=GBL000007');
  await page.waitForFunction(() => !!localStorage.getItem('goblin.referral'));
  await page.goto(base + '/signin');
  await page.locator('[name="referralCode"]').waitFor();
  assert.equal(await page.locator('[name="referralCode"]').inputValue(), 'GBL000007');
  await context.close();
  console.log('PASS referral UI at 320/390/768/1440px and invitation persistence across navigation (mocked API, no real registrations or writes).');
} finally { await browser.close(); }
