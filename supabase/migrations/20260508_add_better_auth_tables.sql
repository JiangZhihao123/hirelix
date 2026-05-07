-- better-auth core tables.
--
-- Replaces self-hosted Zitadel + the `hirelix_user_identities` mapping table.
-- better-auth issues its own `user.id` (text). We force the id to be a uuid
-- string (via `advanced.database.generateId` in `src/lib/auth.ts`) so the
-- existing `hirelix_*.user_id uuid` columns continue to work without any
-- schema change.
--
-- Column naming follows better-auth's defaults (camelCase) so the framework's
-- helpers work without custom mapping config.

CREATE TABLE IF NOT EXISTS "user" (
  id              text PRIMARY KEY,
  email           text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  name            text,
  image           text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_email ON "user" (email);

CREATE TABLE IF NOT EXISTS "session" (
  id              text PRIMARY KEY,
  "userId"        text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token           text NOT NULL UNIQUE,
  "expiresAt"     timestamptz NOT NULL,
  "ipAddress"     text,
  "userAgent"     text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_user_id ON "session" ("userId");
CREATE INDEX IF NOT EXISTS idx_session_expires_at ON "session" ("expiresAt");

CREATE TABLE IF NOT EXISTS "account" (
  id                       text PRIMARY KEY,
  "userId"                 text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accountId"              text NOT NULL,
  "providerId"             text NOT NULL,
  "accessToken"            text,
  "refreshToken"           text,
  "idToken"                text,
  "accessTokenExpiresAt"   timestamptz,
  "refreshTokenExpiresAt"  timestamptz,
  scope                    text,
  password                 text,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("providerId", "accountId")
);

CREATE INDEX IF NOT EXISTS idx_account_user_id ON "account" ("userId");

CREATE TABLE IF NOT EXISTS "verification" (
  id              text PRIMARY KEY,
  identifier      text NOT NULL,
  value           text NOT NULL,
  "expiresAt"     timestamptz NOT NULL,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_identifier ON "verification" (identifier);
CREATE INDEX IF NOT EXISTS idx_verification_expires_at ON "verification" ("expiresAt");

-- Drop the old Zitadel identity mapping table if it exists.
DROP TABLE IF EXISTS hirelix_user_identities;
