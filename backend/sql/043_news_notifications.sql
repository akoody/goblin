CREATE TABLE IF NOT EXISTS site_news_notifications (
 article_id BIGINT UNSIGNED PRIMARY KEY,
 dispatched_at TIMESTAMP(6) NULL,
 CONSTRAINT fk_news_notification_article FOREIGN KEY (article_id) REFERENCES site_articles(id) ON DELETE CASCADE,
 KEY idx_news_notification_pending (dispatched_at, article_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO site_news_notifications (article_id, dispatched_at)
SELECT id, CURRENT_TIMESTAMP(6) FROM site_articles WHERE published=1;
