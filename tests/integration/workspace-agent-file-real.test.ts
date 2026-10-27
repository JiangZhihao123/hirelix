// Real PostgreSQL and Docker sandbox; only the provider is a controlled stream.
// Run with node --experimental-test-module-mocks --import tsx --test.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, mock, test } from "node:test";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";

const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.port !== "15432" && database.pathname.startsWith("/hirelix_workspace_qa_coldstart_"));
const owners: string[] = [];
const usage = {inputTokens: {total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0}, outputTokens: {total: 10, text: 10, reasoning: 0}};
let scripts: LanguageModelV3StreamPart[][] = [];
const model = new MockLanguageModelV3({doStream: async () => {
  const parts = scripts.shift(); assert.ok(parts, "Unexpected provider call");
  return {stream: new ReadableStream({start(controller) {for (const part of parts) controller.enqueue(part); controller.close();}})};
}});
const ready = (async () => {
  mock.module("../../src/lib/workspace/agent-model.ts", {namedExports: {agentModel: () => model, agentProviderOptions: () => undefined}});
  const conversations = await import("../../src/lib/workspace/conversations");
  const jobs = await import("../../src/lib/workspace/jobs");
  const databaseModule = await import("../../src/lib/workspace/database");
  const connection = await import("../../src/db/client");
  const credits = await import("../../src/lib/agent-credit-context");
  const channel = await import("../../src/lib/workspace/turn-channel");
  const agentTools = await import("../../src/lib/workspace/agent-tools");
  const sandbox = await import("../../src/lib/workspace/file-execution");
  const drizzle = await import("drizzle-orm");
  return {...conversations, ...jobs, ...databaseModule, ...connection, ...credits, ...channel, ...agentTools, ...sandbox, sql: drizzle.sql};
})();
after(async () => {
  const s = await ready;
  for (const owner of owners) await s.db.execute(s.sql`UPDATE hirelix_private_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await s.closeTurnChannel(); await s.closeDb(); mock.restoreAll();
});

test("real Docker: command exit and output reach the model and UI with the correct status", {timeout: 120000}, async () => {
  const s = await ready, owner = randomUUID(); owners.push(owner);
  const sent = await s.sendMessage(owner, {message: "Inspect these files", request_key: randomUUID()});
  const job = await s.claimJob(["chat"], {id: sent.job.id, userId: owner}); assert.ok(job);
  const ids = [randomUUID(), randomUUID()];
  const commands = ["printf 'partial stdout\\n'; printf 'controlled failure\\n' >&2; exit 7", "printf 'completed\\n'"];
  scripts = [
    [...commands.map((command, i): LanguageModelV3StreamPart => ({type: "tool-call", toolCallId: ids[i], toolName: "bash", input: JSON.stringify({command, input_file_ids: [], output_paths: []})})), {type: "finish", finishReason: {unified: "tool-calls", raw: "tool-calls"}, usage}],
    [{type: "text-start", id: "response"}, {type: "text-delta", id: "response", delta: "The first command failed; the second completed."}, {type: "text-end", id: "response"}, {type: "finish", finishReason: {unified: "stop", raw: "stop"}, usage}],
  ];
  const runtimeJob = {...job, payload: {...job.payload, resuming: true}};
  const prepared = await s.agentCreditContext.run({...runtimeJob, signal: new AbortController().signal, trace: s.executionTrace(runtimeJob)}, () => s.assistantReply(runtimeJob, async () => {}));
  await s.finishJob(runtimeJob, prepared);
  const details = await s.conversationDetails(owner, sent.conversation_id);
  const message = details.messages.find(item => item.role === "assistant")!;
  const parts = message.metadata.parts as Array<{type: string; id?: string; status?: string}>;
  assert.deepEqual(ids.map(id => parts.find(part => part.id === id)?.status), ["error", "done"]);
  const toolResults = model.doStreamCalls.at(-1)!.prompt.flatMap(message => message.role === "tool" ? message.content : []).filter(part => part.type === "tool-result");
  const values = toolResults.map(part => part.type === "tool-result" && part.output.type === "json" ? part.output.value as {ok: boolean; result: {exit_code: number; stdout: string; stderr: string}} : null);
  assert.deepEqual(values.map(value => value?.ok), [false, true]);
  assert.equal(values[0]?.result.exit_code, 7);
  assert.match(values[0]!.result.stdout, /partial stdout/);
  assert.match(values[0]!.result.stderr, /controlled failure/);
  assert.match(values[1]!.result.stdout, /completed/);
});

test("real Docker: simultaneous working-file reads both finish without lock errors", {timeout: 120000}, async () => {
  const s = await ready, owner = randomUUID(); owners.push(owner);
  const sent = await s.sendMessage(owner, {message: "Read these files", request_key: randomUUID()});
  const job = await s.claimJob(["chat"], {id: sent.job.id, userId: owner}); assert.ok(job);
  const details = await s.conversationDetails(owner, sent.conversation_id);
  const question = details.messages.find(message => message.id === job.payload.message_id)!;
  const tools = s.createAgentTools({job, conversation: details.conversation, question, messages: [], document: null, attachments: [], locale: "en", timezone: "UTC", signal: new AbortController().signal, progress: async () => {}, sources: new Map(), clarification: null});
  const write = tools.write_file as unknown as {execute: (input: unknown, options: {toolCallId: string}) => Promise<{ok: boolean}>};
  const read = tools.read_file as unknown as {execute: (input: unknown, options: {toolCallId: string}) => Promise<{ok: boolean; result?: {text: string}}>};
  try {
    for (const name of ["one", "two"]) assert.equal((await write.execute({path: `/work/${name}.txt`, content: name, persist: false}, {toolCallId: randomUUID()})).ok, true);
    const results = await Promise.all(["one", "two"].map(name => read.execute({path: `/work/${name}.txt`, offset: 0}, {toolCallId: randomUUID()})));
    assert.ok(results.every(result => result.ok));
    assert.deepEqual(results.map(result => result.result?.text), ["one", "two"]);
    await s.finishJob(job, {result: {tested: true}});
  } finally {
    await s.cleanupFileWorkspace({userId: owner, conversationId: sent.conversation_id, jobId: job.id, leaseKey: job.lease_token!});
  }
});
