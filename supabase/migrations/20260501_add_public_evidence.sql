-- Store async public engineering evidence discovery across GitHub, personal sites,
-- technical blogs, package registries, papers, talks, and company engineering pages.

CREATE TABLE IF NOT EXISTS public.hirelix_public_evidence_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.hirelix_candidates(id) ON DELETE CASCADE,
  search_id UUID NOT NULL REFERENCES public.hirelix_searches(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  usage_event_id UUID,
  status TEXT NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(candidate_id)
);

ALTER TABLE public.hirelix_public_evidence_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access public evidence jobs" ON public.hirelix_public_evidence_jobs;
CREATE POLICY "Service role full access public evidence jobs"
  ON public.hirelix_public_evidence_jobs FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_hirelix_public_evidence_jobs_status_available
  ON public.hirelix_public_evidence_jobs(status, available_at);

CREATE INDEX IF NOT EXISTS idx_hirelix_public_evidence_jobs_search
  ON public.hirelix_public_evidence_jobs(search_id);

CREATE TABLE IF NOT EXISTS public.hirelix_public_evidence_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.hirelix_candidates(id) ON DELETE CASCADE,
  search_id UUID NOT NULL REFERENCES public.hirelix_searches(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT,
  snippet TEXT,
  identity_status TEXT NOT NULL DEFAULT 'uncertain',
  identity_confidence NUMERIC,
  relevance_score INTEGER,
  evidence_strength TEXT NOT NULL DEFAULT 'weak',
  evidence_summary TEXT NOT NULL,
  outreach_angle TEXT,
  raw_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(candidate_id, source_url)
);

ALTER TABLE public.hirelix_public_evidence_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access public evidence items" ON public.hirelix_public_evidence_items;
CREATE POLICY "Service role full access public evidence items"
  ON public.hirelix_public_evidence_items FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can read own public evidence items" ON public.hirelix_public_evidence_items;
CREATE POLICY "Users can read own public evidence items"
  ON public.hirelix_public_evidence_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.hirelix_searches s
      WHERE s.id = hirelix_public_evidence_items.search_id
        AND s.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_hirelix_public_evidence_items_candidate
  ON public.hirelix_public_evidence_items(candidate_id, relevance_score DESC);

CREATE INDEX IF NOT EXISTS idx_hirelix_public_evidence_items_search
  ON public.hirelix_public_evidence_items(search_id, evidence_strength);

CREATE TABLE IF NOT EXISTS public.hirelix_public_source_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_fingerprint TEXT NOT NULL,
  source_url_hash TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  identity_verdict TEXT,
  identity_confidence NUMERIC,
  page_title TEXT,
  page_text_summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(candidate_fingerprint, source_url_hash)
);

ALTER TABLE public.hirelix_public_source_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access public source cache" ON public.hirelix_public_source_cache;
CREATE POLICY "Service role full access public source cache"
  ON public.hirelix_public_source_cache FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_hirelix_public_source_cache_expires
  ON public.hirelix_public_source_cache(expires_at);
