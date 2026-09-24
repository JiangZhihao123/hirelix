BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE hirelix_agent_people ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
ALTER TABLE hirelix_agent_people ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';
ALTER TABLE hirelix_agent_people ADD COLUMN IF NOT EXISTS profile jsonb NOT NULL DEFAULT '{}';
ALTER TABLE hirelix_agent_people ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS private_people_owner_id ON hirelix_agent_people(user_id,id);
CREATE INDEX IF NOT EXISTS private_people_name ON hirelix_agent_people USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS private_people_email ON hirelix_agent_people(user_id,lower(email));

CREATE TABLE IF NOT EXISTS hirelix_private_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  title text NOT NULL, client_name text NOT NULL, jd_text text NOT NULL,
  brief jsonb NOT NULL DEFAULT '{}', client_contact jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','closed')),
  version integer NOT NULL DEFAULT 1,
  source_search_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,id), UNIQUE(user_id,source_search_id)
);
CREATE INDEX IF NOT EXISTS private_roles_owner_updated ON hirelix_private_roles(user_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS hirelix_private_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  name text NOT NULL, media_type text NOT NULL, byte_size integer NOT NULL,
  sha256 text NOT NULL, bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,id)
);

CREATE TABLE IF NOT EXISTS hirelix_private_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  person_id uuid, role_id uuid, file_id uuid,
  kind text NOT NULL CHECK (kind IN ('note','call','email','feedback','cv','profile','jd','event')),
  title text NOT NULL, content text NOT NULL DEFAULT '', source_url text,
  occurred_at timestamptz, details jsonb NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,id),
  FOREIGN KEY(user_id,person_id) REFERENCES hirelix_agent_people(user_id,id),
  FOREIGN KEY(user_id,role_id) REFERENCES hirelix_private_roles(user_id,id),
  FOREIGN KEY(user_id,file_id) REFERENCES hirelix_private_files(user_id,id)
);
CREATE INDEX IF NOT EXISTS private_records_person ON hirelix_private_records(user_id,person_id,created_at);
CREATE INDEX IF NOT EXISTS private_records_role_time ON hirelix_private_records(user_id,role_id,occurred_at);

CREATE TABLE IF NOT EXISTS hirelix_private_role_candidates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, role_id uuid NOT NULL, person_id uuid NOT NULL,
  assessment jsonb NOT NULL DEFAULT '{}', assessed_role_version integer,
  permission text NOT NULL DEFAULT 'unknown' CHECK (permission IN ('unknown','confirmed','declined')),
  permission_record_id uuid, interest text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,role_id,person_id),
  UNIQUE(user_id,id),
  FOREIGN KEY(user_id,role_id) REFERENCES hirelix_private_roles(user_id,id),
  FOREIGN KEY(user_id,person_id) REFERENCES hirelix_agent_people(user_id,id),
  FOREIGN KEY(user_id,permission_record_id) REFERENCES hirelix_private_records(user_id,id)
);

CREATE TABLE IF NOT EXISTS hirelix_private_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('submission','search_update','legacy')),
  title text NOT NULL, content text NOT NULL DEFAULT '',
  person_ids uuid[] NOT NULL DEFAULT '{}', record_ids uuid[] NOT NULL DEFAULT '{}', file_ids uuid[] NOT NULL DEFAULT '{}',
  source_snapshot jsonb NOT NULL DEFAULT '{}',
  period_start timestamptz, period_end timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
  submitted_at timestamptz, submission_note text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1, legacy_brief_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,id), FOREIGN KEY(user_id,role_id) REFERENCES hirelix_private_roles(user_id,id),
  CHECK (period_start IS NULL OR period_end IS NULL OR period_start <= period_end),
  CHECK (status <> 'submitted' OR submitted_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS private_deliverables_owner_role ON hirelix_private_deliverables(user_id,role_id,created_at DESC);

CREATE TABLE IF NOT EXISTS hirelix_private_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('person','role','record','deliverable','role_candidate')),
  entity_id uuid NOT NULL, version integer NOT NULL, snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,entity_type,entity_id,version)
);

CREATE TABLE IF NOT EXISTS hirelix_private_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'New conversation', role_id uuid, person_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,id),
  FOREIGN KEY(user_id,role_id) REFERENCES hirelix_private_roles(user_id,id),
  FOREIGN KEY(user_id,person_id) REFERENCES hirelix_agent_people(user_id,id)
);
ALTER TABLE hirelix_agent_messages ADD COLUMN IF NOT EXISTS conversation_id uuid;
ALTER TABLE hirelix_agent_messages ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS private_messages_conversation ON hirelix_agent_messages(user_id,conversation_id,created_at);

CREATE TABLE IF NOT EXISTS hirelix_private_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('chat','import','index','assessment','deliverable','revision','brief_proposal')),
  request_key text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', result jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','error','cancelled')),
  progress text NOT NULL DEFAULT 'Queued', attempts integer NOT NULL DEFAULT 0,
  lease_token uuid, lease_until timestamptz, error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,id), UNIQUE(user_id,request_key)
);
CREATE INDEX IF NOT EXISTS private_jobs_queue ON hirelix_private_jobs(status,created_at);

CREATE TABLE IF NOT EXISTS hirelix_private_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, job_id uuid NOT NULL,
  row_number integer NOT NULL, file_id uuid, raw_text text NOT NULL,
  extracted jsonb NOT NULL DEFAULT '{}', matches jsonb NOT NULL DEFAULT '[]',
  action text NOT NULL DEFAULT 'review' CHECK (action IN ('review','add','merge','skip')),
  target_person_id uuid, result_person_id uuid,
  status text NOT NULL DEFAULT 'review' CHECK (status IN ('review','saved','skipped','error')),
  error text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,id), UNIQUE(job_id,row_number),
  FOREIGN KEY(user_id,job_id) REFERENCES hirelix_private_jobs(user_id,id),
  FOREIGN KEY(user_id,file_id) REFERENCES hirelix_private_files(user_id,id),
  FOREIGN KEY(user_id,target_person_id) REFERENCES hirelix_agent_people(user_id,id)
);

CREATE TABLE IF NOT EXISTS hirelix_private_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  person_id uuid NOT NULL, record_id uuid, chunk_number integer NOT NULL DEFAULT 0,
  content text NOT NULL, content_hash text NOT NULL, model text NOT NULL,
  embedding vector(1536) NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple',content)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(user_id,person_id) REFERENCES hirelix_agent_people(user_id,id) ON DELETE CASCADE,
  FOREIGN KEY(user_id,record_id) REFERENCES hirelix_private_records(user_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS private_embeddings_owner ON hirelix_private_embeddings(user_id,person_id);
CREATE INDEX IF NOT EXISTS private_embeddings_text ON hirelix_private_embeddings USING gin(search_vector);

CREATE TABLE IF NOT EXISTS hirelix_private_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT true, timezone text NOT NULL,
  weekday integer NOT NULL CHECK (weekday BETWEEN 0 AND 6), local_time text NOT NULL,
  interval_weeks integer NOT NULL DEFAULT 1 CHECK (interval_weeks IN (1,2)),
  next_run_at timestamptz NOT NULL, last_period_end timestamptz,
  only_when_changed boolean NOT NULL DEFAULT true, last_record_digest text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,role_id), FOREIGN KEY(user_id,role_id) REFERENCES hirelix_private_roles(user_id,id)
);
CREATE INDEX IF NOT EXISTS private_schedules_due ON hirelix_private_schedules(next_run_at) WHERE enabled;

CREATE TABLE IF NOT EXISTS hirelix_private_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  title text NOT NULL, href text NOT NULL, kind text NOT NULL,
  request_key text NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,request_key)
);

-- Preserve previous user data. A legacy brief keeps its original meaning and content.
INSERT INTO hirelix_private_roles(user_id,title,client_name,jd_text,source_search_id,created_at,updated_at)
SELECT user_id,coalesce(nullif(title,''),'Untitled role'),'',coalesce(jd_text,''),id,coalesce(created_at,now()),now()
FROM hirelix_searches WHERE user_id IS NOT NULL
ON CONFLICT(user_id,source_search_id) DO NOTHING;
INSERT INTO hirelix_private_deliverables(user_id,role_id,kind,title,content,legacy_brief_id,created_at,updated_at)
SELECT b.user_id,r.id,'legacy',b.title,b.content,b.id,b.created_at,b.updated_at
FROM hirelix_agent_briefs b JOIN hirelix_private_roles r ON r.source_search_id=b.search_id AND r.user_id=b.user_id
ON CONFLICT(legacy_brief_id) DO NOTHING;
INSERT INTO hirelix_private_records(id,user_id,person_id,kind,title,content,created_at)
SELECT id,user_id,id,'note','Previously saved note',note,created_at FROM hirelix_agent_people p
WHERE note<>'' AND NOT EXISTS(SELECT 1 FROM hirelix_private_records r WHERE r.user_id=p.user_id AND r.person_id=p.id AND r.content=p.note AND r.kind='note') ON CONFLICT(id) DO NOTHING;
INSERT INTO hirelix_private_role_candidates(user_id,role_id,person_id)
SELECT p.user_id,r.id,p.id FROM hirelix_agent_people p JOIN hirelix_private_roles r
ON r.source_search_id=p.source_search_id AND r.user_id=p.user_id ON CONFLICT DO NOTHING;
INSERT INTO hirelix_private_versions(user_id,entity_type,entity_id,version,snapshot)
SELECT user_id,'person',id,version,to_jsonb(p) FROM hirelix_agent_people p ON CONFLICT DO NOTHING;
INSERT INTO hirelix_private_versions(user_id,entity_type,entity_id,version,snapshot)
SELECT user_id,'role',id,version,to_jsonb(r) FROM hirelix_private_roles r ON CONFLICT DO NOTHING;
INSERT INTO hirelix_private_versions(user_id,entity_type,entity_id,version,snapshot)
SELECT user_id,'record',id,version,to_jsonb(r) FROM hirelix_private_records r ON CONFLICT DO NOTHING;
INSERT INTO hirelix_private_versions(user_id,entity_type,entity_id,version,snapshot)
SELECT user_id,'role_candidate',id,version,to_jsonb(r) FROM hirelix_private_role_candidates r ON CONFLICT DO NOTHING;
INSERT INTO hirelix_private_versions(user_id,entity_type,entity_id,version,snapshot)
SELECT user_id,'deliverable',id,version,to_jsonb(r) FROM hirelix_private_deliverables r ON CONFLICT DO NOTHING;

COMMIT;
