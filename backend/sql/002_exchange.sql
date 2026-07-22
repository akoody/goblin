SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS trading_orders (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    market VARCHAR(16) NOT NULL,
    symbol VARCHAR(24) NOT NULL,
    side VARCHAR(8) NOT NULL,
    order_type VARCHAR(12) NOT NULL,
    price DECIMAL(36,18) NULL,
    quantity DECIMAL(36,18) NOT NULL,
    filled_quantity DECIMAL(36,18) NOT NULL DEFAULT 0,
    average_price DECIMAL(36,18) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    leverage SMALLINT UNSIGNED NULL,
    reduce_only TINYINT(1) NOT NULL DEFAULT 0,
    reserved_currency VARCHAR(16) NULL,
    reserved_amount DECIMAL(36,18) NOT NULL DEFAULT 0,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY idx_trading_orders_book (market, symbol, side, status, price, created_at),
    KEY idx_trading_orders_user (user_id, created_at),
    CONSTRAINT fk_trading_order_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trading_fills (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    market VARCHAR(16) NOT NULL,
    symbol VARCHAR(24) NOT NULL,
    maker_order_id BIGINT UNSIGNED NOT NULL,
    taker_order_id BIGINT UNSIGNED NOT NULL,
    buyer_id BIGINT UNSIGNED NOT NULL,
    seller_id BIGINT UNSIGNED NOT NULL,
    price DECIMAL(36,18) NOT NULL,
    quantity DECIMAL(36,18) NOT NULL,
    quote_amount DECIMAL(36,18) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY idx_trading_fills_market (market, symbol, created_at),
    KEY idx_trading_fills_buyer (buyer_id, created_at),
    KEY idx_trading_fills_seller (seller_id, created_at),
    CONSTRAINT fk_trading_fill_maker FOREIGN KEY (maker_order_id) REFERENCES trading_orders (id),
    CONSTRAINT fk_trading_fill_taker FOREIGN KEY (taker_order_id) REFERENCES trading_orders (id),
    CONSTRAINT fk_trading_fill_buyer FOREIGN KEY (buyer_id) REFERENCES users (id),
    CONSTRAINT fk_trading_fill_seller FOREIGN KEY (seller_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS futures_positions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    symbol VARCHAR(24) NOT NULL,
    side VARCHAR(8) NOT NULL,
    quantity DECIMAL(36,18) NOT NULL,
    entry_price DECIMAL(36,18) NOT NULL,
    margin DECIMAL(36,18) NOT NULL,
    leverage SMALLINT UNSIGNED NOT NULL,
    liquidation_price DECIMAL(36,18) NOT NULL,
    realized_pnl DECIMAL(36,18) NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    closed_at TIMESTAMP(6) NULL,
    PRIMARY KEY (id),
    KEY idx_futures_position_user (user_id, symbol, status),
    KEY idx_futures_positions_symbol (symbol, status),
    CONSTRAINT fk_futures_position_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS funding_payments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    position_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    symbol VARCHAR(24) NOT NULL,
    rate DECIMAL(18,10) NOT NULL,
    amount DECIMAL(36,18) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY idx_funding_user (user_id, created_at),
    CONSTRAINT fk_funding_position FOREIGN KEY (position_id) REFERENCES futures_positions (id),
    CONSTRAINT fk_funding_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS futures_funding_rounds (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    symbol VARCHAR(24) NOT NULL,
    funding_time DATETIME NOT NULL,
    mark_price DECIMAL(36,18) NOT NULL,
    index_price DECIMAL(36,18) NOT NULL,
    rate DECIMAL(18,10) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_funding_round (symbol, funding_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
