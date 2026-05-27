CREATE TABLE IF NOT EXISTS hirelix_beta_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code text NOT NULL UNIQUE,
  recipient_email text,
  first_name text,
  company text,
  source text NOT NULL DEFAULT 'manual',
  invited_by_user_id uuid,
  batch_id text,
  campaign text,
  status text NOT NULL DEFAULT 'reserved',
  seat_number integer,
  free_search_limit integer NOT NULL DEFAULT 1,
  referral_limit integer NOT NULL DEFAULT 3,
  activated_user_id uuid,
  clicked_at timestamptz,
  activated_at timestamptz,
  used_at timestamptz,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hirelix_beta_invites_source_check
    CHECK (source IN ('cold_email', 'referral', 'manual')),
  CONSTRAINT hirelix_beta_invites_status_check
    CHECK (status IN ('reserved', 'clicked', 'activated', 'used', 'expired', 'revoked')),
  CONSTRAINT hirelix_beta_invites_seat_number_check
    CHECK (seat_number IS NULL OR seat_number > 0)
);

CREATE INDEX IF NOT EXISTS idx_hirelix_beta_invites_status_created
  ON hirelix_beta_invites (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hirelix_beta_invites_activated_user
  ON hirelix_beta_invites (activated_user_id);

CREATE INDEX IF NOT EXISTS idx_hirelix_beta_invites_invited_by
  ON hirelix_beta_invites (invited_by_user_id);

CREATE INDEX IF NOT EXISTS idx_hirelix_beta_invites_source_created
  ON hirelix_beta_invites (source, created_at DESC);

CREATE TABLE IF NOT EXISTS hirelix_beta_invite_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code text NOT NULL,
  event_type text NOT NULL,
  ip_address text,
  user_agent text,
  referer text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hirelix_beta_invite_events_event_type_check
    CHECK (event_type IN (
      'invite_opened',
      'invite_scan_detected',
      'invite_activated',
      'invite_search_created',
      'referral_invite_created'
    ))
);

CREATE INDEX IF NOT EXISTS idx_hirelix_beta_invite_events_invite_created
  ON hirelix_beta_invite_events (invite_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hirelix_beta_invite_events_event_created
  ON hirelix_beta_invite_events (event_type, created_at DESC);
