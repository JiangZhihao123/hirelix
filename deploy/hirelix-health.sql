-- Read-only, bounded checks shared by production health and real DB regression.
SET statement_timeout='10s';
SELECT
  (SELECT count(*) FROM hirelix_private_jobs j
   WHERE (j.status='queued' AND j.updated_at < now()-interval '10 minutes'
          AND (j.kind<>'chat' OR EXISTS (
            SELECT 1 FROM hirelix_private_conversations c
            WHERE c.user_id=j.user_id AND c.id::text=j.payload->>'conversation_id'
              AND NOT c.stopped)))
      OR (j.status='running' AND j.lease_until < now()-interval '3 minutes'))
  + (SELECT count(*) FROM hirelix_private_schedules s
     WHERE s.kind='reminder' AND s.enabled AND s.completed_at IS NULL
       AND s.next_run_at < now()-interval '10 minutes')
  + (SELECT count(*) FROM hirelix_private_schedules s
     JOIN hirelix_private_roles r ON r.id=s.role_id AND r.user_id=s.user_id
     WHERE s.kind='search_update' AND s.enabled AND s.error IS NULL AND r.status='active'
       AND s.next_run_at < now()-interval '10 minutes'
       AND NOT EXISTS (SELECT 1 FROM hirelix_private_jobs j
                       WHERE j.id=s.last_job_id AND j.user_id=s.user_id AND j.status='error'))
  AS stalled;
