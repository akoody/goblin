ALTER TABLE commerce_policy
  ADD COLUMN p2p_fee_percent DECIMAL(5,2) NOT NULL DEFAULT 5.00;

ALTER TABLE commerce_policy_audit
  ADD COLUMN previous_p2p_fee_percent DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  ADD COLUMN new_p2p_fee_percent DECIMAL(5,2) NOT NULL DEFAULT 5.00;

-- Old/open trades keep a zero snapshot. Only trades opened after this rollout
-- receive the configured fee, so no existing customer balance is repriced.
ALTER TABLE deals
  ADD COLUMN p2p_fee_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00;

CREATE TABLE IF NOT EXISTS p2p_fee_ledger (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  deal_id BIGINT UNSIGNED NOT NULL UNIQUE,
  seller_id BIGINT UNSIGNED NOT NULL,
  gross_amount DECIMAL(36,18) NOT NULL,
  fee_percent DECIMAL(5,2) NOT NULL,
  fee_amount DECIMAL(36,18) NOT NULL,
  net_amount DECIMAL(36,18) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_p2p_fee_deal FOREIGN KEY (deal_id) REFERENCES deals(id),
  CONSTRAINT fk_p2p_fee_seller FOREIGN KEY (seller_id) REFERENCES users(id),
  KEY idx_p2p_fee_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
