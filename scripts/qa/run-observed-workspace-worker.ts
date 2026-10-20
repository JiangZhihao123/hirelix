// QA-only transparent observation: every request still goes to its real provider.
// Never use with production data. Only JSON bodies from the named QA database are retained;
// request headers, API keys and authorization values are deliberately excluded.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { agentCreditContext } from "../../src/lib/agent-credit-context";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import { startWorkspaceWorker } from "../../src/lib/workspace/worker";

async function main() {
  const url = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.port !== "15432" && url.pathname === "/hirelix_workspace_qa_engineering_20261020");
  assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
  const directory = process.env.WORKSPACE_QA_EVIDENCE_DIR;
  assert.ok(directory?.startsWith("/Users/noah/projects/hirelix-local-archive/2026-10-20/engineering-"));
  await mkdir(`${directory}/transport`, {recursive: true});
  const record = async (event: object) => {
    await writeFile(`${directory}/transport/${Date.now()}-${randomUUID()}.json`, JSON.stringify(event));
  };
  const actualFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const observe = url.hostname === "api.deepseek.com" && typeof init?.body === "string";
    if (!observe) return actualFetch(input, init);
    const body = JSON.parse(init!.body as string) as Record<string, unknown>;
    const id = randomUUID(), jobId = agentCreditContext.getStore()?.id;
    await record({id, job_id: jobId, phase: "request", path: url.pathname, at: new Date().toISOString(), body});
    try {
      const response = await actualFetch(input, init);
      await record({id, job_id: jobId, phase: "connected", path: url.pathname, at: new Date().toISOString(), status: response.status});
      if (url.pathname.startsWith("/v1/tools/")) {
        const raw = await response.clone().json().catch(() => null);
        await record({id, job_id: jobId, phase: "response", path: url.pathname, at: new Date().toISOString(), status: response.status, body: raw});
      }
      return response;
    } catch (error) {
      await record({id, job_id: jobId, phase: "error", path: url.pathname, at: new Date().toISOString(), error_type: error instanceof Error ? error.name : "Unknown"});
      throw error;
    }
  };
  initializeGlobalOutboundProxy();
  startWorkspaceWorker();
  process.stdin.resume();
}
void main();
