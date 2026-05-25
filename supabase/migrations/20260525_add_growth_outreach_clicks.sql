CREATE TABLE IF NOT EXISTS public.hirelix_growth_outreach_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id TEXT NOT NULL,
  batch_id TEXT,
  recipient TEXT,
  company TEXT,
  source_url TEXT,
  destination_url TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  referer TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hirelix_growth_outreach_clicks_email_created
  ON public.hirelix_growth_outreach_clicks(email_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hirelix_growth_outreach_clicks_batch_created
  ON public.hirelix_growth_outreach_clicks(batch_id, created_at DESC);
