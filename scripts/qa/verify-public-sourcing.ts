// Real-provider verification for public research; run only against an empty local QA database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { closeDb } from "../../src/db/client";
import { agentCreditContext } from "../../src/lib/agent-credit-context";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import { conversationDetails, sendMessage } from "../../src/lib/workspace/conversations";
import { rows } from "../../src/lib/workspace/database";
import { startWorkspaceWorker, stopWorkspaceWorker } from "../../src/lib/workspace/worker";
import type { Job } from "../../src/lib/workspace/types";

const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.port !== "15432" && database.pathname.startsWith("/hirelix_workspace_qa_coldstart_"), "Use an isolated local cold-start QA database");
assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
const directory = resolve(process.env.WORKSPACE_QA_EVIDENCE_DIR || "");
assert.ok(directory.startsWith("/Users/noah/projects/hirelix-local-archive/"), "Use a local QA evidence directory");

async function main() {
  if (process.argv[2] === "worker") {
    await mkdir(`${directory}/transport`, { recursive: true });
    const actualFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const observe = url.hostname === "api.deepseek.com" && typeof init?.body === "string";
      if (!observe) return actualFetch(input, init);
      const id = randomUUID();
      const jobId = agentCreditContext.getStore()?.id;
      const record = (event: object) => writeFile(`${directory}/transport/${Date.now()}-${randomUUID()}.json`, JSON.stringify(event));
      // Request bodies contain only this QA's synthetic role and public data; headers are never recorded.
      await record({ id, job_id: jobId, phase: "request", path: url.pathname, body: JSON.parse(init!.body as string) });
      try {
        const response = await actualFetch(input, init);
        await record({ id, job_id: jobId, phase: "connected", path: url.pathname, status: response.status });
        if (url.pathname.startsWith("/v1/tools/")) {
          const body = await response.clone().json().catch(() => null);
          await record({ id, job_id: jobId, phase: "response", path: url.pathname, status: response.status, body });
        }
        return response;
      } catch (error) {
        await record({ id, job_id: jobId, phase: "error", path: url.pathname, error_type: error instanceof Error ? error.name : "Unknown" });
        throw error;
      }
    };
    initializeGlobalOutboundProxy();
    startWorkspaceWorker();
    const stop = async () => { await stopWorkspaceWorker(); await closeDb(); process.exit(0); };
    process.on("SIGINT", () => void stop());
    process.on("SIGTERM", () => void stop());
    process.stdin.resume();
  } else {
    const owner = randomUUID();
    const message = "I have a senior backend engineering role in Seattle working on distributed payment systems. Please help me identify potential people from publicly available information who might be relevant. This is research only; do not save profiles or contact anyone.";
    const start = Date.now();
    const sent = await sendMessage(owner, { message, locale: "en", timezone: "America/Los_Angeles", request_key: randomUUID() });
    console.log(JSON.stringify({ phase: "started", job_id: sent.job.id, conversation_id: sent.conversation_id }));
    let job: Job | undefined;
    while (Date.now() - start < 360000) {
      [job] = await rows<Job>(sql`SELECT * FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND id=${sent.job.id}::uuid`);
      if (job && ["done", "error", "cancelled"].includes(job.status)) break;
      await delay(2000);
    }
    const detail = await conversationDetails(owner, sent.conversation_id);
    const reply = detail.messages.filter(item => item.role === "assistant").at(-1);
    const [counts] = await rows<{ people: number; roles: number; deliveries: number }>(sql`SELECT
      (SELECT count(*)::int FROM hirelix_agent_people WHERE user_id=${owner}::uuid) AS people,
      (SELECT count(*)::int FROM hirelix_private_roles WHERE user_id=${owner}::uuid) AS roles,
      (SELECT count(*)::int FROM hirelix_private_email_deliveries WHERE user_id=${owner}::uuid) AS deliveries`);
    const usage = await rows(sql`SELECT consumed_units,cost_nano_usd,pricing_snapshot FROM hirelix_agent_credit_usage WHERE job_id=${sent.job.id}::uuid`);
    const transports = await Promise.all((await readdir(`${directory}/transport`)).map(async file => JSON.parse(await readFile(`${directory}/transport/${file}`, "utf8")) as {job_id?: string; phase: string; path: string; status?: number; body?: unknown}));
    const observed = transports.filter(item => item.job_id === sent.job.id);
    const evidence = { message, job, reply, counts, usage, duration_ms: Date.now() - start, transport: observed };
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/public-sourcing.json`, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ phase: "finished", status: job?.status, duration_ms: evidence.duration_ms, counts, tools: ((job?.result?.agent_steps || []) as Array<{tools: string[]}>).flatMap(step => step.tools), public_responses: observed.filter(item => item.phase === "response").map(item => ({ path: item.path, status: item.status })), reply: reply?.content }));
    await closeDb();
    assert.equal(job?.status, "done", `Agent did not complete: ${job?.status}; ${job?.error}`);
    assert.ok(reply?.content.trim() || reply?.metadata.question, "Completed work must expose a response or a genuine question");
    assert.deepEqual(counts, { people: 0, roles: 0, deliveries: 0 }, "Research-only work must not save candidates, create roles or send mail");
  }
}
void main();
