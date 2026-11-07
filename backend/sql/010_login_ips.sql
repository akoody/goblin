CREATE TABLE IF NOT EXISTS user_login_ips (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    ip VARCHAR(45) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    previous_ip VARCHAR(45) NULL,
    user_agent VARCHAR(512) NOT NULL DEFAULT '',
    first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    login_count BIGINT UNSIGNED NOT NULL DEFAULT 1,
    is_new_ip TINYINT(1) NOT NULL DEFAULT 0,
    reviewed_at TIMESTAMP NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_login_ip (user_id, ip),
    KEY idx_login_ip_alerts (is_new_ip, reviewed_at, first_seen_at),
    CONSTRAINT fk_login_ip_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
