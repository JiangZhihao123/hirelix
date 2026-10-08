import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { generateEmbeddings, getEmbeddingConfig } from "@/lib/candidate-index/embedding";
import { owned, rows, enqueue, WorkspaceError, type Runner } from "./database";
import { idSchema, type Role, type SourceRecord } from "./types";
import { embedRetrievalQuery } from "./retrieval";
import type { JobHandler } from "./jobs";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
async function roleSource(userId: string, id: string, tx: Runner = db) {
  const role = await owned<Role>(userId, "role", id, tx);
  const records = await rows<SourceRecord>(sql`SELECT * FROM hirelix_private_records WHERE user_id=${userId}::uuid AND role_id=${id}::uuid AND person_id IS NULL ORDER BY id`, tx);
  const sources = [{ id: null as string | null, content: JSON.stringify({ title: role.title, client: role.client_name, jd: role.jd_text, brief: role.brief, status: role.status }) }, ...records.map(record => ({id: record.id, content: JSON.stringify({ title: record.title, content: record.content, occurred_at: record.occurred_at })}))];
  const chunks = sources.flatMap(source => {
    const chars = Array.from(source.content);
    return Array.from({ length: Math.ceil(chars.length / 1600) }, (_, part) => {
      const content = `${role.client_name} · ${role.title}\n${chars.slice(part * 1600, part * 1600 + 1800).join("")}`;
      return { record_id: source.id, content, part, hash: hash(content) };
    });
  });
  return { chunks, signature: hash(JSON.stringify(sources)) };
}
export const indexRole: JobHandler = async (job, progress) => {
  const id = idSchema.parse(job.payload.role_id);
  let source: Awaited<ReturnType<typeof roleSource>>;
  try { source = await roleSource(job.user_id, id); }
  catch (cause) { if (cause instanceof WorkspaceError && cause.status === 404) return {result: {deleted: true}}; throw cause; }
  await progress("Indexing the job description and related records");
  const model = getEmbeddingConfig().model;
  const prior = await rows<{content_hash: string; embedding: string}>(sql`SELECT content_hash,embedding::text FROM hirelix_private_embeddings WHERE user_id=${job.user_id}::uuid AND role_id=${id}::uuid AND model=${model}`);
  const cache = new Map(prior.map(item => [item.content_hash, JSON.parse(item.embedding) as number[]]));
  const missing = source.chunks.filter(chunk => !cache.has(chunk.hash));
  for (let start = 0; start < missing.length; start += 64) {
    const batch = missing.slice(start, start + 64);
    const output = await generateEmbeddings(batch.map(chunk => chunk.content));
    batch.forEach((chunk, index) => cache.set(chunk.hash, output.embeddings[index]));
  }
  return { result: {role_id: id, passages: source.chunks.length}, apply: async tx => {
    try { await owned(job.user_id, "role", id, tx, true); }
    catch (cause) { if (cause instanceof WorkspaceError && cause.status === 404) return {deleted: true}; throw cause; }
    if ((await roleSource(job.user_id, id, tx)).signature !== source.signature) {
      await enqueue(job.user_id, "index", `role-refresh:${job.id}`, {role_id: id}, tx);
      return {superseded: true};
    }
    await tx.execute(sql`DELETE FROM hirelix_private_embeddings WHERE user_id=${job.user_id}::uuid AND role_id=${id}::uuid`);
    for (const chunk of source.chunks) await tx.execute(sql`INSERT INTO hirelix_private_embeddings(user_id,role_id,record_id,chunk_number,content,content_hash,model,embedding) VALUES(${job.user_id}::uuid,${id}::uuid,${chunk.record_id}::uuid,${chunk.part},${chunk.content},${chunk.hash},${model},${JSON.stringify(cache.get(chunk.hash))}::vector)`);
  }};
};
export async function retrieveRoles(userId: string, query: string) {
  const model = getEmbeddingConfig().model;
  const fresh = sql`e.created_at>=greatest(r.updated_at,(SELECT max(updated_at) FROM hirelix_private_records records WHERE records.user_id=r.user_id AND records.role_id=r.id AND records.person_id IS NULL))`;
  const [coverage] = await rows<{total: number; indexed: number}>(sql`SELECT count(*)::int AS total,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM hirelix_private_embeddings e WHERE e.user_id=r.user_id AND e.role_id=r.id AND e.model=${model} AND ${fresh}))::int AS indexed FROM hirelix_private_roles r WHERE r.user_id=${userId}::uuid`);
  if (!coverage.total) return { roles: [] as Role[], coverage };
  if (!coverage.indexed) throw new WorkspaceError("Your job descriptions are still being indexed. Open the role directly or retry after indexing completes.",409);
  const output = await embedRetrievalQuery(query);
  const matches = await rows<Role>(sql`SELECT r.* FROM hirelix_private_roles r JOIN LATERAL (SELECT min(e.embedding<=>${JSON.stringify(output.embeddings[0])}::vector) AS distance FROM hirelix_private_embeddings e WHERE e.user_id=r.user_id AND e.role_id=r.id AND e.model=${model} AND ${fresh}) hit ON hit.distance IS NOT NULL WHERE r.user_id=${userId}::uuid ORDER BY hit.distance,r.id LIMIT 10`);
  return {roles: matches, coverage};
}
