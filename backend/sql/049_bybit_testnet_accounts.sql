CREATE TABLE IF NOT EXISTS bybit_testnet_accounts (
    user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    connection_id CHAR(36) NOT NULL,
    credentials VARBINARY(512) NOT NULL,
    CONSTRAINT fk_bybit_testnet_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
