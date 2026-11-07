ALTER TABLE treasury_collection_policy
 ADD COLUMN scan_cursor BIGINT UNSIGNED NOT NULL DEFAULT 0,
 ADD COLUMN minimum_source_amount DECIMAL(36,9) NOT NULL DEFAULT 1,
 ADD COLUMN maximum_network_fee DECIMAL(36,9) NOT NULL DEFAULT 1;
UPDATE treasury_collection_policy SET minimum_source_amount=25,maximum_network_fee=100 WHERE network='TRON';
UPDATE treasury_collection_policy SET minimum_source_amount=0.05,maximum_network_fee=0.0001 WHERE network='SOLANA';
CREATE TABLE treasury_collection_plans (
 id CHAR(36) PRIMARY KEY, network VARCHAR(16) NOT NULL, actor_id BIGINT UNSIGNED NULL,
 request_key VARCHAR(128) NOT NULL UNIQUE, status VARCHAR(16) NOT NULL DEFAULT 'preview',
 policy_json JSON NOT NULL, entries_json JSON NOT NULL,
 expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE treasury_collection_jobs (
 id CHAR(36) PRIMARY KEY, plan_id CHAR(36) NOT NULL, network VARCHAR(16) NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL, wallet_id BIGINT UNSIGNED NOT NULL,
 source_address VARCHAR(128) NOT NULL, destination_address VARCHAR(128) NOT NULL,
 amount DECIMAL(36,9) NOT NULL, fee_budget DECIMAL(36,9) NOT NULL,
 fee_charged DECIMAL(36,9) NULL, received DECIMAL(36,9) NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'preparing',
 active_slot VARCHAR(80) NULL UNIQUE,
 tx_hash VARCHAR(128) NULL UNIQUE, signed_transaction MEDIUMTEXT NULL,
 expiry_height BIGINT NULL, expiry_time BIGINT NULL,
 error_code VARCHAR(80) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_collection_plan_source(plan_id,wallet_id), KEY idx_collection_jobs(status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE wallets ADD COLUMN collection_lock_id CHAR(36) NULL;
CREATE TRIGGER wallets_collection_guard BEFORE UPDATE ON wallets FOR EACH ROW
BEGIN
 IF OLD.collection_lock_id IS NOT NULL AND (
 NOT(NEW.balance <=> OLD.balance) OR NOT(NEW.locked_balance <=> OLD.locked_balance)
 OR NOT(NEW.address <=> OLD.address) OR NOT(NEW.private_key <=> OLD.private_key)) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Treasury reconciliation pending for wallet';
 END IF;
END;
