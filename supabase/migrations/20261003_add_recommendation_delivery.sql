BEGIN;
CREATE TABLE IF NOT EXISTS hirelix_private_document_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  deliverable_id uuid NOT NULL,
  deliverable_version integer NOT NULL,
  snapshot jsonb NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id,deliverable_id) REFERENCES hirelix_private_deliverables(user_id,id)
);
CREATE INDEX IF NOT EXISTS private_document_shares_owner ON hirelix_private_document_shares(user_id,deliverable_id,created_at DESC);
CREATE TABLE IF NOT EXISTS hirelix_private_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  deliverable_id uuid NOT NULL,
  deliverable_version integer NOT NULL,
  request_key text NOT NULL,
  fingerprint text NOT NULL,
  status text NOT NULL CHECK (status IN ('sending','sent','failed','unknown')),
  snapshot jsonb NOT NULL,
  provider_message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,request_key),
  FOREIGN KEY (user_id,deliverable_id) REFERENCES hirelix_private_deliverables(user_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS private_email_delivery_once ON hirelix_private_email_deliveries(user_id,fingerprint) WHERE status IN ('sending','sent','unknown');
COMMIT;
