ALTER TABLE public.hirelix_usage_events
  DROP CONSTRAINT IF EXISTS hirelix_usage_events_event_type_check;

ALTER TABLE public.hirelix_usage_events
  ADD CONSTRAINT hirelix_usage_events_event_type_check
  CHECK (event_type IN (
    'search_created',
    'candidate_enriched',
    'public_evidence_deep_dive'
  ));

ALTER TABLE public.hirelix_public_evidence_jobs
  ADD COLUMN IF NOT EXISTS usage_event_id UUID;
