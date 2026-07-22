SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS nft_gifts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    slug VARCHAR(80) NOT NULL,
    name VARCHAR(120) NOT NULL,
    collection_name VARCHAR(120) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    rarity VARCHAR(24) NOT NULL DEFAULT 'COMMON',
    icon VARCHAR(32) NOT NULL,
    accent_color VARCHAR(16) NOT NULL DEFAULT '#4CA11F',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_nft_gifts_slug (slug),
    KEY idx_nft_gifts_collection (collection_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS nft_gift_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    gift_id BIGINT UNSIGNED NOT NULL,
    serial_number INT UNSIGNED NOT NULL,
    owner_id BIGINT UNSIGNED NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'MARKET',
    list_price DECIMAL(36,18) NULL,
    acquired_price DECIMAL(36,18) NULL,
    acquired_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_nft_gift_item_serial (gift_id, serial_number),
    KEY idx_nft_gift_items_market (status, list_price, gift_id),
    KEY idx_nft_gift_items_owner (owner_id, status, updated_at),
    CONSTRAINT fk_nft_gift_item_gift FOREIGN KEY (gift_id) REFERENCES nft_gifts (id),
    CONSTRAINT fk_nft_gift_item_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS nft_gift_sales (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    item_id BIGINT UNSIGNED NOT NULL,
    gift_id BIGINT UNSIGNED NOT NULL,
    seller_id BIGINT UNSIGNED NULL,
    buyer_id BIGINT UNSIGNED NOT NULL,
    price DECIMAL(36,18) NOT NULL,
    platform_fee DECIMAL(36,18) NOT NULL DEFAULT 0,
    sale_type VARCHAR(16) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_nft_sales_buyer (buyer_id, created_at),
    KEY idx_nft_sales_seller (seller_id, created_at),
    KEY idx_nft_sales_gift (gift_id, created_at),
    CONSTRAINT fk_nft_sale_item FOREIGN KEY (item_id) REFERENCES nft_gift_items (id),
    CONSTRAINT fk_nft_sale_gift FOREIGN KEY (gift_id) REFERENCES nft_gifts (id),
    CONSTRAINT fk_nft_sale_seller FOREIGN KEY (seller_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_nft_sale_buyer FOREIGN KEY (buyer_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO nft_gifts (slug, name, collection_name, description, rarity, icon, accent_color)
VALUES
    ('plush-pepe', 'Plush Pepe', 'Telegram Gifts', 'Плюшевый талисман из лимитированной коллекции.', 'RARE', '🐸', '#6EA93B'),
    ('diamond-ring', 'Diamond Ring', 'Telegram Gifts', 'Подарок с огранённым кристаллом и золотой оправой.', 'EPIC', '💍', '#8A73E6'),
    ('love-potion', 'Love Potion', 'Telegram Gifts', 'Коллекционный флакон с переливающимся сердцем.', 'UNCOMMON', '🧪', '#E45C87'),
    ('party-sparkler', 'Party Sparkler', 'Telegram Gifts', 'Яркий подарок для особых событий и поздравлений.', 'COMMON', '🎉', '#F0A521'),
    ('nail-bracelet', 'Nail Bracelet', 'Telegram Gifts', 'Минималистичный браслет с редким номером.', 'RARE', '📿', '#4C91C9'),
    ('durov-cap', 'Durov Cap', 'Telegram Gifts', 'Легендарный аксессуар из премиальной серии.', 'LEGENDARY', '🧢', '#202A54')
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    collection_name = VALUES(collection_name),
    description = VALUES(description),
    rarity = VALUES(rarity),
    icon = VALUES(icon),
    accent_color = VALUES(accent_color);

INSERT IGNORE INTO nft_gift_items (gift_id, serial_number, status, list_price)
VALUES
    ((SELECT id FROM nft_gifts WHERE slug = 'plush-pepe'), 1042, 'MARKET', 18.50),
    ((SELECT id FROM nft_gifts WHERE slug = 'plush-pepe'), 2891, 'MARKET', 21.00),
    ((SELECT id FROM nft_gifts WHERE slug = 'plush-pepe'), 7120, 'MARKET', 24.75),
    ((SELECT id FROM nft_gifts WHERE slug = 'diamond-ring'), 88, 'MARKET', 96.00),
    ((SELECT id FROM nft_gifts WHERE slug = 'diamond-ring'), 517, 'MARKET', 112.00),
    ((SELECT id FROM nft_gifts WHERE slug = 'love-potion'), 321, 'MARKET', 12.25),
    ((SELECT id FROM nft_gifts WHERE slug = 'love-potion'), 1840, 'MARKET', 14.90),
    ((SELECT id FROM nft_gifts WHERE slug = 'love-potion'), 9532, 'MARKET', 16.40),
    ((SELECT id FROM nft_gifts WHERE slug = 'party-sparkler'), 270, 'MARKET', 6.80),
    ((SELECT id FROM nft_gifts WHERE slug = 'party-sparkler'), 1563, 'MARKET', 7.45),
    ((SELECT id FROM nft_gifts WHERE slug = 'nail-bracelet'), 404, 'MARKET', 37.00),
    ((SELECT id FROM nft_gifts WHERE slug = 'nail-bracelet'), 9001, 'MARKET', 42.50),
    ((SELECT id FROM nft_gifts WHERE slug = 'durov-cap'), 7, 'MARKET', 480.00),
    ((SELECT id FROM nft_gifts WHERE slug = 'durov-cap'), 77, 'MARKET', 525.00);
