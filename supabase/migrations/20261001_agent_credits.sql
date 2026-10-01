-- Pre-launch compute-credit ledger. No task-count compatibility layer.
CREATE TABLE IF NOT EXISTS hirelix_agent_credit_usage (
  job_id uuid PRIMARY KEY REFERENCES hirelix_private_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  charged_at timestamptz NOT NULL DEFAULT now(),
  reserved_units bigint NOT NULL DEFAULT 0 CHECK (reserved_units >= 0),
  consumed_units bigint NOT NULL DEFAULT 0 CHECK (consumed_units >= 0),
  cost_nano_usd bigint NOT NULL DEFAULT 0 CHECK (cost_nano_usd >= 0),
  pricing_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS agent_credit_usage_period ON hirelix_agent_credit_usage(user_id,charged_at);
