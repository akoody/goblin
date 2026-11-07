CREATE TABLE treasury_collection_gas_grants (
 id CHAR(36) PRIMARY KEY, job_id CHAR(36) NOT NULL UNIQUE,
 source_address VARCHAR(128) NOT NULL, amount DECIMAL(36,6) NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'prepared', tx_hash VARCHAR(128) NOT NULL UNIQUE,
 signed_transaction MEDIUMTEXT NULL, expiry_time BIGINT NOT NULL,
 fee_charged DECIMAL(36,6) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
