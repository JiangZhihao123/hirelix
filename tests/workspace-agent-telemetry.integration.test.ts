import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../src/db/client";
import { agentCreditContext } from "../src/lib/agent-credit-context";
import { appendAgentEvidence, executionTrace, observeAgentTool } from "../src/lib/workspace/agent-telemetry";
import { claimJob, failJob, retryJob, cancelJob, LostLease } from "../src/lib/workspace/jobs";
import { sendMessage } from "../src/lib/workspace/conversations";
import { owned } from "../src/lib/workspace/database";
import type { Job } from "../src/lib/workspace/types";

test("PG execution evidence survives retries, correlates tools and rejects stale leases without private payloads", {skip: process.env.AGENT_TELEMETRY_INTEGRATION !== "true"}, async () => {
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost","127.0.0.1"].includes(url.hostname) && url.port !== "15432" && url.pathname.startsWith("/hirelix_workspace_qa_"));
  const owner = randomUUID();
  try {
    const sent = await sendMessage(owner, {message: "QA telemetry", request_key: randomUUID()});
    const first = (await claimJob(["chat"],{id: sent.job.id, userId: owner}))!;
    const trace = executionTrace(first);
    await agentCreditContext.run({...first, trace}, async () => {
      await appendAgentEvidence(first,"agent_steps",{...trace, step: 1, finish: "tool-calls"});
      await observeAgentTool(first,"read_candidate","tool-1",2,async () => ({ok: false, error: {code: 404, message: "PRIVATE_CONTENT"}}));
    });
    await failJob(first,"QA intentional failure");
    await retryJob(owner, first.id);
    const second = (await claimJob(["chat"],{id: first.id, userId: owner}))!;
    const next = executionTrace(second);
    assert.notEqual(next.execution_id,trace.execution_id);
    assert.equal(next.job_attempt,trace.job_attempt,"Manual retry resets the numeric counter; execution ID remains unique");
    await appendAgentEvidence(second,"agent_steps",{...next, step: 1, finish: "stop"});
    await assert.rejects(appendAgentEvidence(first,"agent_steps",{step:999}),LostLease);
    const saved = await owned<Job>(owner,"job",first.id);
    assert.equal((saved.result!.agent_steps as unknown[]).length,2);
    const events = saved.result!.agent_events as Array<Record<string, unknown>>;
    assert.equal(events.length,2);
    assert.equal(events[0].tool_call_id,events[1].tool_call_id);
    assert.equal(events[1].status,"error");
    assert.equal(events[1].error_code,404);
    assert.equal(typeof events[1].duration_ms,"number");
    assert.ok(!JSON.stringify(saved.result).includes("PRIVATE_CONTENT"));
    await cancelJob(owner,second.id);
    await assert.rejects(appendAgentEvidence(second,"agent_steps",{step:999}),LostLease);
  } finally {await closeDb();}
});
