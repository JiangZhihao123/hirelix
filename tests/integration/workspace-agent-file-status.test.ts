// Real agent runtime and PostgreSQL; sandbox and model are controlled doubles.
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
let workspaceActive = 0, workspacePeak = 0, originalActive = 0, originalPeak = 0;
const model = new MockLanguageModelV3({
  doStream: async () => {
    const parts = scripts.shift();
    assert.ok(parts, "Unexpected provider call");
    return {stream: new ReadableStream({start(controller) { for (const part of parts) controller.enqueue(part); controller.close(); }})};
  },
});
const ready = (async () => {
  const sandbox = await import("../../src/lib/workspace/file-execution");
  const reader = await import("../../src/lib/workspace/document-reader");
  mock.module("../../src/lib/workspace/file-execution.ts", {namedExports: {
    ...sandbox,
    executeBash: async (_ctx: unknown, input: {command: string}) => ({
      exit_code: input.command === "exit 7" ? 7 : input.command === "too much output" ? null : 0,
      timed_out: input.command === "timeout", output_limit_reached: input.command === "too much output",
      oom_killed: false, stdout: "partial stdout", stderr: "controlled diagnostic", stdout_truncated: false, stderr_truncated: false,
      outputs: [], inputs: [], workspace: {files: [], truncated: false}, stdout_file: null, stderr_file: null,
    }),
    readWorkspaceFile: async (_ctx: unknown, input: {path: string}) => {
      workspaceActive++; workspacePeak = Math.max(workspacePeak, workspaceActive);
      try {
        if (workspaceActive > 1) throw new Error("Workspace lock was already held");
        await new Promise(resolve => setTimeout(resolve, 40));
        return {name: input.path.split("/").at(-1)!, media_type: "text/plain", bytes: Buffer.from(input.path)};
      } finally { workspaceActive--; }
    },
    cleanupFileWorkspace: async () => {},
  }});
  mock.module("../../src/lib/workspace/document-reader.ts", {namedExports: {
    ...reader,
    readDocument: async (file: {name: string; bytes: Uint8Array; media_type?: string}, ...rest: [number?, boolean?]) => {
      if (!file.name.startsWith("original-")) return reader.readDocument(file, ...rest);
      originalActive++; originalPeak = Math.max(originalPeak, originalActive);
      try { await new Promise(resolve => setTimeout(resolve, 40)); return await reader.readDocument(file, ...rest); }
      finally { originalActive--; }
    },
  }});
  mock.module("../../src/lib/workspace/agent-model.ts", {namedExports: {agentModel: () => model, agentProviderOptions: () => undefined}});
  const conversations = await import("../../src/lib/workspace/conversations");
  const jobs = await import("../../src/lib/workspace/jobs");
  const databaseModule = await import("../../src/lib/workspace/database");
  const connection = await import("../../src/db/client");
  const credits = await import("../../src/lib/agent-credit-context");
  const channel = await import("../../src/lib/workspace/turn-channel");
  const files = await import("../../src/lib/workspace/files");
  const agentTools = await import("../../src/lib/workspace/agent-tools");
  const drizzle = await import("drizzle-orm");
  return {...conversations, ...jobs, ...databaseModule, ...connection, ...credits, ...channel, ...files, ...agentTools, sql: drizzle.sql};
})();
after(async () => {
  const s = await ready;
  for (const owner of owners) await s.db.execute(s.sql`UPDATE hirelix_private_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await s.closeTurnChannel(); await s.closeDb(); mock.restoreAll();
});

test("runtime exposes command failure diagnostics and displays failure, while a successful command stays done", async () => {
  const s = await ready, owner = randomUUID(); owners.push(owner);
  const sent = await s.sendMessage(owner, {message: "Inspect these files", request_key: randomUUID()});
  const job = await s.claimJob(["chat"], {id: sent.job.id, userId: owner}); assert.ok(job);
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const commands = ["exit 7", "timeout", "too much output", "success"];
  scripts = [
    [...commands.map((command, i): LanguageModelV3StreamPart => ({type: "tool-call", toolCallId: ids[i], toolName: "bash", input: JSON.stringify({command, input_file_ids: [], output_paths: []})})), {type: "finish", finishReason: {unified: "tool-calls", raw: "tool-calls"}, usage}],
    [{type: "text-start", id: "response"}, {type: "text-delta", id: "response", delta: "The first three commands did not complete successfully."}, {type: "text-end", id: "response"}, {type: "finish", finishReason: {unified: "stop", raw: "stop"}, usage}],
  ];
  const runtimeJob = {...job, payload: {...job.payload, resuming: true}};
  const prepared = await s.agentCreditContext.run({...runtimeJob, signal: new AbortController().signal, trace: s.executionTrace(runtimeJob)}, () => s.assistantReply(runtimeJob, async () => {}));
  await s.finishJob(runtimeJob, prepared);
  const details = await s.conversationDetails(owner, sent.conversation_id);
  const message = details.messages.find(item => item.role === "assistant")!;
  const parts = message.metadata.parts as Array<{type: string; id?: string; status?: string}>;
  assert.deepEqual(ids.map(id => parts.find(part => part.id === id)?.status), ["error", "error", "error", "done"]);
  const prompt = model.doStreamCalls.at(-1)!.prompt;
  const toolResults = prompt.flatMap(message => message.role === "tool" ? message.content : []).filter(part => part.type === "tool-result");
  const parsed = toolResults.map(part => part.type === "tool-result" && part.output.type === "json" ? part.output.value as {ok: boolean; result: {stdout: string; stderr: string}} : null);
  assert.deepEqual(parsed.map(result => result?.ok), [false, false, false, true]);
  assert.ok(parsed.every(result => result?.result.stdout === "partial stdout" && result.result.stderr === "controlled diagnostic"));
});

test("agent queues concurrent workspace reads while original file reads may overlap", async () => {
  const s = await ready, owner = randomUUID(); owners.push(owner);
  const sent = await s.sendMessage(owner, {message: "Read these files", request_key: randomUUID()});
  const job = await s.claimJob(["chat"], {id: sent.job.id, userId: owner}); assert.ok(job);
  const details = await s.conversationDetails(owner, sent.conversation_id);
  const question = details.messages.find(message => message.id === job.payload.message_id)!;
  const tools = s.createAgentTools({job, conversation: details.conversation, question, messages: [], document: null, attachments: [], locale: "en", timezone: "UTC", signal: new AbortController().signal, progress: async () => {}, sources: new Map(), clarification: null});
  const read = tools.read_file as unknown as {execute: (input: unknown, options: {toolCallId: string}) => Promise<{ok: boolean; result?: {text: string}}>};
  const workspace = await Promise.all(["one.txt", "two.txt"].map(path => read.execute({path: `/work/${path}`, offset: 0}, {toolCallId: randomUUID()})));
  assert.ok(workspace.every(result => result.ok));
  assert.equal(workspacePeak, 1);
  const files = await Promise.all(["one", "two"].map(name => s.saveFile(owner, {name: `original-${name}.txt`, type: "text/plain", bytes: Buffer.from(name)})));
  const originals = await Promise.all(files.map(file => read.execute({file_id: file.id, offset: 0}, {toolCallId: randomUUID()})));
  assert.ok(originals.every(result => result.ok));
  assert.equal(originalPeak, 2);
  await s.finishJob(job, {result: {tested: true}});
});
