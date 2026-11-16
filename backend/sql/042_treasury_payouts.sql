CREATE TABLE IF NOT EXISTS treasury_payout_policy (
 currency VARCHAR(8) PRIMARY KEY,
 mode VARCHAR(16) NOT NULL DEFAULT 'manual',
 destination VARCHAR(128) NOT NULL DEFAULT '',
 threshold_amount DECIMAL(36,18) NOT NULL,
 maximum_amount DECIMAL(36,18) NOT NULL,
 maximum_fee DECIMAL(36,18) NOT NULL,
 gas_reserve DECIMAL(36,18) NOT NULL DEFAULT 0,
 cooldown_seconds INT NOT NULL DEFAULT 3600,
 revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
 updated_by BIGINT UNSIGNED NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE treasury_payout_policy CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
INSERT IGNORE INTO treasury_payout_policy(currency,threshold_amount,maximum_amount,maximum_fee,gas_reserve)
 VALUES('USDT',100,1000,100,10),('SOL',1,10,0.0001,0.001),('BTC',0.001,0.1,0.0001,0),('ETH',0.05,1,0.002,0.001);
UPDATE treasury_payout_policy p JOIN treasury_auto_withdrawal_policy old ON BINARY old.currency=BINARY p.currency
 SET p.destination=COALESCE(old.destination_address,''),p.threshold_amount=old.threshold_amount,
 p.maximum_amount=GREATEST(p.maximum_amount,old.threshold_amount)
 WHERE p.currency='USDT';
CREATE TABLE IF NOT EXISTS treasury_payouts (
 id CHAR(36) PRIMARY KEY,
 currency VARCHAR(8) NOT NULL,
 actor_id BIGINT UNSIGNED NULL,
 request_key VARCHAR(128) NOT NULL UNIQUE,
 status VARCHAR(24) NOT NULL DEFAULT 'preview',
 active_currency VARCHAR(8) NULL UNIQUE,
 policy_revision BIGINT UNSIGNED NOT NULL,
 destination VARCHAR(128) NOT NULL,
 gross_amount DECIMAL(36,18) NOT NULL,
 received_amount DECIMAL(36,18) NULL,
 fee_budget DECIMAL(36,18) NOT NULL,
 fee_charged DECIMAL(36,18) NULL,
 plan_json JSON NOT NULL,
 signed_transaction MEDIUMTEXT NULL,
 tx_hash VARCHAR(128) NULL UNIQUE,
 error_code VARCHAR(80) NULL,
 expires_at TIMESTAMP NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX payout_status (status,updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
