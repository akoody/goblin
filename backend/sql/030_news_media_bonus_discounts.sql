ALTER TABLE fee_bonuses ADD COLUMN discount_percent DECIMAL(5,2) NOT NULL DEFAULT 100;
ALTER TABLE p2p_fee_ledger MODIFY fee_percent DECIMAL(10,6) NOT NULL;
ALTER TABLE commerce_guarantor_fee_ledger MODIFY fee_percent DECIMAL(10,6) NOT NULL;
CREATE TABLE bonus_issue_batches (
 actor_id BIGINT UNSIGNED NOT NULL, request_key VARCHAR(128) NOT NULL,
 payload_json JSON NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(actor_id,request_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE site_media (
 id CHAR(36) PRIMARY KEY, mime VARCHAR(64) NOT NULL, filename VARCHAR(200) NOT NULL,
 size_bytes INT UNSIGNED NOT NULL, uploaded_by BIGINT UNSIGNED NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE site_article_media (
 article_id BIGINT UNSIGNED NOT NULL, media_id CHAR(36) NOT NULL, position INT NOT NULL,
 PRIMARY KEY(article_id,media_id),
 FOREIGN KEY(article_id) REFERENCES site_articles(id), FOREIGN KEY(media_id) REFERENCES site_media(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
