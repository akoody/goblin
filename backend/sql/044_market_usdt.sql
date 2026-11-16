CREATE TABLE IF NOT EXISTS market_usdt_transfers (
 user_id BIGINT UNSIGNED NOT NULL,
 request_key CHAR(36) NOT NULL,
 direction ENUM('TO_MARKET','TO_EXCHANGE') NOT NULL,
 amount DECIMAL(26,6) NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY (user_id, request_key),
 KEY idx_market_usdt_history (user_id, created_at),
 CONSTRAINT fk_market_usdt_transfer_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @market_usdt_column = IF(
 EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='market_wallets' AND column_name='usdt_balance'),
 'DO 0',
 'ALTER TABLE market_wallets ADD COLUMN usdt_balance DECIMAL(26,6) NOT NULL DEFAULT 0'
);
PREPARE market_usdt_migration FROM @market_usdt_column;
EXECUTE market_usdt_migration;
DEALLOCATE PREPARE market_usdt_migration;
