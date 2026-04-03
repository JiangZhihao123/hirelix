CREATE TABLE IF NOT EXISTS public.hirelix_github_enrichment_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.hirelix_candidates(id) ON DELETE CASCADE,
  search_id UUID NOT NULL REFERENCES public.hirelix_searches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  attempt_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id)
);

ALTER TABLE public.hirelix_github_enrichment_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access github enrichment jobs" ON public.hirelix_github_enrichment_jobs;
CREATE POLICY "Service role full access github enrichment jobs"
  ON public.hirelix_github_enrichment_jobs FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_hirelix_github_enrichment_jobs_status_available_at
  ON public.hirelix_github_enrichment_jobs(status, available_at);

CREATE INDEX IF NOT EXISTS idx_hirelix_github_enrichment_jobs_search_id
  ON public.hirelix_github_enrichment_jobs(search_id);
