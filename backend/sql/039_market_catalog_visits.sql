CREATE TABLE market_catalog_views (
  slug VARCHAR(200) NOT NULL,
  area ENUM('accounts','services') NOT NULL,
  views BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(slug,area)
);

CREATE TABLE market_catalog_visit_dedup (
  slug VARCHAR(200) NOT NULL,
  area ENUM('accounts','services') NOT NULL,
  visit_day DATE NOT NULL,
  visitor_hash BINARY(32) NOT NULL,
  PRIMARY KEY(slug,area,visit_day,visitor_hash),
  KEY idx_catalog_visit_retention(visit_day)
);
