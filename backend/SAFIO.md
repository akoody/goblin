# Safio deposit screening

Configure `SAFIO_API_KEY` in the backend environment and `SAFIO_START_AT` as a UTC MySQL datetime, for example `2026-10-23 00:00:00`. Only pending deposits detected on or after that timestamp are screened. Leave the key unset to disable requests. Never commit credentials.

Run `npm run migrate` before restarting the backend. The worker screens TRON sender addresses for USDT/TRX with the `screen` product. This is address screening, not transaction-specific screening. Each deposit has a stable provider idempotency key. Calls may incur the provider's Screen tariff. Product upgrades are disabled.

The worker stores the authenticated provider response and exposes status/check ID to administrators. Completed Screen reports with LOW risk, complete coverage and an allow decision automatically credit the net deposit and deposit fee in one locked database transaction. Other results remain held for manual review. Incomplete coverage or an unrecognized decision produces UNKNOWN risk. Automatic settlement uses a null reviewer ID and an explicit audit note. Duplicate processing cannot credit a settled deposit again. Existing account restrictions, deposit minimum and fee policy still apply. After five failures automatic processing stops; investigate the provider error before retrying.

Verify capabilities, billing and actual provider responses with a new restricted key before activation. Do not use a key exposed in chat. Historic deposits require an explicit start date if backfill is intended.
