import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../../src/db/client";
import { generateEmbeddings } from "../../src/lib/candidate-index/embedding";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import { createPerson } from "../../src/lib/workspace/people";
import { enqueue, json, rows } from "../../src/lib/workspace/database";
import {
  indexCandidate,
  retrieveCandidates,
} from "../../src/lib/workspace/retrieval";
const database = new URL(
  process.env.DATABASE_URL ?? "postgresql://invalid/invalid",
);
if (
  !["127.0.0.1", "localhost"].includes(database.hostname) ||
  !database.pathname.startsWith("/hirelix_workspace_qa_")
)
  throw new Error("Use an isolated local workspace QA database");
if (process.env.WORKSPACE_REAL_AI_TEST !== "true")
  throw new Error(
    "Set WORKSPACE_REAL_AI_TEST=true to run the real embedding provider test",
  );
initializeGlobalOutboundProxy();
const owner = randomUUID(),
  other = randomUUID();
after(async () => {
  await closeDb();
});

test(
  "real embeddings: semantic retrieval returns an older candidate beyond 120 newer profiles, with owner isolation and sources",
  { timeout: 180000 },
  async () => {
    const person = await createPerson(owner, {
      name: "QA Maya Chen",
      headline: "Product director",
      note: "Spoke in January 2024. Built enterprise SaaS platform products and managed a team of twelve product managers. Based in London.",
    });
    await db.execute(
      sql`UPDATE hirelix_agent_people SET created_at='2024-01-01',updated_at='2024-01-01' WHERE id=${person.id}::uuid`,
    );
    const job = await enqueue(owner, "index", randomUUID(), {
      person_id: person.id,
    });
    const prepared = await indexCandidate(job, async () => {});
    await db.transaction(async (tx) => {
      await prepared.apply?.(tx);
    });
    await db.execute(
      sql`UPDATE hirelix_private_jobs SET status='done' WHERE user_id=${owner}::uuid AND kind='index'`,
    );
    const distractors = Array.from({ length: 130 }, (_, index) => ({
      id: randomUUID(),
      name: `QA Finance Specialist ${index + 1}`,
      content: `Finance specialist ${index + 1}. Corporate accounting, tax reporting and accounts payable. No product management experience.`,
    }));
    await db.execute(
      sql`INSERT INTO hirelix_agent_people(id,user_id,name,headline,profile) VALUES ${sql.join(
        distractors.map(
          (item) =>
            sql`(${item.id}::uuid,${owner}::uuid,${item.name},'Finance specialist',${json({ summary: item.content })})`,
        ),
        sql`, `,
      )}`,
    );
    const output = await generateEmbeddings(
      distractors.map((item) => item.content),
    );
    await db.execute(
      sql`INSERT INTO hirelix_private_embeddings(user_id,person_id,content,content_hash,model,embedding) VALUES ${sql.join(
        distractors.map(
          (item, index) =>
            sql`(${owner}::uuid,${item.id}::uuid,${item.content},${item.id},${output.model},${JSON.stringify(output.embeddings[index])}::vector)`,
        ),
        sql`, `,
      )}`,
    );
    const foreign = await createPerson(other, {
      name: "PRIVATE OTHER USER",
      note: "Product leader managed enterprise SaaS platform and product teams in London.",
    });
    const foreignJob = await enqueue(other, "index", randomUUID(), {
      person_id: foreign.id,
    });
    const foreignPrepared = await indexCandidate(foreignJob, async () => {});
    await db.transaction(async (tx) => {
      await foreignPrepared.apply?.(tx);
    });
    const result = await retrieveCandidates(owner, {
      query: "Who did I speak to before who led B2B software product teams?",
      limit: 10,
    });
    assert.equal(result.coverage.total, 131);
    assert.equal(result.coverage.indexed, 131);
    assert.equal(result.matches[0].person_id, person.id);
    assert(result.matches.every((item) => item.person.user_id === owner));
    assert(result.matches[0].source_href.includes(person.id));
    console.log(
      JSON.stringify({
        library: result.coverage.total,
        indexed: result.coverage.indexed,
        returned_oldest: result.matches[0].person.name,
        source_record: result.matches[0].record_id !== null,
        owner_isolation: true,
      }),
    );
    const [jobs] = await rows<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND kind='index'`,
    );
    assert(jobs.count > 0);
  },
);
