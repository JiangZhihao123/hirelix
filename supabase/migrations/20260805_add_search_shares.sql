CREATE TABLE IF NOT EXISTS public.hirelix_search_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id UUID NOT NULL REFERENCES public.hirelix_searches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  candidate_limit INTEGER NOT NULL DEFAULT 50 CHECK (candidate_limit BETWEEN 1 AND 100),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hirelix_search_shares_search_id
  ON public.hirelix_search_shares(search_id);
CREATE INDEX IF NOT EXISTS idx_hirelix_search_shares_user_id
  ON public.hirelix_search_shares(user_id);
