CREATE TABLE IF NOT EXISTS public.hirelix_user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pdl_api_key TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.hirelix_user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own settings" ON public.hirelix_user_settings;
CREATE POLICY "Users can read own settings"
  ON public.hirelix_user_settings FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own settings" ON public.hirelix_user_settings;
CREATE POLICY "Users can insert own settings"
  ON public.hirelix_user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own settings" ON public.hirelix_user_settings;
CREATE POLICY "Users can update own settings"
  ON public.hirelix_user_settings FOR UPDATE
  USING (auth.uid() = user_id);

ALTER TABLE public.hirelix_user_settings
  ADD COLUMN IF NOT EXISTS company_profile JSONB,
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT,
  ADD COLUMN IF NOT EXISTS paddle_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS paddle_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS paddle_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_renews_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extra_search_credits INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_enrich_credits INT NOT NULL DEFAULT 0;

ALTER TABLE public.hirelix_candidates
  ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enrich_source TEXT;

CREATE TABLE IF NOT EXISTS public.hirelix_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('search_created', 'candidate_enriched')),
  related_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_type, related_id)
);

CREATE TABLE IF NOT EXISTS public.hirelix_billing_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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

ALTER TABLE public.hirelix_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hirelix_billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hirelix_search_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own usage events" ON public.hirelix_usage_events;
CREATE POLICY "Users can read own usage events"
  ON public.hirelix_usage_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access usage events" ON public.hirelix_usage_events;
CREATE POLICY "Service role full access usage events"
  ON public.hirelix_usage_events FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access billing events" ON public.hirelix_billing_events;
CREATE POLICY "Service role full access billing events"
  ON public.hirelix_billing_events FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access search notifications" ON public.hirelix_search_notifications;
CREATE POLICY "Service role full access search notifications"
  ON public.hirelix_search_notifications FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_hirelix_usage_events_user_id_created_at
  ON public.hirelix_usage_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hirelix_candidates_enriched_at
  ON public.hirelix_candidates(enriched_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hirelix_search_notifications_unique_kind_channel
  ON public.hirelix_search_notifications(search_id, kind, channel);

CREATE INDEX IF NOT EXISTS idx_hirelix_search_notifications_user_id_created_at
  ON public.hirelix_search_notifications(user_id, created_at DESC);
