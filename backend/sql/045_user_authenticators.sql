CREATE TABLE IF NOT EXISTS user_authenticators (
 user_id BIGINT UNSIGNED PRIMARY KEY,
 secret_cipher VARBINARY(64) NOT NULL,
 enabled TINYINT(1) NOT NULL DEFAULT 0,
 setup_expires_at BIGINT UNSIGNED NULL,
 setup_version BIGINT UNSIGNED NULL,
 last_counter BIGINT UNSIGNED NULL,
 recovery_hashes JSON NULL,
 failed_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
 blocked_until BIGINT UNSIGNED NOT NULL DEFAULT 0,
 challenge_hash BINARY(32) NULL UNIQUE,
 challenge_expires_at BIGINT UNSIGNED NULL,
 challenge_version BIGINT UNSIGNED NULL,
 challenge_device VARCHAR(80) NULL,
 CONSTRAINT fk_user_authenticator FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
