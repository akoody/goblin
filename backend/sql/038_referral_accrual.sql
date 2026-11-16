CREATE TABLE referral_commission_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_kind VARCHAR(24) NOT NULL,
  source_id VARCHAR(80) NOT NULL,
  payer_id BIGINT UNSIGNED NOT NULL,
  source_user_id BIGINT UNSIGNED NOT NULL,
  referrer_id BIGINT UNSIGNED NULL,
  currency VARCHAR(16) NOT NULL,
  fee_amount DECIMAL(36,18) NOT NULL,
  rate_percent DECIMAL(5,2) NOT NULL,
  reward_amount DECIMAL(36,18) NOT NULL,
  status ENUM('pending','credited','skipped') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  credited_at TIMESTAMP NULL,
  next_attempt_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  last_error VARCHAR(64) NULL,
  UNIQUE KEY uq_referral_source (source_kind,source_id),
  KEY idx_referral_pending (status,next_attempt_at,id),
  KEY idx_referral_custody_source (source_user_id,currency),
  KEY idx_referral_custody_recipient (referrer_id,currency),
  CONSTRAINT chk_referral_event_amount CHECK (fee_amount >= 0 AND reward_amount >= 0 AND reward_amount <= fee_amount),
  CONSTRAINT chk_referral_event_rate CHECK (rate_percent BETWEEN 0 AND 100)
);

ALTER TABLE referral_rewards
  ADD COLUMN event_id BIGINT UNSIGNED NULL,
  ADD UNIQUE KEY uq_referral_reward_event (event_id),
  ADD CONSTRAINT fk_referral_reward_event FOREIGN KEY (event_id) REFERENCES referral_commission_events(id);
