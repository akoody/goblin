ALTER TABLE commerce_policy
  ADD COLUMN guarantor_min_amount DECIMAL(26,6) NOT NULL DEFAULT 5.000000;

ALTER TABLE commerce_policy_audit
  ADD COLUMN previous_min_amount DECIMAL(26,6) NOT NULL DEFAULT 5.000000,
  ADD COLUMN new_min_amount DECIMAL(26,6) NOT NULL DEFAULT 5.000000;
