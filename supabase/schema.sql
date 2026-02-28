-- Hirelix product tables

-- User search tasks
CREATE TABLE IF NOT EXISTS public.hirelix_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT,
  jd_text TEXT NOT NULL,
  parsed_requirements JSONB,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- AI-generated candidates
CREATE TABLE IF NOT EXISTS public.hirelix_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id UUID NOT NULL REFERENCES public.hirelix_searches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  headline TEXT,
  location TEXT,
  skills TEXT[],
  experience_years INT,
  match_score INT,
  match_reasons TEXT[],
  profile_url TEXT,
  email TEXT,
  outreach_draft TEXT,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE public.hirelix_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hirelix_candidates ENABLE ROW LEVEL SECURITY;

-- Users can only see their own searches
CREATE POLICY "Users can view own searches"
  ON public.hirelix_searches FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own searches"
  ON public.hirelix_searches FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own searches"
  ON public.hirelix_searches FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can see candidates from their own searches
CREATE POLICY "Users can view own candidates"
  ON public.hirelix_candidates FOR SELECT
  USING (search_id IN (SELECT id FROM public.hirelix_searches WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own candidates"
  ON public.hirelix_candidates FOR UPDATE
  USING (search_id IN (SELECT id FROM public.hirelix_searches WHERE user_id = auth.uid()));

-- Service role bypass (for API routes using supabaseAdmin)
CREATE POLICY "Service role full access searches"
  ON public.hirelix_searches FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access candidates"
  ON public.hirelix_candidates FOR ALL
  USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hirelix_searches_user_id ON public.hirelix_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_hirelix_candidates_search_id ON public.hirelix_candidates(search_id);
