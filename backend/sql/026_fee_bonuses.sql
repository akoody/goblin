CREATE TABLE IF NOT EXISTS fee_bonuses (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 kind VARCHAR(16) NOT NULL,
 issued_by BIGINT UNSIGNED NOT NULL,
 note VARCHAR(500) NOT NULL,
 used_deal_id VARCHAR(64) NULL,
 used_at TIMESTAMP NULL,
 revoked_at TIMESTAMP NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_bonus_available(user_id,kind,used_at,revoked_at),
 UNIQUE KEY uq_bonus_deal(kind,used_deal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
