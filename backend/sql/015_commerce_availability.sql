INSERT INTO platform_features (feature_key,enabled)
VALUES ('market',1),('guarantor',1)
ON DUPLICATE KEY UPDATE feature_key=VALUES(feature_key);
