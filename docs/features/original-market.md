# Original marketplace integration

The original `kworkSite` Next.js application lives in `apps/market`, served by
`goblin-market` on loopback 8081 through `/market`. Its catalog, section tables,
offer detail, selling forms, purchases/sales, chats, projects, wallet, profile,
settings, support and admin screens retain the source layout and styling.
The source project and Telegram bot are not modified.

Exchange JWT authentication is shared using the HttpOnly
`goblin_market_session` cookie. Login and registration use the exchange backend;
accounts are never matched by display name. The existing exchange token-version
and account-status checks remain authoritative. Admin access uses ADMIN_EMAILS,
not the prototype's separate plaintext admin password.

Original marketplace domain functions run in a MySQL-backed, row-locked
aggregate (`market_application_state`, migration 014). Its JSON date contract is
preserved by the typed server-only RPC adapter. Public RPCs, own-account reads,
conversation participation and administrative writes have separate allowlists.
Passwords, automatic stock and after-payment instructions are excluded from
public responses. No demonstration accounts, orders or money are imported.

`market_wallets` remains the authoritative RUB available balance. Original
orders and project budgets reserve RUB immediately. Completion pays the seller
exactly once, refund returns the buyer's reserve; disputes prevent customer
completion. Existing native commerce records and USDT escrow remain intact.
Automatic delivery removes stock and sends purchased codes only to the order
conversation. Ratings are not fabricated for new sellers.

Prototype self-credit forms were replaced with pending payment requests.
Administrators verify actual receipts or make actual withdrawals through
`/manage/commerce`; requesting a deposit never credits money automatically.
Currency selection retains the source project's display conversion rates;
settlement is always RUB, not a live foreign-exchange operation.

Checks: root Vite build, Next production build, backend `npm test`, production
dependency audit, and opt-in `MARKET_DB_CHECK=1 node scripts/check-market-app.js`.
The latter uses disposable accounts and removes their aggregate/SQL records in
finally. `MARKET_UI_FIXTURE=/root/market-ui-fixture.json` pauses cleanup while UI
checks run; the fixture contains temporary tokens and must be removed afterward.

Browser checks cover 104 original-screen/viewport combinations at 320, 360,
390, 430, 768, 1024, 1440 and 1920 px. Separate live browser actions check actual
publication, purchase, order chat, buyer confirmation, pending deposit and
shared login/logout. These do not transfer real customer funds.

The aggregate serializes marketplace operations. This is compatible with the
original domain but is not a high-throughput marketplace storage architecture;
normalize heavy collections before substantial traffic growth. Back up the
SQL aggregate alongside exchange tables. Source files under `backend/market-source`
compile with `node scripts/prepare-market.mjs`; do not edit generated runtime.

Deployment: back up current build/backend/nginx, install locked market deps,
build on Linux, migrate/restart backend, start `goblin-market` with
`MARKET_BACKEND_ORIGIN=http://127.0.0.1:3000 COOKIE_SECURE=true`, run checks, then
apply nginx locations using `scripts/deploy-original-market.remote.mjs`. Keep
old build/assets while active clients finish. Rollback routing and application
files only; never remove tables holding real orders/reserves.

Current production release: `/root/goblin-market-design-20261016/.next/standalone`,
PM2 `goblin-market`, loopback 8081. Build new releases in a separate directory
before switching processes; never rebuild inside the running standalone tree.
Next automatically applies basePath to redirects. Only raw HTML form actions
and cache invalidation paths need the explicit `/market` prefix.
