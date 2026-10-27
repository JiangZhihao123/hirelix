import { sql } from "drizzle-orm";
import { owned, rows, WorkspaceError } from "./database";
import type { ImportRow, Job } from "./types";

// Historical imports and batch receipts remain readable. No legacy import
// preparation, field mapping or review-and-apply workflow is executable.
export async function importDetails(userId: string, id: string, page = 1) {
  const job = await owned<Job>(userId, "job", id);
  if (job.kind !== "import") throw new WorkspaceError("This is not an import task", 404);
  const batch = job.payload.operation === "record_batch";
  const items = batch
    ? await rows<{row_number: number; batch_receipt: unknown}>(sql`SELECT row_number,batch_receipt FROM hirelix_private_import_rows WHERE user_id=${userId}::uuid AND job_id=${id}::uuid ORDER BY row_number LIMIT 50 OFFSET ${(page - 1) * 50}`)
    : await rows<ImportRow>(sql`SELECT * FROM hirelix_private_import_rows WHERE user_id=${userId}::uuid AND job_id=${id}::uuid ORDER BY row_number LIMIT 50 OFFSET ${(page - 1) * 50}`);
  const counts = batch ? [] : await rows<{status: string; count: number}>(sql`SELECT status,count(*)::int AS count FROM hirelix_private_import_rows WHERE user_id=${userId}::uuid AND job_id=${id}::uuid GROUP BY status`);
  // Preserve historical recovery facts only from a later saved owned source.
  const savedProfiles = !batch && job.status === "error" && typeof job.payload.file_id === "string"
    ? await rows<{id: string; name: string}>(sql`SELECT DISTINCT p.id,p.name FROM hirelix_private_records r
        JOIN hirelix_agent_people p ON p.id=r.person_id AND p.user_id=r.user_id
        WHERE r.user_id=${userId}::uuid AND r.file_id=${job.payload.file_id}::uuid
          AND r.kind IN ('profile','cv') AND r.created_at>${job.updated_at}::timestamptz`)
    : [];
  return {job, items, counts, savedProfiles, page, page_size: 50};
}
