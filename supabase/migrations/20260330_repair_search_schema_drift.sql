ALTER TABLE public.hirelix_searches
  ADD COLUMN IF NOT EXISTS pipeline_step TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parse_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS search_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS partial_ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ;

ALTER TABLE public.hirelix_candidates
  ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE TABLE IF NOT EXISTS public.hirelix_search_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id UUID NOT NULL REFERENCES public.hirelix_searches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  jd_text TEXT NOT NULL,
  candidate_count INT NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'queued',
  attempt_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (search_id)
);

ALTER TABLE public.hirelix_search_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access search jobs" ON public.hirelix_search_jobs;
CREATE POLICY "Service role full access search jobs"
  ON public.hirelix_search_jobs FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_hirelix_search_jobs_status_available_at
  ON public.hirelix_search_jobs(status, available_at);

CREATE INDEX IF NOT EXISTS idx_hirelix_searches_status_updated_at
  ON public.hirelix_searches(status, updated_at DESC);
