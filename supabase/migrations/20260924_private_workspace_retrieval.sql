BEGIN;
ALTER TABLE hirelix_private_jobs DROP CONSTRAINT IF EXISTS hirelix_private_jobs_kind_check;
ALTER TABLE hirelix_private_jobs ADD CONSTRAINT hirelix_private_jobs_kind_check CHECK (kind IN ('chat','import','index','assessment','deliverable','revision','brief_proposal','retrieval'));
COMMIT;
