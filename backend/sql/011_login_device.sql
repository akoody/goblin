ALTER TABLE user_login_ips ADD COLUMN device_model VARCHAR(120) NOT NULL DEFAULT '' AFTER user_agent;
