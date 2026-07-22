SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    username VARCHAR(64) NOT NULL,
    email VARCHAR(255) NULL,
    password_hash VARCHAR(255) NOT NULL,
    referral_code VARCHAR(32) NULL,
    referred_by BIGINT UNSIGNED NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    deposits_enabled TINYINT(1) NOT NULL DEFAULT 1,
    withdrawals_enabled TINYINT(1) NOT NULL DEFAULT 1,
    internal_transfers_enabled TINYINT(1) NOT NULL DEFAULT 1,
    p2p_enabled TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_username (username),
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_referral_code (referral_code),
    KEY idx_users_referred_by (referred_by),
    CONSTRAINT fk_users_referrer FOREIGN KEY (referred_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallets (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    currency VARCHAR(16) NOT NULL,
    balance DECIMAL(36,18) NOT NULL DEFAULT 0,
    locked_balance DECIMAL(36,18) NOT NULL DEFAULT 0,
    address VARCHAR(255) NULL,
    private_key TEXT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_wallet_user_currency (user_id, currency),
    UNIQUE KEY uq_wallet_address (address),
    CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_method_definitions (
    code VARCHAR(64) NOT NULL,
    name VARCHAR(120) NOT NULL,
    short_name VARCHAR(32) NOT NULL,
    group_name VARCHAR(32) NOT NULL DEFAULT 'banks',
    tone VARCHAR(32) NOT NULL DEFAULT '#21a038',
    description VARCHAR(500) NOT NULL DEFAULT '',
    speed VARCHAR(80) NOT NULL DEFAULT '',
    fields JSON NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_payment_methods (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    method_name VARCHAR(64) NOT NULL,
    details JSON NOT NULL,
    label VARCHAR(120) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_user_payment_methods_user (user_id),
    CONSTRAINT fk_user_payment_method_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    type VARCHAR(16) NOT NULL,
    amount DECIMAL(36,18) NOT NULL,
    filled_amount DECIMAL(36,18) NOT NULL DEFAULT 0,
    price DECIMAL(36,18) NOT NULL,
    min_limit DECIMAL(36,18) NOT NULL,
    max_limit DECIMAL(36,18) NOT NULL,
    payment_methods JSON NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_orders_user (user_id),
    KEY idx_orders_status_created (status, created_at),
    CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deals (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    buyer_id BIGINT UNSIGNED NOT NULL,
    seller_id BIGINT UNSIGNED NOT NULL,
    crypto_amount DECIMAL(36,18) NOT NULL,
    fiat_amount DECIMAL(36,18) NOT NULL,
    price DECIMAL(36,18) NOT NULL,
    payment_method VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'AWAITING_PAYMENT',
    crypto_locked TINYINT(1) NOT NULL DEFAULT 0,
    transferred TINYINT(1) NOT NULL DEFAULT 0,
    cancel_reason VARCHAR(500) NULL,
    expires_at DATETIME NULL,
    paid_at DATETIME NULL,
    completed_at DATETIME NULL,
    cancelled_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_deals_order (order_id),
    KEY idx_deals_buyer (buyer_id),
    KEY idx_deals_seller (seller_id),
    CONSTRAINT fk_deal_order FOREIGN KEY (order_id) REFERENCES orders (id),
    CONSTRAINT fk_deal_buyer FOREIGN KEY (buyer_id) REFERENCES users (id),
    CONSTRAINT fk_deal_seller FOREIGN KEY (seller_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transactions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    wallet_id BIGINT UNSIGNED NULL,
    tx_hash VARCHAR(255) NULL,
    from_address VARCHAR(255) NULL,
    to_address VARCHAR(255) NULL,
    amount DECIMAL(36,18) NOT NULL,
    currency VARCHAR(16) NOT NULL,
    type VARCHAR(24) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_transactions_wallet (wallet_id),
    KEY idx_transactions_created (created_at),
    CONSTRAINT fk_transaction_wallet FOREIGN KEY (wallet_id) REFERENCES wallets (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exchange_wallets (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    currency VARCHAR(16) NOT NULL,
    address VARCHAR(255) NULL,
    balance DECIMAL(36,18) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_exchange_wallet_currency (currency)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(36) NOT NULL,
    deal_id BIGINT UNSIGNED NOT NULL,
    sender_id BIGINT UNSIGNED NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_messages_deal_created (deal_id, created_at),
    CONSTRAINT fk_message_deal FOREIGN KEY (deal_id) REFERENCES deals (id),
    CONSTRAINT fk_message_sender FOREIGN KEY (sender_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_tickets (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    subject VARCHAR(180) NOT NULL,
    category VARCHAR(64) NOT NULL DEFAULT 'account',
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    last_client_read_at DATETIME NULL,
    last_operator_read_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_support_tickets_user (user_id),
    KEY idx_support_tickets_status_updated (status, updated_at),
    CONSTRAINT fk_support_ticket_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_messages (
    seq BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    id VARCHAR(36) NULL,
    ticket_id BIGINT UNSIGNED NOT NULL,
    sender_id BIGINT UNSIGNED NOT NULL,
    text TEXT NOT NULL,
    sender_role VARCHAR(20) NULL,
    role VARCHAR(20) NULL,
    read_by_operator TINYINT(1) NOT NULL DEFAULT 0,
    read_by_user TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (seq),
    UNIQUE KEY uq_support_message_id (id),
    KEY idx_support_messages_ticket_created (ticket_id, created_at),
    CONSTRAINT fk_support_message_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets (id),
    CONSTRAINT fk_support_message_sender FOREIGN KEY (sender_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS referral_rewards (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    referrer_id BIGINT UNSIGNED NOT NULL,
    referred_user_id BIGINT UNSIGNED NULL,
    amount DECIMAL(36,18) NOT NULL DEFAULT 0,
    currency VARCHAR(16) NOT NULL DEFAULT 'USDT',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_referral_rewards_referrer (referrer_id),
    CONSTRAINT fk_referral_reward_referrer FOREIGN KEY (referrer_id) REFERENCES users (id),
    CONSTRAINT fk_referral_reward_user FOREIGN KEY (referred_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO payment_method_definitions
    (code, name, short_name, group_name, tone, description, speed, fields, active, sort_order)
VALUES
    ('sber', 'Сбербанк', 'Сбер', 'banks', '#21a038', 'Перевод по номеру телефона или карты', 'обычно 1-10 мин.', JSON_ARRAY(JSON_OBJECT('key', 'phone', 'label', 'Номер телефона', 'required', true, 'minLength', 10, 'maxLength', 20)), 1, 10),
    ('tbank', 'Т-Банк', 'Т-Банк', 'banks', '#ffdd2d', 'Перевод по номеру телефона или карты', 'обычно 1-10 мин.', JSON_ARRAY(JSON_OBJECT('key', 'phone', 'label', 'Номер телефона', 'required', true, 'minLength', 10, 'maxLength', 20)), 1, 20),
    ('sbp', 'СБП', 'СБП', 'banks', '#1677ff', 'Перевод через Систему быстрых платежей', 'обычно 1-5 мин.', JSON_ARRAY(JSON_OBJECT('key', 'phone', 'label', 'Номер телефона', 'required', true, 'minLength', 10, 'maxLength', 20), JSON_OBJECT('key', 'bank', 'label', 'Банк', 'required', true, 'minLength', 2, 'maxLength', 120)), 1, 30),
    ('cash', 'Наличные', 'Наличные', 'cash', '#6b7280', 'Расчёт наличными по согласованию сторон', 'по договорённости', JSON_ARRAY(JSON_OBJECT('key', 'city', 'label', 'Город', 'required', true, 'minLength', 2, 'maxLength', 120)), 1, 40)
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    short_name = VALUES(short_name),
    fields = VALUES(fields);
