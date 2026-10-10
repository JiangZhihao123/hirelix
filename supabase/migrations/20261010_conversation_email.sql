BEGIN;
-- Ordinary conversation emails reuse the same immutable delivery receipts.
ALTER TABLE hirelix_private_email_deliveries ALTER COLUMN deliverable_id DROP NOT NULL;
ALTER TABLE hirelix_private_email_deliveries ALTER COLUMN deliverable_version DROP NOT NULL;
COMMIT;
