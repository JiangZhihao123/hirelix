import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { workspaceApi } from "@/lib/workspace/http";
import { rows } from "@/lib/workspace/database";

export function GET(req: NextRequest) {
  return workspaceApi(req, async user => {
    const [conversations, drafts] = await Promise.all([
      rows(sql`SELECT c.id,c.title,c.updated_at,latest.content AS excerpt,work.status,revision.status AS revision_status,revision.result->'applied_version' AS revision_applied
        FROM hirelix_private_conversations c
        LEFT JOIN LATERAL (SELECT content,metadata FROM hirelix_agent_messages m WHERE m.user_id=c.user_id AND m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) latest ON true
        LEFT JOIN LATERAL (SELECT status FROM hirelix_private_jobs j WHERE j.user_id=c.user_id AND j.kind='chat' AND j.payload->>'conversation_id'=c.id::text ORDER BY j.created_at DESC LIMIT 1) work ON true
        LEFT JOIN hirelix_private_jobs revision ON revision.user_id=c.user_id AND revision.id::text=latest.metadata->'revision'->>'job_id' AND revision.kind='revision'
        WHERE c.user_id=${user.id}::uuid ORDER BY c.updated_at DESC,c.id LIMIT 3`),
      rows(sql`SELECT d.id,d.title,d.role_id,d.kind,d.updated_at,r.client_name
        FROM hirelix_private_deliverables d JOIN hirelix_private_roles r ON r.id=d.role_id AND r.user_id=d.user_id
        WHERE d.user_id=${user.id}::uuid AND d.status='draft' ORDER BY d.updated_at DESC,d.id LIMIT 2`),
    ]);
    return { conversations, drafts };
  });
}
