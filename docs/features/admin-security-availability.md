# Admin security search and commerce availability

Security search accepts `q` on `GET /admin/login-ips` and searches the entire
history by username, email, account ID, current/previous IP, model and user agent.
Results remain capped at 200, with a total-match count. SQL wildcards supplied
by users are escaped and query values are parameters. Admin authorization is
unchanged. The UI debounces input and discards stale responses.

`market` and `guarantor` join the existing availability flags. Migration 015
creates enabled defaults without overwriting previously configured flags.
The marketplace Next proxy returns a no-cache 503 maintenance page; backend
RPC independently blocks non-admin operations. Guarantor API/deal routes check
the actual deal kind, never a client-provided label. Admin recovery routes remain
accessible. Existing balances and deals are not changed by availability toggles.

Validation: backend tests, both production builds, mocked admin UI at
320/390/768/1440px, and read-only production API verification. Do not toggle
global production availability just to test: exercise disabled flags against
isolated/mocked configuration and preserve current administrator choices.

## Deposit follow-up

Follow-up implementation uses pending AML holds, exact deposit-fee accounting
and an internal treasury; see `deposits-amlbot.md`. Automated provenance screening
still requires a provider API and a defined risk policy; heuristics alone must
not be presented as AML verification.

Confirmed: fees apply to every deposit; default 2 USDT-equivalent, minimum
5 USDT-equivalent; other supported assets use a fresh price quote. Treasury
is an internal multi-asset ledger, not an external on-chain wallet. Income and
user net credit settle atomically once per blockchain event after review.
Automatic AMLBot screening still needs the provider account/API contract.
Old deposits and balances are unchanged.
