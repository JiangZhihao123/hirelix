-- ============================================================================
-- Hirelix VPS Postgres Initial Schema
--
-- Run this once on the new VPS Postgres to create all business tables.
-- Differences vs `supabase/full_migration.sql`:
--   - No `auth.users` foreign keys (Auth lives in Supabase, data lives here)
--   - No RLS policies (we filter by user_id in the application layer)
--   - No Supabase-specific roles / extensions
--
-- Usage:
--   createdb hirelix
--   psql -d hirelix -f supabase/vps_init.sql
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- Searches
-- ----------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_hirelix_searches_user_id
  ON public.hirelix_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_hirelix_searches_status_updated_at
  ON public.hirelix_searches(status, updated_at DESC);

-- ----------------------------------------------------------------------------
-- Candidates
-- ----------------------------------------------------------------------------
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
  enriched_at TIMESTAMPTZ,
  enrich_source TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hirelix_candidates_search_id
  ON public.hirelix_candidates(search_id);
CREATE INDEX IF NOT EXISTS idx_hirelix_candidates_enriched_at
  ON public.hirelix_candidates(enriched_at DESC);

-- ----------------------------------------------------------------------------
-- Search jobs queue
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hirelix_search_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id UUID NOT NULL REFERENCES public.hirelix_searches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_hirelix_search_jobs_status_available_at
  ON public.hirelix_search_jobs(status, available_at);

-- ----------------------------------------------------------------------------
-- Search notifications
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hirelix_search_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id UUID NOT NULL REFERENCES public.hirelix_searches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_hirelix_search_notifications_unique_kind_channel
  ON public.hirelix_search_notifications(search_id, kind, channel);
CREATE INDEX IF NOT EXISTS idx_hirelix_search_notifications_user_id_created_at
  ON public.hirelix_search_notifications(user_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- GitHub enrichment jobs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hirelix_github_enrichment_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.hirelix_candidates(id) ON DELETE CASCADE,
  search_id UUID NOT NULL REFERENCES public.hirelix_searches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_hirelix_github_enrichment_jobs_status_available_at
  ON public.hirelix_github_enrichment_jobs(status, available_at);
CREATE INDEX IF NOT EXISTS idx_hirelix_github_enrichment_jobs_search_id
  ON public.hirelix_github_enrichment_jobs(search_id);

-- ----------------------------------------------------------------------------
-- User settings (with billing fields)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hirelix_user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  pdl_api_key TEXT,
  company_profile JSONB,
  subscription_plan TEXT DEFAULT 'free',
  subscription_status TEXT DEFAULT 'active',
  billing_cycle TEXT,
  paddle_customer_id TEXT,
  paddle_subscription_id TEXT,
  paddle_transaction_id TEXT,
  subscription_started_at TIMESTAMPTZ,
  subscription_renews_at TIMESTAMPTZ,
  extra_search_credits INT NOT NULL DEFAULT 0,
  extra_enrich_credits INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- Usage events
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hirelix_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('search_created', 'candidate_enriched')),
  related_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_type, related_id)
);

CREATE INDEX IF NOT EXISTS idx_hirelix_usage_events_user_id_created_at
  ON public.hirelix_usage_events(user_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- Billing events (Paddle webhook log)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hirelix_billing_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id UUID,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- LLM usage events
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hirelix_llm_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id UUID REFERENCES public.hirelix_searches(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.hirelix_search_jobs(id) ON DELETE SET NULL,
  user_id UUID,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  model TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'deepseek',
  attempt INTEGER NOT NULL DEFAULT 1,
  batch_size INTEGER,
  candidate_indexes INTEGER[],
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_miss_input_tokens INTEGER NOT NULL DEFAULT 0,
  max_output_tokens INTEGER,
  thinking TEXT,
  reasoning_effort TEXT,
  latency_ms INTEGER,
  error_message TEXT,
  request_hash TEXT,
  response_hash TEXT,
  request_payload JSONB,
  response_payload JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hirelix_llm_usage_events_search_created
  ON public.hirelix_llm_usage_events(search_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hirelix_llm_usage_events_stage_created
  ON public.hirelix_llm_usage_events(stage, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hirelix_llm_usage_events_model_created
  ON public.hirelix_llm_usage_events(model, created_at DESC);

-- ----------------------------------------------------------------------------
-- GitHub identity / profile cache
-- ----------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_hirelix_github_identity_cache_expires_at
  ON public.hirelix_github_identity_cache(expires_at);

CREATE TABLE IF NOT EXISTS public.hirelix_github_profile_cache (
  github_login TEXT PRIMARY KEY,
  raw_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  contribution_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  technical_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hirelix_github_profile_cache_expires_at
  ON public.hirelix_github_profile_cache(expires_at);

-- ----------------------------------------------------------------------------
-- Public evidence
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hirelix_public_evidence_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.hirelix_candidates(id) ON DELETE CASCADE,
  search_id UUID NOT NULL REFERENCES public.hirelix_searches(id) ON DELETE CASCADE,
  user_id UUID,
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

CREATE INDEX IF NOT EXISTS idx_hirelix_public_source_cache_expires
  ON public.hirelix_public_source_cache(expires_at);

-- ----------------------------------------------------------------------------
-- Bright Data dataset snapshots cache
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hirelix_dataset_snapshots (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id TEXT        NOT NULL UNIQUE,
  round       TEXT        NOT NULL,
  filter_hash TEXT        NOT NULL,
  filter_summary JSONB,
  dataset_size INTEGER,
  records_limit INTEGER,
  cost        NUMERIC,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS hirelix_dataset_snapshots_lookup
  ON public.hirelix_dataset_snapshots (filter_hash, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.hirelix_snapshot_profiles (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id  TEXT        NOT NULL,
  search_id    UUID        NOT NULL REFERENCES public.hirelix_searches(id) ON DELETE CASCADE,
  job_id       UUID        NOT NULL REFERENCES public.hirelix_search_jobs(id) ON DELETE CASCADE,
  source_round TEXT        NOT NULL DEFAULT 'standard',
  record_index INTEGER,
  linkedin_id  TEXT,
  profile_url  TEXT,
  raw_data     JSONB       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hirelix_snapshot_profiles_by_snapshot
  ON public.hirelix_snapshot_profiles (snapshot_id);
CREATE INDEX IF NOT EXISTS hirelix_snapshot_profiles_by_search
  ON public.hirelix_snapshot_profiles (search_id);
CREATE INDEX IF NOT EXISTS hirelix_snapshot_profiles_by_round_order
  ON public.hirelix_snapshot_profiles (snapshot_id, source_round, record_index);
CREATE UNIQUE INDEX IF NOT EXISTS hirelix_snapshot_profiles_unique_lid
  ON public.hirelix_snapshot_profiles (snapshot_id, linkedin_id)
  WHERE linkedin_id IS NOT NULL;
