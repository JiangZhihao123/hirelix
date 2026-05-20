UPDATE public.hirelix_searches
SET
  status = 'error',
  pipeline_step = 'error',
  error_message = COALESCE(error_message, 'Search had an invalid status after strict failure handling was enabled. Retry the search to rerun the full chain.'),
  updated_at = now()
WHERE status IS NULL
   OR status NOT IN ('queued', 'parsing', 'searching', 'screening', 'deep_scoring', 'done', 'error');

ALTER TABLE public.hirelix_searches
  ALTER COLUMN status SET DEFAULT 'queued',
  ALTER COLUMN status SET NOT NULL,
  DROP COLUMN IF EXISTS warning_message,
  DROP CONSTRAINT IF EXISTS hirelix_searches_status_check,
  ADD CONSTRAINT hirelix_searches_status_check
    CHECK (status IN ('queued', 'parsing', 'searching', 'screening', 'deep_scoring', 'done', 'error'));
