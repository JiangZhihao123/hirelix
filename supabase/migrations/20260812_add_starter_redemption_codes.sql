CREATE TABLE IF NOT EXISTS public.hirelix_redemption_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  code_prefix text NOT NULL,
  campaign text,
  benefit_plan text NOT NULL DEFAULT 'starter_monthly',
  duration_days integer NOT NULL DEFAULT 30 CHECK (duration_days > 0),
  max_redemptions integer NOT NULL DEFAULT 1 CHECK (max_redemptions > 0),
  redemption_count integer NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  expires_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hirelix_redemption_codes_plan_check CHECK (benefit_plan = 'starter_monthly'),
  CONSTRAINT hirelix_redemption_codes_count_check CHECK (redemption_count <= max_redemptions)
);

CREATE INDEX IF NOT EXISTS idx_hirelix_redemption_codes_status_expires
  ON public.hirelix_redemption_codes (status, expires_at);

CREATE TABLE IF NOT EXISTS public.hirelix_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL REFERENCES public.hirelix_redemption_codes(id),
  user_id uuid NOT NULL,
  benefit_plan text NOT NULL DEFAULT 'starter_monthly',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hirelix_redemptions_plan_check CHECK (benefit_plan = 'starter_monthly'),
  CONSTRAINT hirelix_redemptions_window_check CHECK (ends_at > starts_at),
  UNIQUE (code_id, user_id),
  UNIQUE (user_id, benefit_plan)
);

CREATE INDEX IF NOT EXISTS idx_hirelix_redemptions_user_status_ends
  ON public.hirelix_redemptions (user_id, status, ends_at);
