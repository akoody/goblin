CREATE TABLE IF NOT EXISTS commerce_policy (
  id TINYINT UNSIGNED PRIMARY KEY,
  guarantor_fee_percent DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO commerce_policy (id,guarantor_fee_percent) VALUES (1,5.00);

ALTER TABLE commerce_deals
  ADD COLUMN guarantor_fee_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00;

-- Earlier escrow reservations debited balance without using locked_balance.
-- Restore those active reserves into the shared lock model before new code runs.
UPDATE wallets w
JOIN (
  SELECT buyer_id AS user_id, SUM(amount) AS held_amount
  FROM commerce_deals
  WHERE kind='ESCROW' AND currency='USDT' AND funded_at IS NOT NULL
    AND status IN ('FUNDED','DELIVERED','DISPUTED')
  GROUP BY buyer_id
) held ON held.user_id=w.user_id AND w.currency='USDT'
SET w.balance=w.balance+held.held_amount,
    w.locked_balance=COALESCE(w.locked_balance,0)+held.held_amount;

-- P2P historically deducted active deal amounts from balance and also counted
-- them as locked. Restore the total balance while preserving their existing lock.
UPDATE wallets w
JOIN (
  SELECT seller_id AS user_id, SUM(crypto_amount) AS held_amount
  FROM deals
  WHERE crypto_locked=1 AND transferred=0 AND status NOT IN ('COMPLETED','CANCELLED')
  GROUP BY seller_id
) held ON held.user_id=w.user_id AND w.currency='USDT'
SET w.balance=w.balance+held.held_amount;

CREATE TABLE IF NOT EXISTS commerce_guarantor_fee_ledger (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  deal_id CHAR(36) NOT NULL UNIQUE,
  seller_id BIGINT UNSIGNED NOT NULL,
  gross_amount DECIMAL(26,6) NOT NULL,
  fee_percent DECIMAL(5,2) NOT NULL,
  fee_amount DECIMAL(26,6) NOT NULL,
  net_amount DECIMAL(26,6) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_guarantor_fee_deal FOREIGN KEY (deal_id) REFERENCES commerce_deals(id),
  CONSTRAINT fk_guarantor_fee_seller FOREIGN KEY (seller_id) REFERENCES users(id),
  KEY idx_guarantor_fee_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS commerce_policy_audit (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id BIGINT UNSIGNED NOT NULL,
  previous_fee_percent DECIMAL(5,2) NOT NULL,
  new_fee_percent DECIMAL(5,2) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_commerce_policy_audit_user FOREIGN KEY (actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
