-- Preserve imported files without assuming that every attachment is a CV.
ALTER TABLE hirelix_private_records DROP CONSTRAINT hirelix_private_records_kind_check;
ALTER TABLE hirelix_private_records ADD CONSTRAINT hirelix_private_records_kind_check
  CHECK (kind IN ('note','call','email','feedback','cv','profile','jd','event','attachment'));
