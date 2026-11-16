CREATE TABLE market_catalog_resets (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  previous_revision BIGINT UNSIGNED NOT NULL,
  previous_payload JSON NOT NULL,
  previous_popularity JSON NOT NULL,
  cleared_categories INT UNSIGNED NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
);
