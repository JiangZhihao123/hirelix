-- Operator authentication is separate from recruiting accounts and OAuth.
-- Persist sessions and throttles so revocation and limits work across instances.
CREATE TABLE IF NOT EXISTS hirelix_admin_sessions (
  token_hash text PRIMARY KEY,
  credential_version text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry ON hirelix_admin_sessions(expires_at);
CREATE TABLE IF NOT EXISTS hirelix_admin_login_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL,
  expires_at timestamptz NOT NULL
);
