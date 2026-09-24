import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  generateEmbeddings,
  getEmbeddingConfig,
} from "@/lib/candidate-index/embedding";
import { enqueue, owned, rows, WorkspaceError, type Runner } from "./database";
import { idSchema, type Person, type SourceRecord } from "./types";
import type { JobHandler } from "./jobs";

const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
type Chunk = {
  person_id: string;
  record_id: string | null;
  chunk_number: number;
  content: string;
  content_hash: string;
};
async function candidateSource(
  userId: string,
  personId: string,
  tx: Runner = db,
) {
  const person = await owned<Person>(userId, "person", personId, tx);
  const records = await rows<SourceRecord>(
    sql`SELECT * FROM hirelix_private_records WHERE user_id=${userId}::uuid AND person_id=${personId}::uuid ORDER BY id`,
    tx,
  );
  const sources = [
    {
      id: null,
      content: JSON.stringify({
        name: person.name,
        headline: person.headline,
        location: person.location,
        email: person.email,
        phone: person.phone,
        skills: person.skills,
        profile_url: person.profile_url,
        note: person.note,
        profile: person.profile,
      }),
    },
    ...records.map((record) => ({
      id: record.id,
      content: JSON.stringify({
        title: record.title,
        kind: record.kind,
        content: record.content,
        occurred_at: record.occurred_at,
        recorded_at: record.created_at,
        role_id: record.role_id,
        source_url: record.source_url,
      }),
    })),
  ];
  const signature = digest(JSON.stringify(sources));
  const chunks: Chunk[] = [];
  for (const source of sources) {
    const chars = Array.from(source.content);
    for (let start = 0, part = 0; start < chars.length; start += 1600, part++) {
      const content = `Candidate: ${person.name}\n${chars.slice(start, start + 1800).join("")}`;
      chunks.push({
        person_id: personId,
        record_id: source.id,
        chunk_number: part,
        content,
        content_hash: digest(content),
      });
    }
  }
  return { person, records, chunks, signature };
}
export const indexCandidate: JobHandler = async (job, progress) => {
  const personId = idSchema.parse(job.payload.person_id);
  let source: Awaited<ReturnType<typeof candidateSource>>;
  try {
    source = await candidateSource(job.user_id, personId);
  } catch (error) {
    if (error instanceof WorkspaceError && error.status === 404)
      return { result: { deleted: true } };
    throw error;
  }
  await progress(`Reading ${source.records.length} source records`);
  const model = getEmbeddingConfig().model;
  const existing = await rows<{ content_hash: string; embedding: string }>(
    sql`SELECT content_hash,embedding::text AS embedding FROM hirelix_private_embeddings WHERE user_id=${job.user_id}::uuid AND person_id=${personId}::uuid AND model=${model}`,
  );
  const cache = new Map(
    existing.map((item) => [
      item.content_hash,
      JSON.parse(item.embedding) as number[],
    ]),
  );
  const missing = source.chunks.filter(
    (chunk) => !cache.has(chunk.content_hash),
  );
  if (missing.length) {
    await progress(
      `Indexing ${missing.length} passages from this candidate's records`,
    );
    const output = await generateEmbeddings(
      missing.map((chunk) => chunk.content),
    );
    missing.forEach((chunk, index) =>
      cache.set(chunk.content_hash, output.embeddings[index]),
    );
  }
  return {
    result: { person_id: personId, passages: source.chunks.length },
    apply: async (tx) => {
      // A profile can be edited while the provider runs. Never replace new material with an old snapshot.
      try {
        await owned(job.user_id, "person", personId, tx, true);
      } catch (error) {
        if (error instanceof WorkspaceError && error.status === 404)
          return { deleted: true };
        throw error;
      }
      const current = await candidateSource(job.user_id, personId, tx);
      if (current.signature !== source.signature) {
        await enqueue(
          job.user_id,
          "index",
          `index-refresh:${job.id}`,
          { person_id: personId },
          tx,
        );
        return { superseded: true };
      }
      await tx.execute(
        sql`DELETE FROM hirelix_private_embeddings WHERE user_id=${job.user_id}::uuid AND person_id=${personId}::uuid`,
      );
      for (let start = 0; start < source.chunks.length; start += 50) {
        const batch = source.chunks.slice(start, start + 50);
        await tx.execute(
          sql`INSERT INTO hirelix_private_embeddings(user_id,person_id,record_id,chunk_number,content,content_hash,model,embedding) VALUES ${sql.join(
            batch.map(
              (chunk) =>
                sql`(${job.user_id}::uuid,${personId}::uuid,${chunk.record_id}::uuid,${chunk.chunk_number},${chunk.content},${chunk.content_hash},${model},${JSON.stringify(cache.get(chunk.content_hash))}::vector)`,
            ),
            sql`, `,
          )}`,
        );
      }
    },
  };
};

export const retrievalInput = z.object({
  query: z.string().trim().min(1).max(4000),
  location: z.string().max(250).default(""),
  expertise: z.string().max(100).default(""),
  limit: z.number().int().min(1).max(50).default(20),
});
export async function retrieveCandidates(userId: string, value: unknown) {
  const input = retrievalInput.parse(value);
  const model = getEmbeddingConfig().model;
  const [coverage] = await rows<{
    total: number;
    indexed: number;
    pending: number;
    failed: number;
  }>(
    sql`SELECT count(*)::int AS total,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM hirelix_private_embeddings e WHERE e.user_id=p.user_id AND e.person_id=p.id AND e.model=${model}))::int AS indexed,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM hirelix_private_jobs j WHERE j.user_id=p.user_id AND j.payload->>'person_id'=p.id::text AND j.kind='index' AND j.status IN ('queued','running')))::int AS pending,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM hirelix_private_jobs j WHERE j.user_id=p.user_id AND j.payload->>'person_id'=p.id::text AND j.kind='index' AND j.status='error' AND NOT EXISTS(SELECT 1 FROM hirelix_private_jobs newer WHERE newer.user_id=j.user_id AND newer.kind='index' AND newer.payload->>'person_id'=p.id::text AND newer.created_at>j.created_at)))::int AS failed FROM hirelix_agent_people p WHERE user_id=${userId}::uuid`,
  );
  if (!coverage.total) return { matches: [], coverage, query: input.query };
  if (!coverage.indexed)
    throw new WorkspaceError(
      "Your candidates have not been indexed yet. Check import and indexing tasks, or use name and field search.",
      409,
    );
  const output = await generateEmbeddings([input.query]);
  const vector = JSON.stringify(output.embeddings[0]);
  // Exact vector scan of every indexed passage owned by this user; no newest-N cutoff.
  const evidence = await rows<{
    person_id: string;
    record_id: string | null;
    content: string;
    distance: number;
    person: Person;
  }>(
    sql`WITH ranked AS (SELECT e.person_id,e.record_id,e.content,e.embedding<=>${vector}::vector AS distance,to_jsonb(p) AS person,row_number() OVER(PARTITION BY e.person_id ORDER BY e.embedding<=>${vector}::vector,e.id) AS position FROM hirelix_private_embeddings e JOIN hirelix_agent_people p ON p.user_id=e.user_id AND p.id=e.person_id WHERE e.user_id=${userId}::uuid AND e.model=${model} AND (${!input.location} OR p.location=${input.location}) AND (${!input.expertise} OR ${input.expertise}=ANY(p.skills))) SELECT person_id,record_id,content,distance,person FROM ranked WHERE position=1 ORDER BY distance,person_id LIMIT ${input.limit}`,
  );
  return {
    query: input.query,
    coverage,
    matches: evidence.map((item) => ({
      ...item,
      source_href: `/app/candidates?person=${item.person_id}${item.record_id ? `&record=${item.record_id}` : ""}`,
    })),
    scope:
      "Semantic suggestions from indexed candidate records. Similarity is not a role assessment or proof that other candidates are unsuitable.",
  };
}
export const retrieveJob: JobHandler = async (job, progress) => {
  await progress("Searching your indexed candidate records");
  const result = await retrieveCandidates(job.user_id, job.payload);
  return { result };
};
