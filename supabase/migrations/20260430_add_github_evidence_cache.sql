CREATE TABLE IF NOT EXISTS public.hirelix_github_identity_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL UNIQUE,
  linkedin_url TEXT,
  candidate_name TEXT,
  current_company TEXT,
  github_login TEXT,
  github_url TEXT,
  status TEXT NOT NULL,
  discovery_source TEXT,
  confidence NUMERIC,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hirelix_github_profile_cache (
  github_login TEXT PRIMARY KEY,
  raw_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  contribution_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  technical_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hirelix_github_identity_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hirelix_github_profile_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access github identity cache" ON public.hirelix_github_identity_cache;
CREATE POLICY "Service role full access github identity cache"
  ON public.hirelix_github_identity_cache FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access github profile cache" ON public.hirelix_github_profile_cache;
CREATE POLICY "Service role full access github profile cache"
  ON public.hirelix_github_profile_cache FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_hirelix_github_identity_cache_expires_at
  ON public.hirelix_github_identity_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_hirelix_github_profile_cache_expires_at
  ON public.hirelix_github_profile_cache(expires_at);
