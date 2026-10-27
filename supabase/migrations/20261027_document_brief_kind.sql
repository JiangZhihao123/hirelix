-- Briefs are ordinary internal materials in the existing deliverables table.
BEGIN;
ALTER TABLE hirelix_private_deliverables DROP CONSTRAINT IF EXISTS hirelix_private_deliverables_kind_check;
ALTER TABLE hirelix_private_deliverables ADD CONSTRAINT hirelix_private_deliverables_kind_check
  CHECK (kind IN ('submission','search_update','brief','legacy'));
COMMIT;
