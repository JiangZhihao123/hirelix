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

ALTER TABLE public.hirelix_search_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access search notifications" ON public.hirelix_search_notifications;
CREATE POLICY "Service role full access search notifications"
  ON public.hirelix_search_notifications FOR ALL
  USING (auth.role() = 'service_role');

CREATE UNIQUE INDEX IF NOT EXISTS idx_hirelix_search_notifications_unique_kind_channel
  ON public.hirelix_search_notifications(search_id, kind, channel);

CREATE INDEX IF NOT EXISTS idx_hirelix_search_notifications_user_id_created_at
  ON public.hirelix_search_notifications(user_id, created_at DESC);
