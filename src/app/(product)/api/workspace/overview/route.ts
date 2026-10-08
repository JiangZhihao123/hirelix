import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { workspaceApi } from "@/lib/workspace/http";
import { rows } from "@/lib/workspace/database";

export function GET(req: NextRequest) {
  return workspaceApi(req, async user => {
    const [conversations, drafts, ongoing, agreements] = await Promise.all([
      rows(sql`SELECT c.id,c.title,c.updated_at,latest.content AS excerpt,work.status,revision.status AS revision_status,revision.result->'applied_version' AS revision_applied
        FROM hirelix_private_conversations c
        LEFT JOIN LATERAL (SELECT content,metadata FROM hirelix_agent_messages m WHERE m.user_id=c.user_id AND m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) latest ON true
        LEFT JOIN LATERAL (SELECT status FROM hirelix_private_jobs j WHERE j.user_id=c.user_id AND j.kind='chat' AND j.payload->>'conversation_id'=c.id::text ORDER BY j.created_at DESC LIMIT 1) work ON true
        LEFT JOIN hirelix_private_jobs revision ON revision.user_id=c.user_id AND revision.id::text=latest.metadata->'revision'->>'job_id' AND revision.kind='revision'
        WHERE c.user_id=${user.id}::uuid ORDER BY c.updated_at DESC,c.id LIMIT 3`),
      rows(sql`SELECT d.id,d.title,d.role_id,d.kind,d.updated_at,r.client_name
        FROM hirelix_private_deliverables d JOIN hirelix_private_roles r ON r.id=d.role_id AND r.user_id=d.user_id
        WHERE d.user_id=${user.id}::uuid AND d.status='draft' ORDER BY d.updated_at DESC,d.id LIMIT 2`),
      rows(sql`SELECT j.id,j.kind,j.status,j.updated_at,c.id AS conversation_id,c.title
        FROM hirelix_private_jobs j JOIN hirelix_private_conversations c ON c.user_id=j.user_id AND c.id::text=j.payload->>'conversation_id'
        WHERE j.user_id=${user.id}::uuid AND j.kind IN ('chat','deliverable') AND j.status IN ('queued','running','error')
        ORDER BY CASE WHEN j.status='error' THEN 0 ELSE 1 END,j.updated_at DESC LIMIT 3`),
      rows(sql`SELECT s.id,s.role_id,s.next_run_at,s.timezone,s.error,r.client_name,r.title,
        (SELECT m.conversation_id FROM hirelix_agent_messages m WHERE m.user_id=s.user_id AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(m.metadata->'schedules','[]'::jsonb)) receipt WHERE receipt->>'id'=s.id::text) ORDER BY m.created_at DESC,m.id DESC LIMIT 1) AS conversation_id
        FROM hirelix_private_schedules s JOIN hirelix_private_roles r ON r.id=s.role_id AND r.user_id=s.user_id
        WHERE s.user_id=${user.id}::uuid AND s.enabled AND r.status='active' ORDER BY s.next_run_at LIMIT 3`),
    ]);
    return { conversations, drafts, ongoing, agreements };
  });
}
