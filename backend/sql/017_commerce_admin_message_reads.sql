CREATE TABLE IF NOT EXISTS commerce_admin_deal_reads (
  admin_id BIGINT UNSIGNED NOT NULL,
  deal_id CHAR(36) NOT NULL,
  last_read_message_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (admin_id, deal_id),
  CONSTRAINT fk_commerce_admin_read_user FOREIGN KEY (admin_id) REFERENCES users(id),
  CONSTRAINT fk_commerce_admin_read_deal FOREIGN KEY (deal_id) REFERENCES commerce_deals(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
