/** Read-only audit of the actual local cold-start runs; never targets production. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { closeDb } from "../../src/db/client";
import { rows } from "../../src/lib/workspace/database";
import { readFile as originalFile } from "../../src/lib/workspace/files";
const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.port !== "15432" && database.pathname.startsWith("/hirelix_workspace_qa_coldstart_"));
const directory = "/Users/noah/projects/hirelix-local-archive/2026-10-27";
async function main() {
  const [conversation] = await rows<{user_id:string}>(sql`SELECT user_id FROM hirelix_private_conversations WHERE id='088640ea-5b6b-4e46-8934-af5ea93ff10d'::uuid`);
  assert.ok(conversation);
  const owner = conversation.user_id;
  const imports = await rows<{id:string; status:string; saved:number}>(sql`SELECT j.id,j.status,(SELECT count(*)::int FROM hirelix_private_import_rows r WHERE r.job_id=j.id AND r.status='saved') saved FROM hirelix_private_jobs j WHERE j.user_id=${owner}::uuid AND j.kind='import'`);
  assert.equal(imports.length, 1); assert.equal(imports[0].status, "done"); assert.equal(imports[0].saved, 3);
  const [counts] = await rows<{people:number; roles:number; sends:number; parts:number}>(sql`SELECT
    (SELECT count(*)::int FROM hirelix_agent_people WHERE user_id=${owner}::uuid) people,
    (SELECT count(*)::int FROM hirelix_private_roles WHERE user_id=${owner}::uuid) roles,
    (SELECT count(*)::int FROM hirelix_private_email_deliveries WHERE user_id=${owner}::uuid) sends,
    (SELECT count(*)::int FROM hirelix_private_files WHERE user_id=${owner}::uuid AND upload_id IS NOT NULL) parts`);
  assert.deepEqual(counts, { people:3, roles:0, sends:0, parts:0 });
  const files = await rows<{id:string; name:string; byte_size:number; sha256:string}>(sql`SELECT id,name,byte_size,sha256 FROM hirelix_private_files WHERE user_id=${owner}::uuid AND name IN ('large-upload-candidates.zip','历史候选人-大文件.zip') AND upload_id IS NULL`);
  assert.equal(files.length, 2);
  for (const file of files) {
    const bytes = await readFile(`${directory}/browser/${file.name}`);
    assert.equal(file.byte_size, bytes.length); assert.ok(bytes.length > 4 * 1024 * 1024);
    assert.equal(file.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.deepEqual((await originalFile(owner, file.id)).bytes, bytes);
  }
  const source = JSON.parse(await readFile(`${directory}/coldstart-public/public-sourcing.json`, "utf8"));
  const model = source.transport.filter((item: {phase:string;body?:{messages?:unknown[]}}) => item.phase === "request" && item.body?.messages).at(-1);
  const observations = model.body.messages.filter((message: {role:string}) => message.role === "tool").map((message: {content:string}) => JSON.parse(message.content));
  const skill = observations.find((item: {result?:{name?:string}}) => item.result?.name === "public-sourcing");
  assert.equal(skill.result.instructions, await readFile("src/lib/workspace/skills/public-sourcing.md", "utf8"));
  let sources = 0, failures = 0;
  for (const response of source.transport.filter((item: {phase:string;path:string}) => item.phase === "response" && item.path.startsWith("/v1/tools/"))) {
    if (response.status !== 200) {
      assert.ok(observations.some((item: {ok:boolean;error?:{message:string}}) => !item.ok && item.error?.message.includes(`HTTP ${response.status}`)));
      failures++; continue;
    }
    const request = source.transport.find((item: {id:string;phase:string}) => item.id === response.id && item.phase === "request");
    const observed = observations.find((item: {result?:{query?:string}}) => item.result?.query === request.body.query);
    assert.ok(observed?.ok);
    for (const result of observed.result.sources) {
      const returned = response.body.results.find((item: {url:string}) => new URL(item.url).href === result.href);
      assert.ok(returned, "A source delivered to the model must come from the actual provider response");
      assert.equal(result.summary, returned.summary.slice(0, 4000));
      assert.equal(result.snippet, returned.snippet.slice(0, 2000));
      assert.equal(result.publishedAt, returned.date);
      assert.ok(observed.result.searched_at);
      sources++;
    }
  }
  const evidence = { environment: "local isolated PostgreSQL; actual Chrome + Google OAuth + independent Agent worker", import_jobs: imports, large_files: files.map(file => ({name:file.name, bytes:file.byte_size, sha256:file.sha256})), counts, public_transport: {sources_preserved_to_model:sources, provider_failures_exposed:failures, research_only_counts:source.counts}, production_tested:false };
  await writeFile(`${directory}/coldstart-audit.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
}
void main().finally(closeDb);
