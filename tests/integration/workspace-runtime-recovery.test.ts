// Run with --experimental-test-module-mocks --import tsx against a fresh QA DB.
// Real runtime/tools/Postgres; only the provider model is controlled. No network AI.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, mock, test } from "node:test";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { AGENT_EXECUTION_TIMEOUT_MS } from "../../src/lib/workspace/agent-stop";
import { AgentCreditError } from "../../src/lib/agent-access";
import { sql } from "drizzle-orm";

const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.equal(database.hostname, "127.0.0.1");
assert.ok(database.pathname.startsWith("/hirelix_workspace_qa_isolated_"));
const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } };
let scripts: Array<LanguageModelV3StreamPart[] | Error> = [];
let blockStream: (() => void) | undefined;
let inspectInput: ((prompt: unknown) => void) | undefined;
const model = new MockLanguageModelV3({
  doGenerate: { content: [{ type: "text", text: '{"title":"Runtime QA"}' }], finishReason: { unified: "stop", raw: "stop" }, usage, warnings: [] },
  doStream: async options => {
    inspectInput?.(options.prompt);
    if (blockStream) {
      blockStream();
      return {stream: new ReadableStream({start(controller) {
        const abort = () => controller.error(options.abortSignal!.reason);
        if (options.abortSignal?.aborted) abort();
        else options.abortSignal!.addEventListener("abort", abort, {once: true});
      }})};
    }
    const parts = scripts.shift();
    assert.ok(parts, "Unexpected model call; no fallback provider allowed");
    if (parts instanceof Error) throw parts;
    return { stream: new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close(); } }) };
  },
});
const ready = (async () => {
  mock.module("../../src/lib/workspace/agent-model.ts", { namedExports: { agentModel: () => model, agentProviderOptions: () => undefined } });
  const conversations = await import("../../src/lib/workspace/conversations");
  const control = await import("../../src/lib/workspace/conversation-control");
  const jobs = await import("../../src/lib/workspace/jobs");
  const store = await import("../../src/lib/workspace/database");
  const connection = await import("../../src/db/client");
  const memories = await import("../../src/lib/workspace/memories");
  const channel = await import("../../src/lib/workspace/turn-channel");
  const files = await import("../../src/lib/workspace/files");
  const web = await import("../../src/lib/workspace/web-observations");
  const tools = await import("../../src/lib/workspace/agent-tools");
  return { ...conversations, ...control, ...jobs, ...store, ...connection, ...memories, ...channel, ...files, ...web, ...tools };
})();
after(async () => {
  const s = await ready;
  await s.closeTurnChannel();
  await s.closeDb();
  mock.restoreAll();
});
const finish = (reason: "stop" | "tool-calls" | "length"): LanguageModelV3StreamPart => ({ type: "finish", finishReason: { unified: reason, raw: reason }, usage });
const text = (value: string): LanguageModelV3StreamPart[] => [{ type: "text-start", id: "text" }, { type: "text-delta", id: "text", delta: value }, { type: "text-end", id: "text" }];
const call = (name: string, input: unknown): LanguageModelV3StreamPart[] => [{ type: "tool-call", toolCallId: randomUUID(), toolName: name, input: JSON.stringify(input) }, finish("tool-calls")];

test("runtime contract: a tool loop can exceed twenty rounds and finish without a manual continuation", async () => {
  const s = await ready, owner = randomUUID();
  scripts = [...Array.from({length: 22}, () => call("read_skill", {name: "recruiting-records", resource: null})), [...text("Completed after reading the requested guidance."), finish("stop")]];
  const sent = await s.sendMessage(owner, {message: "Read the recruiting guidance and report completion.", request_key: randomUUID()});
  await s.processJob({chat: s.assistantReply});
  const job = await s.owned<{status: string; result: {agent_steps: unknown[]}}>(owner, "job", sent.job.id);
  assert.equal(job.status, "done");
  assert.equal(job.result.agent_steps.length, 23);
  assert.equal(scripts.length, 0);
});

test("runtime contract: output limit pauses committed work and Continue preserves its receipt", async () => {
  const s = await ready, owner = randomUUID();
  const input = {operation: "remember", ref: null, title: "Report style", content: "Keep updates concise", source_quote: "Remember to keep updates concise"};
  scripts = [call("remember_preference", input), [...text("Your preference is saved; the remaining explanation"), finish("length")]];
  const sent = await s.sendMessage(owner, {message: "Remember to keep updates concise, then explain what you saved.", request_key: randomUUID()});
  await s.processJob({chat: s.assistantReply});
  const paused = await s.owned<{status: string; error: string | null; result: Record<string, unknown>}>(owner, "job", sent.job.id);
  assert.equal(paused.status, "cancelled");
  assert.equal(paused.error, null);
  assert.equal(paused.result.pause_reason, "output_limit");
  assert.equal(paused.result.paused, true);
  assert.ok(paused.result.tool_receipts);
  const before = await s.conversationDetails(owner, sent.conversation_id);
  assert.equal(before.conversation.stopped, true);
  assert.equal(before.messages.at(-1)!.metadata.pause_reason, "output_limit");
  assert.ok(before.messages.at(-1)!.content.includes("remaining explanation"));
  scripts = [call("remember_preference", input), [...text(" is now complete."), finish("stop")]];
  await s.controlConversation(owner, sent.conversation_id, {action: "resume"});
  await s.processJob({chat: s.assistantReply});
  const completed = await s.owned<{status: string; result: Record<string, unknown>}>(owner, "job", sent.job.id);
  assert.equal(completed.status, "done");
  assert.equal(completed.result.pause_reason, undefined);
  assert.equal((await s.listPersonalMemories(owner)).length, 1);
  assert.equal((await s.listPersonalMemories(owner))[0].version, 1);
  const details = await s.conversationDetails(owner, sent.conversation_id);
  assert.equal(details.messages.filter(m => m.role === "assistant").length, 1);
  assert.equal(details.messages.at(-1)!.metadata.pause_reason, null);
  const events = completed.result.agent_events as Array<{event: string; status?: string; pause_reason?: string}>;
  assert.ok(events.some(e => e.event === "execution_finished" && e.status === "paused" && e.pause_reason === "output_limit"));
});

test("runtime contract: exhausted credits pause rather than fail or keep sampling", async () => {
  const s = await ready, owner = randomUUID();
  scripts = [new AgentCreditError()];
  const sent = await s.sendMessage(owner, {message: "Explain this request.", request_key: randomUUID()});
  await s.processJob({chat: s.assistantReply});
  const job = await s.owned<{status: string; error: string | null; result: Record<string, unknown>}>(owner, "job", sent.job.id);
  assert.equal(job.status, "cancelled");
  assert.equal(job.error, null);
  assert.equal(job.result.pause_reason, "credit_limit");
  assert.equal(scripts.length, 0);
});

test("runtime contract: web originals are readable, and Continue restores actual observations without repeating the search", async () => {
  const s = await ready, owner = randomUUID(), originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "controlled-contract-key";
  const body = "Original professional evidence. ".repeat(1000) + "Tail fact: authored the demonstrated extension.";
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({results: [{title: "Public original", url: "https://example.test/professional", snippet: "UI-only snippet", summary: "Verified public work evidence", content: body, rerank_score: 2.4, authority: 3, date: null, site_name: "QA"}]}));
    };
    scripts = [call("web_search", {query: "public professional work", count: 1, need_content: true}), new AgentCreditError()];
    const sent = await s.sendMessage(owner, {message: "Research public professional work. Do not save candidates or contact anyone.", request_key: randomUUID()});
    await s.processJob({chat: s.assistantReply});
    const paused = await s.owned<import("../../src/lib/workspace/types").Job>(owner, "job", sent.job.id);
    assert.equal(paused.result!.pause_reason, "credit_limit");
    const observations = s.webObservations(paused.result);
    assert.equal(observations.length, 1);
    const view = observations[0].output.result as {sources: Array<{summary: string; content: string; truncated: boolean; content_reference: {file_id: string; read_with: {file_id: string; offset: number; limit: number}}}>; original_response: {file_id: string}};
    assert.equal(view.sources[0].summary, "Verified public work evidence");
    assert.equal(view.sources[0].content.length, s.WEB_PAGE_CHARACTERS);
    assert.equal(view.sources[0].truncated, true);
    assert.ok(!JSON.stringify(view).includes("UI-only snippet"));
    const file = await s.readFile(owner, view.sources[0].content_reference.file_id);
    assert.equal(file.bytes.toString(), body);
    await assert.rejects(s.readFile(randomUUID(), file.id), /not found/);
    const raw = JSON.parse((await s.readFile(owner, view.original_response.file_id)).bytes.toString());
    assert.equal(raw.output.result.sources[0].snippet, "UI-only snippet");
    assert.equal(raw.output.result.sources[0].content, body);

    let resumedEvidence = false, tailEvidence = false;
    inspectInput = prompt => {
      const serialized = JSON.stringify(prompt);
      resumedEvidence ||= serialized.includes("completed_web_observations") && serialized.includes("Verified public work evidence") && serialized.includes("Original professional evidence.");
      tailEvidence ||= serialized.includes("Tail fact: authored the demonstrated extension.");
    };
    scripts = [call("read_file", view.sources[0].content_reference.read_with), [...text("Research completed using the preserved original evidence."), finish("stop")]];
    // The next page ends before the tail; explicitly request that original tail.
    scripts.splice(1, 0, call("read_file", {file_id: file.id, offset: body.length - 100, limit: 100}));
    await s.controlConversation(owner, sent.conversation_id, {action: "resume"});
    await s.processJob({chat: s.assistantReply});
    assert.equal((await s.owned<{status: string}>(owner, "job", sent.job.id)).status, "done");
    assert.ok(resumedEvidence, "The resumed model receives earlier evidence, not only UI URLs");
    assert.ok(tailEvidence, "Omitted original text reaches the model through the existing file tool");
    assert.equal(calls, 1, "Local original reads and Continue do not refetch or bill for the public URL");
  } finally {
    inspectInput = undefined;
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = originalKey;
  }
});

test("runtime contract: a web tool's own credit reservation error pauses the Agent instead of becoming a retryable 502", async () => {
  const s = await ready, owner = randomUUID();
  const sent = await s.sendMessage(owner, {message: "Research public professional work.", request_key: randomUUID()});
  // Keep just 0.1 credit: enough to queue, less than a Search request. The mock
  // model itself has no reservation; the real tool/PG reservation must refuse.
  await s.rows(sql`INSERT INTO hirelix_private_jobs(id,user_id,kind,status,request_key,payload) VALUES(${randomUUID()}::uuid,${owner}::uuid,'chat','done',${randomUUID()},'{"qa_allowance_fixture":true}'::jsonb) RETURNING id`).then(async ([fixture]) => {
    await s.rows(sql`INSERT INTO hirelix_agent_credit_usage(job_id,user_id,reserved_units,consumed_units) VALUES(${String((fixture as {id: string}).id)}::uuid,${owner}::uuid,1999000,1999000) RETURNING job_id`);
  });
  await s.rows(sql`UPDATE hirelix_agent_credit_usage SET reserved_units=1000 WHERE job_id=${sent.job.id}::uuid RETURNING job_id`);
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "controlled-contract-key";
  try {
    scripts = [call("web_search", {query: "public work", count: 1, need_content: false})];
    await s.processJob({chat: s.assistantReply});
    const paused = await s.owned<import("../../src/lib/workspace/types").Job>(owner, "job", sent.job.id);
    assert.equal(paused.status, "cancelled");
    assert.equal(paused.result!.pause_reason, "credit_limit");
    assert.equal(scripts.length, 0);
  } finally {
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = originalKey;
  }
});

test("runtime contract: one fifteen-minute deadline aborts the active model and preserves a resumable pause", {timeout: 15000}, async t => {
  const s = await ready, owner = randomUUID();
  const sent = await s.sendMessage(owner, {message: "Explain this request.", request_key: randomUUID()});
  let started!: () => void;
  const startedPromise = new Promise<void>(resolve => {started = resolve;});
  blockStream = started;
  let expire!: () => void;
  const actualTimeout = setTimeout;
  // Advance only the runtime deadline. Faking every timer would also freeze
  // postgres.js network scheduling and prevent the real LISTEN handshake.
  t.mock.method(globalThis, "setTimeout", ((callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
    if (delay === AGENT_EXECUTION_TIMEOUT_MS) expire = () => callback(...args);
    return actualTimeout(callback, delay, ...args);
  }) as typeof setTimeout);
  try {
    const running = s.processJob({chat: s.assistantReply});
    await startedPromise;
    expire();
    await running;
    const job = await s.owned<{status: string; error: string | null; result: Record<string, unknown>}>(owner, "job", sent.job.id);
    assert.equal(job.status, "cancelled");
    assert.equal(job.error, null);
    assert.equal(job.result.pause_reason, "time_limit");
    assert.ok((job.result.agent_events as Array<{status?: string}>).some(e => e.status === "paused"));
  } finally {blockStream = undefined; t.mock.restoreAll();}
});

test("runtime contract: a stale resource pause cannot overwrite user stop or a resumed execution", async () => {
  const s = await ready, owner = randomUUID();
  const sent = await s.sendMessage(owner, {message: "Stop and resume QA", request_key: randomUUID()});
  const first = (await s.claimJob(["chat"], {id: sent.job.id, userId: owner}))!;
  await s.controlConversation(owner, sent.conversation_id, {action: "stop"});
  await assert.rejects(s.pauseJob(first, "time_limit"), s.LostLease);
  const stopped = await s.conversationDetails(owner, sent.conversation_id);
  assert.equal(stopped.messages.at(-1)!.metadata.pause_reason, null);
  await s.controlConversation(owner, sent.conversation_id, {action: "resume"});
  const resumed = (await s.claimJob(["chat"], {id: first.id, userId: owner}))!;
  assert.notEqual(resumed.lease_token, first.lease_token);
  await assert.rejects(s.pauseJob(first, "credit_limit"), s.LostLease);
  const current = await s.owned<{status: string; result: Record<string, unknown>}>(owner, "job", first.id);
  assert.equal(current.status, "running");
  assert.equal(current.result.pause_reason, undefined);
  await s.cancelJob(owner, resumed.id);
});

test("runtime: a real ask_user receipt waits, then the answer resumes original context exactly once", async () => {
  const s = await ready, owner = randomUUID();
  scripts = [call("ask_user", { question: "Which scope should I use?", options: ["Internal briefing", "Source comparison"] })];
  const initial = await s.sendMessage(owner, { message: "Prepare either an internal briefing or a source comparison; ask me to choose before proceeding.", request_key: randomUUID() });
  await s.processJob({ chat: s.assistantReply });
  let details = await s.conversationDetails(owner, initial.conversation_id);
  const question = details.messages.find(m => m.metadata.question)!;
  assert.ok(question);
  assert.equal((question.metadata.question as { status: string }).status, "waiting");
  assert.equal(scripts.length, 0);
  assert.equal(await s.processJob({ chat: s.assistantReply }), false, "Waiting must not spin or make another model call");
  const answer = await s.sendMessage(owner, { conversation_id: initial.conversation_id, question_message_id: question.id, message: "Source comparison", request_key: randomUUID() });
  details = await s.conversationDetails(owner, initial.conversation_id);
  assert.equal((details.messages.find(m => m.id === question.id)!.metadata.question as { status: string }).status, "waiting");
  scripts = [[...text("Proceeding with the selected source comparison."), finish("stop")]];
  await s.processJob({ chat: s.assistantReply });
  const prompt = JSON.stringify(model.doStreamCalls.at(-1)!.prompt);
  assert.ok(prompt.includes("ask me to choose before proceeding"));
  assert.ok(prompt.includes("User clarification: Source comparison"));
  details = await s.conversationDetails(owner, initial.conversation_id);
  assert.equal((await s.owned<{ status: string }>(owner, "job", answer.job.id)).status, "done");
  assert.equal(details.messages.at(-1)!.role, "assistant");
  assert.equal(details.messages.at(-1)!.content, "Proceeding with the selected source comparison.");
  const resolved = details.messages.find(m => m.id === question.id)!.metadata.question as { status: string; answer_message_id: string };
  assert.equal(resolved.status, "answered");
  assert.equal(resolved.answer_message_id, answer.job.payload.message_id);
  await assert.rejects(() => s.sendMessage(owner, { conversation_id: initial.conversation_id, question_message_id: question.id, message: "Internal briefing", request_key: randomUUID() }), /already been answered/);
});

test("runtime: provider stream failure preserves committed tool work; retry finishes without duplicating it", async () => {
  const s = await ready, owner = randomUUID();
  const message = "Remember that I prefer concise updates, then explain what you saved.";
  const input = { operation: "remember", ref: null, title: "Update style", content: "Prefers concise updates", source_quote: "Remember that I prefer concise updates" };
  scripts = [call("remember_preference", input), [...text("Your preference is saved."), { type: "error", error: new Error("Injected provider stream failure") }]];
  const sent = await s.sendMessage(owner, { message, request_key: randomUUID() });
  await s.processJob({ chat: s.assistantReply });
  const failed = await s.owned<{ status: string; error: string; result: Record<string, unknown> }>(owner, "job", sent.job.id);
  assert.equal(failed.status, "error");
  assert.match(failed.error, /source material is saved/);
  assert.ok(failed.result.tool_receipts);
  const originalPreferences = await s.listPersonalMemories(owner);
  assert.equal(originalPreferences.length, 1);
  const before = await s.conversationDetails(owner, sent.conversation_id);
  assert.equal(before.messages.filter(m => m.role === "assistant").length, 1);
  scripts = [call("remember_preference", input), [...text("Saved your preference for concise updates."), finish("stop")]];
  await s.retryJob(owner, sent.job.id);
  await s.processJob({ chat: s.assistantReply });
  const toolResults = model.doStreamCalls.at(-1)!.prompt.flatMap(message =>
    message.role === "tool" ? message.content : [],
  ).filter(part => part.type === "tool-result" && part.toolName === "remember_preference");
  assert.equal(toolResults.length, 1, "Retry must expose the real preference tool result");
  assert.equal(toolResults[0].type, "tool-result");
  assert.ok("output" in toolResults[0]);
  const output = toolResults[0].output;
  assert.equal(output.type, "json", "Tool errors must not be accepted as successful recovery");
  assert.ok("value" in output);
  const result = output.value as { ok: boolean; result: Array<{ id: string }>; error?: unknown };
  assert.equal(result.ok, true);
  assert.equal(result.error, undefined);
  assert.equal(result.result.length, 1);
  assert.equal(result.result[0].id, originalPreferences[0].id);
  assert.equal((await s.owned<{ status: string }>(owner, "job", sent.job.id)).status, "done");
  const preferences = await s.listPersonalMemories(owner);
  assert.equal(preferences.length, 1);
  assert.equal(preferences[0].version, 1);
  const after = await s.conversationDetails(owner, sent.conversation_id);
  assert.equal(after.messages.filter(m => m.role === "assistant").length, 1);
  assert.equal(after.messages.at(-1)!.content, "Saved your preference for concise updates.");
  assert.equal(scripts.length, 0);
});
