-- The shared usage ledger records both search jobs and private Agent jobs.
-- job_id is a correlation UUID; a foreign key to search jobs alone rejects
-- every private Agent event. Keep the UUID rather than dropping the event.
BEGIN;
ALTER TABLE hirelix_llm_usage_events
  DROP CONSTRAINT IF EXISTS hirelix_llm_usage_events_job_id_fkey;
COMMENT ON COLUMN hirelix_llm_usage_events.job_id IS
  'Correlation UUID of a search or private workspace job; no single-table foreign key.';
COMMIT;
