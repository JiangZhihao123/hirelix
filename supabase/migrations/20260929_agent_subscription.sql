-- Personal Agent trial and usage. Existing sourcing subscriptions remain intact.
CREATE TABLE IF NOT EXISTS hirelix_agent_access (
  user_id uuid PRIMARY KEY,
  trial_started_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hirelix_agent_task_usage (
  job_id uuid PRIMARY KEY REFERENCES hirelix_private_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  charged_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_task_usage_period ON hirelix_agent_task_usage(user_id, charged_at);
ALTER TABLE hirelix_user_settings ADD COLUMN IF NOT EXISTS paddle_event_at timestamptz;
