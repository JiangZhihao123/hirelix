-- Hirelix Complete Migration Script
-- Run this in Supabase Dashboard SQL Editor

-- Create tables
CREATE TABLE IF NOT EXISTS public.hirelix_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT,
  jd_text TEXT NOT NULL,
  parsed_requirements JSONB,
  status TEXT DEFAULT 'pending',
  pipeline_step TEXT,
  error_message TEXT,
  warning_message TEXT,
  queued_at TIMESTAMPTZ,
  parse_completed_at TIMESTAMPTZ,
  search_completed_at TIMESTAMPTZ,
  partial_ready_at TIMESTAMPTZ,
  done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

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
  github_url TEXT,
  email TEXT,
  outreach_draft TEXT,
  status TEXT DEFAULT 'new',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS public.hirelix_search_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id UUID NOT NULL REFERENCES public.hirelix_searches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  provider_message_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS hirelix_user_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pdl_api_key text,
  company_profile JSONB,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.hirelix_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hirelix_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hirelix_search_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hirelix_search_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hirelix_github_enrichment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hirelix_user_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own searches" ON public.hirelix_searches;
DROP POLICY IF EXISTS "Users can insert own searches" ON public.hirelix_searches;
DROP POLICY IF EXISTS "Users can update own searches" ON public.hirelix_searches;
DROP POLICY IF EXISTS "Users can delete own searches" ON public.hirelix_searches;
DROP POLICY IF EXISTS "Service role full access searches" ON public.hirelix_searches;

DROP POLICY IF EXISTS "Users can view own candidates" ON public.hirelix_candidates;
DROP POLICY IF EXISTS "Users can update own candidates" ON public.hirelix_candidates;
DROP POLICY IF EXISTS "Service role full access candidates" ON public.hirelix_candidates;
DROP POLICY IF EXISTS "Service role full access search jobs" ON public.hirelix_search_jobs;
DROP POLICY IF EXISTS "Service role full access search notifications" ON public.hirelix_search_notifications;
DROP POLICY IF EXISTS "Service role full access github enrichment jobs" ON public.hirelix_github_enrichment_jobs;

DROP POLICY IF EXISTS "Users can read own settings" ON hirelix_user_settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON hirelix_user_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON hirelix_user_settings;

-- Create policies for searches
CREATE POLICY "Users can view own searches"
  ON public.hirelix_searches FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own searches"
  ON public.hirelix_searches FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own searches"
  ON public.hirelix_searches FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own searches"
  ON public.hirelix_searches FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access searches"
  ON public.hirelix_searches FOR ALL
  USING (auth.role() = 'service_role');

-- Create policies for candidates
CREATE POLICY "Users can view own candidates"
  ON public.hirelix_candidates FOR SELECT
  USING (search_id IN (SELECT id FROM public.hirelix_searches WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own candidates"
  ON public.hirelix_candidates FOR UPDATE
  USING (search_id IN (SELECT id FROM public.hirelix_searches WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access candidates"
  ON public.hirelix_candidates FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access search jobs"
  ON public.hirelix_search_jobs FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access search notifications"
  ON public.hirelix_search_notifications FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access github enrichment jobs"
  ON public.hirelix_github_enrichment_jobs FOR ALL
  USING (auth.role() = 'service_role');

-- Create policies for user settings
CREATE POLICY "Users can read own settings"
  ON hirelix_user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON hirelix_user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON hirelix_user_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_hirelix_searches_user_id ON public.hirelix_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_hirelix_candidates_search_id ON public.hirelix_candidates(search_id);
CREATE INDEX IF NOT EXISTS idx_hirelix_search_jobs_status_available_at ON public.hirelix_search_jobs(status, available_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hirelix_search_notifications_unique_kind_channel
  ON public.hirelix_search_notifications(search_id, kind, channel);
CREATE INDEX IF NOT EXISTS idx_hirelix_search_notifications_user_id_created_at
  ON public.hirelix_search_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hirelix_github_enrichment_jobs_status_available_at
  ON public.hirelix_github_enrichment_jobs(status, available_at);
CREATE INDEX IF NOT EXISTS idx_hirelix_github_enrichment_jobs_search_id
  ON public.hirelix_github_enrichment_jobs(search_id);
