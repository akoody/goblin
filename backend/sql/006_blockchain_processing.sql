CREATE TABLE IF NOT EXISTS blockchain_deposits (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    wallet_id BIGINT UNSIGNED NOT NULL,
    network VARCHAR(32) NOT NULL,
    currency VARCHAR(16) NOT NULL,
    tx_hash VARCHAR(255) NOT NULL,
    event_index INT NOT NULL DEFAULT 0,
    from_address VARCHAR(255) NULL,
    to_address VARCHAR(255) NOT NULL,
    amount DECIMAL(36,18) NOT NULL,
    block_timestamp BIGINT UNSIGNED NOT NULL,
    credited_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_blockchain_deposit (network, currency, tx_hash, event_index),
    KEY idx_blockchain_deposit_wallet (wallet_id, credited_at),
    CONSTRAINT fk_blockchain_deposit_wallet FOREIGN KEY (wallet_id) REFERENCES wallets (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS blockchain_scan_state (
    wallet_id BIGINT UNSIGNED NOT NULL,
    currency VARCHAR(16) NOT NULL,
    last_block_timestamp BIGINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (wallet_id, currency),
    CONSTRAINT fk_blockchain_scan_wallet FOREIGN KEY (wallet_id) REFERENCES wallets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crypto_withdrawals (
    id CHAR(36) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    wallet_id BIGINT UNSIGNED NOT NULL,
    fee_wallet_id BIGINT UNSIGNED NULL,
    network VARCHAR(32) NOT NULL,
    currency VARCHAR(16) NOT NULL,
    to_address VARCHAR(255) NOT NULL,
    amount DECIMAL(36,18) NOT NULL,
    fee_currency VARCHAR(16) NULL,
    fee_reserved DECIMAL(36,18) NOT NULL DEFAULT 0,
    fee_charged DECIMAL(36,18) NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL,
    tx_hash VARCHAR(255) NULL,
    signed_transaction JSON NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    error_message VARCHAR(1000) NULL,
    broadcast_at DATETIME NULL,
    confirmed_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_crypto_withdrawal_idempotency (user_id, idempotency_key),
    UNIQUE KEY uq_crypto_withdrawal_tx (network, tx_hash),
    KEY idx_crypto_withdrawal_status (status, updated_at),
    CONSTRAINT fk_crypto_withdrawal_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_crypto_withdrawal_wallet FOREIGN KEY (wallet_id) REFERENCES wallets (id),
    CONSTRAINT fk_crypto_withdrawal_fee_wallet FOREIGN KEY (fee_wallet_id) REFERENCES wallets (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
