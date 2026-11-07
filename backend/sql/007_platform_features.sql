CREATE TABLE IF NOT EXISTS platform_features (
    feature_key VARCHAR(32) NOT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (feature_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO platform_features (feature_key, enabled)
VALUES ('p2p', 1), ('processing', 1), ('nft', 1)
ON DUPLICATE KEY UPDATE feature_key = VALUES(feature_key);
