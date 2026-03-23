-- Cache table for Bright Data dataset snapshots
-- Snapshots are free to re-download within 30 days of creation.
-- We store a filter_hash (SHA-256 of the normalized filter request) to enable
-- fast lookup before triggering a new (paid) snapshot.

CREATE TABLE public.hirelix_dataset_snapshots (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id TEXT        NOT NULL UNIQUE,
  round       TEXT        NOT NULL,        -- "standard" | "hidden_gem" | "company_target"
  filter_hash TEXT        NOT NULL,        -- first 32 chars of SHA-256(normalized filter JSON)
  filter_summary JSONB,                    -- human-readable, for debugging
  dataset_size INTEGER,
  records_limit INTEGER,
  cost        NUMERIC,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL         -- created_at + 30 days (Bright Data retention window)
);

CREATE INDEX hirelix_dataset_snapshots_lookup
  ON public.hirelix_dataset_snapshots (filter_hash, expires_at DESC);
