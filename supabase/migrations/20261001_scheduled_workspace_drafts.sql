-- Compatible additions: agreements use the existing workspace queue and billing.
ALTER TABLE hirelix_private_schedules
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en' CHECK (language IN ('en','zh')),
  ADD COLUMN IF NOT EXISTS person_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS include_role_records boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS include_candidate_records boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS last_job_id uuid;
