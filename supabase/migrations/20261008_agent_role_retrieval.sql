BEGIN;
ALTER TABLE hirelix_private_embeddings ALTER COLUMN person_id DROP NOT NULL;
ALTER TABLE hirelix_private_embeddings ADD COLUMN role_id uuid;
ALTER TABLE hirelix_private_embeddings ADD CONSTRAINT private_embeddings_role_owner FOREIGN KEY(user_id,role_id) REFERENCES hirelix_private_roles(user_id,id) ON DELETE CASCADE;
ALTER TABLE hirelix_private_embeddings ADD CONSTRAINT private_embeddings_one_object CHECK ((person_id IS NULL) <> (role_id IS NULL));
CREATE INDEX private_embeddings_role ON hirelix_private_embeddings(user_id,role_id);
INSERT INTO hirelix_private_jobs(user_id,kind,status,request_key,payload)
SELECT user_id,'index','queued','role-index-v3:'||id,jsonb_build_object('role_id',id) FROM hirelix_private_roles
ON CONFLICT(user_id,request_key) DO NOTHING;
COMMIT;
