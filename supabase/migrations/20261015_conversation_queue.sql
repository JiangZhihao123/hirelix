-- A stopped conversation holds its pending messages until explicitly resumed.
ALTER TABLE hirelix_private_conversations ADD COLUMN IF NOT EXISTS stopped boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS private_jobs_conversation_queue ON hirelix_private_jobs(user_id,(payload->>'conversation_id'),created_at,id) WHERE kind='chat' AND status IN ('queued','running');
