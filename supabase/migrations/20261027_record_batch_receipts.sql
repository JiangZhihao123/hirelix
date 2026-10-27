BEGIN;

-- Batch jobs reuse the existing import job and row lifecycle. Legacy imports
-- leave this null; a batch receipt commits atomically with its business write.
ALTER TABLE hirelix_private_import_rows ADD COLUMN IF NOT EXISTS batch_receipt jsonb;

-- A queued index job reads the current entity and all of its current sources.
-- Locate the matching pending job without scanning unrelated batch work.
CREATE INDEX IF NOT EXISTS private_queued_person_index
  ON hirelix_private_jobs (user_id, (payload->>'person_id'), created_at)
  WHERE kind='index' AND status='queued';
CREATE INDEX IF NOT EXISTS private_queued_role_index
  ON hirelix_private_jobs (user_id, (payload->>'role_id'), created_at)
  WHERE kind='index' AND status='queued';

COMMIT;
