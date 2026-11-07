ALTER TABLE users
    ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER password_hash;

ALTER TABLE transactions
    ADD COLUMN idempotency_key VARCHAR(128) NULL AFTER type,
    ADD UNIQUE KEY uq_transactions_wallet_idempotency (wallet_id, idempotency_key);
