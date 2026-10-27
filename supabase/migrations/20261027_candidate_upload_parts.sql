-- Temporary upload parts share existing private file storage. Only a fully
-- assembled, hash-verified original is attached to a conversation/import.
ALTER TABLE hirelix_private_files
  ADD COLUMN upload_id uuid,
  ADD COLUMN upload_part integer,
  ADD CONSTRAINT hirelix_private_files_upload_part_check CHECK (
    (upload_id IS NULL AND upload_part IS NULL) OR
    (upload_id IS NOT NULL AND upload_part IS NOT NULL AND upload_part >= 0 AND upload_part < 25)
  );
CREATE UNIQUE INDEX hirelix_private_files_upload_part_unique
  ON hirelix_private_files(user_id, upload_id, upload_part)
  WHERE upload_id IS NOT NULL;
