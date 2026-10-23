-- Each in-flight provider call owns its hold; settling one must not release another.
ALTER TABLE hirelix_agent_credit_usage
  ADD COLUMN IF NOT EXISTS call_reservations jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(call_reservations) = 'object');
