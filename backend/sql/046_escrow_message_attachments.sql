CREATE TABLE IF NOT EXISTS commerce_message_attachments (
 message_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 filename VARCHAR(200) NOT NULL,
 size_bytes INT UNSIGNED NOT NULL,
 CONSTRAINT fk_escrow_attachment_message FOREIGN KEY (message_id) REFERENCES commerce_messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
