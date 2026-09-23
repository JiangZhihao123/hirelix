CREATE TABLE IF NOT EXISTS hirelix_agent_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_candidate_id uuid,
  source_search_id uuid,
  name text NOT NULL,
  headline text,
  location text,
  skills text[] NOT NULL DEFAULT '{}',
  profile_url text,
  note text NOT NULL DEFAULT '',
  source_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hirelix_agent_people_user_updated_idx ON hirelix_agent_people (user_id, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS hirelix_agent_people_user_candidate_key ON hirelix_agent_people (user_id, source_candidate_id);

CREATE TABLE IF NOT EXISTS hirelix_agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  search_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hirelix_agent_messages_user_created_idx ON hirelix_agent_messages (user_id, created_at);

CREATE TABLE IF NOT EXISTS hirelix_agent_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  search_id uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hirelix_agent_briefs_user_created_idx ON hirelix_agent_briefs (user_id, created_at);
