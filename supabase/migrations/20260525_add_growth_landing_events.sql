CREATE TABLE IF NOT EXISTS public.hirelix_growth_landing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  visitor_id TEXT,
  session_id TEXT,
  email_id TEXT,
  batch_id TEXT,
  recipient TEXT,
  company TEXT,
  page_url TEXT,
  referrer TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hirelix_growth_landing_events_email_created
  ON public.hirelix_growth_landing_events(email_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hirelix_growth_landing_events_event_created
  ON public.hirelix_growth_landing_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hirelix_growth_landing_events_session_created
  ON public.hirelix_growth_landing_events(session_id, created_at DESC);
