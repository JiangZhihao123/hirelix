CREATE TABLE IF NOT EXISTS hirelix_product_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  email text NOT NULL,
  category text NOT NULL CHECK (category IN ('problem','suggestion','other')),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 5000),
  page_path text NOT NULL,
  app_version text NOT NULL,
  screenshot bytea,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','replied')),
  notification_status text NOT NULL DEFAULT 'pending' CHECK (notification_status IN ('pending','sending','sent','failed')),
  notification_attempts integer NOT NULL DEFAULT 0,
  notification_next_at timestamptz NOT NULL DEFAULT now(),
  notification_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_key)
);
CREATE INDEX IF NOT EXISTS hirelix_product_feedback_notify ON hirelix_product_feedback(notification_next_at) WHERE notification_status IN ('pending','sending');
CREATE INDEX IF NOT EXISTS hirelix_product_feedback_created ON hirelix_product_feedback(created_at DESC);
