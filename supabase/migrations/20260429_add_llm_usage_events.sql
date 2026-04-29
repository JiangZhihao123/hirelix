-- Store per-call LLM usage for cost attribution and cache analysis.

CREATE TABLE IF NOT EXISTS public.hirelix_llm_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id UUID REFERENCES public.hirelix_searches(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.hirelix_search_jobs(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
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

ALTER TABLE public.hirelix_llm_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access llm usage events" ON public.hirelix_llm_usage_events;
CREATE POLICY "Service role full access llm usage events"
  ON public.hirelix_llm_usage_events FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can read own llm usage events" ON public.hirelix_llm_usage_events;
CREATE POLICY "Users can read own llm usage events"
  ON public.hirelix_llm_usage_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_hirelix_llm_usage_events_search_created
  ON public.hirelix_llm_usage_events(search_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hirelix_llm_usage_events_stage_created
  ON public.hirelix_llm_usage_events(stage, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hirelix_llm_usage_events_model_created
  ON public.hirelix_llm_usage_events(model, created_at DESC);
