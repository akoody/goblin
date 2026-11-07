CREATE TABLE IF NOT EXISTS market_catalog (
 slug VARCHAR(100) PRIMARY KEY, name VARCHAR(120) NOT NULL, family VARCHAR(30) NOT NULL,
 sections JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS market_wallets (
 user_id BIGINT UNSIGNED PRIMARY KEY, balance DECIMAL(20,2) NOT NULL DEFAULT 0,
 CONSTRAINT fk_market_wallet_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS market_listings (
 id CHAR(36) PRIMARY KEY, seller_id BIGINT UNSIGNED NOT NULL, category VARCHAR(100) NOT NULL,
 section VARCHAR(120) NOT NULL, title VARCHAR(120) NOT NULL, description TEXT NOT NULL,
 delivery_note TEXT NOT NULL, price DECIMAL(20,2) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY idx_market_listing (category,status,created_at),
 CONSTRAINT fk_market_listing_user FOREIGN KEY (seller_id) REFERENCES users(id),
 CONSTRAINT fk_market_listing_category FOREIGN KEY (category) REFERENCES market_catalog(slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS commerce_deals (
 id CHAR(36) PRIMARY KEY, kind VARCHAR(16) NOT NULL, currency VARCHAR(8) NOT NULL,
 creator_id BIGINT UNSIGNED NOT NULL, buyer_id BIGINT UNSIGNED NULL, seller_id BIGINT UNSIGNED NULL,
 listing_id CHAR(36) NULL, title VARCHAR(120) NOT NULL, terms TEXT NOT NULL,
 amount DECIMAL(26,6) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'WAITING',
 request_key CHAR(36) NOT NULL, funded_at TIMESTAMP(6) NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_commerce_request (creator_id,request_key),
 KEY idx_commerce_buyer (buyer_id,updated_at), KEY idx_commerce_seller (seller_id,updated_at),
 KEY idx_commerce_status (status,updated_at),
 CONSTRAINT fk_commerce_creator FOREIGN KEY (creator_id) REFERENCES users(id),
 CONSTRAINT fk_commerce_buyer FOREIGN KEY (buyer_id) REFERENCES users(id),
 CONSTRAINT fk_commerce_seller FOREIGN KEY (seller_id) REFERENCES users(id),
 CONSTRAINT fk_commerce_listing FOREIGN KEY (listing_id) REFERENCES market_listings(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS commerce_messages (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, deal_id CHAR(36) NOT NULL,
 sender_id BIGINT UNSIGNED NOT NULL, text TEXT NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), KEY idx_commerce_chat (deal_id,id),
 CONSTRAINT fk_commerce_message_deal FOREIGN KEY (deal_id) REFERENCES commerce_deals(id),
 CONSTRAINT fk_commerce_message_user FOREIGN KEY (sender_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS commerce_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, deal_id CHAR(36) NOT NULL,
 actor_id BIGINT UNSIGNED NOT NULL, action VARCHAR(24) NOT NULL, note VARCHAR(2000) NOT NULL DEFAULT '',
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), KEY idx_commerce_event (deal_id,id),
 CONSTRAINT fk_commerce_event_deal FOREIGN KEY (deal_id) REFERENCES commerce_deals(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS market_payments (
 id CHAR(36) PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL, kind VARCHAR(16) NOT NULL,
 amount DECIMAL(20,2) NOT NULL, details VARCHAR(1000) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
 reviewer_id BIGINT UNSIGNED NULL, review_note VARCHAR(1000) NOT NULL DEFAULT '',
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 reviewed_at TIMESTAMP(6) NULL, KEY idx_market_payment (status,created_at),
 CONSTRAINT fk_market_payment_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS commerce_ledger (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL,
 currency VARCHAR(8) NOT NULL, amount DECIMAL(26,6) NOT NULL, reference_id CHAR(36) NOT NULL,
 operation VARCHAR(24) NOT NULL, created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_commerce_ledger (user_id,reference_id,operation), KEY idx_commerce_ledger_user (user_id,id),
 CONSTRAINT fk_commerce_ledger_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
