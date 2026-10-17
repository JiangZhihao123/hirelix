// Real local runtime + Postgres + DeepSeek. Baseline restores the old first-call
// provider options at the HTTP boundary; no model responses are substituted.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { sendMessage, assistantReply, conversationDetails } from '../../src/lib/workspace/conversations';
import { claimJob, finishJob, heartbeat } from '../../src/lib/workspace/jobs';
import { closeDb } from '../../src/db/client';
import { closeTurnChannel } from '../../src/lib/workspace/turn-channel';
import { initializeGlobalOutboundProxy } from '../../src/lib/server-outbound-proxy';
import { agentProviderOptions } from '../../src/lib/workspace/agent-model';
import { isUsingOfficialDeepSeek, getLlmBaseUrl } from '../../src/lib/llm-client';

async function main() {
  const database = new URL(process.env.DATABASE_URL!);
  assert.ok(['localhost', '127.0.0.1'].includes(database.hostname) && database.pathname.startsWith('/hirelix_workspace_qa_'));
  assert.ok(isUsingOfficialDeepSeek(), 'Benchmark requires official DeepSeek');
  initializeGlobalOutboundProxy();
  const originalFetch = globalThis.fetch;
  let baseline = false;
  type Call = { thinking: string; firstTextMs?: number; totalMs?: number; model: string };
  let calls: Call[] = [];
  globalThis.fetch = async (input, init) => {
    if (!String(input).startsWith(getLlmBaseUrl()) || typeof init?.body !== 'string') return originalFetch(input, init);
    const body = JSON.parse(init.body);
    if (!body.stream) return originalFetch(input, init); // title runs unchanged
    if (baseline && calls.length === 0) {
      const old = agentProviderOptions()!.deepseek;
      body.thinking = old.thinking;
      body.reasoning_effort = old.reasoningEffort;
    }
    const call: Call = { thinking: body.thinking.type, model: body.model };
    calls.push(call);
    const start = performance.now();
    const response = await originalFetch(input, {...init, body: JSON.stringify(body)});
    if (!response.ok || !response.body) throw new Error(`Provider HTTP ${response.status}`);
    const decoder = new TextDecoder();
    let pending = '';
    const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        pending += decoder.decode(chunk, {stream: true});
        const lines = pending.split('\n'); pending = lines.pop()!;
        for (const line of lines) {
          if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
          const value = JSON.parse(line.slice(6));
          if (value.choices?.[0]?.delta?.content && call.firstTextMs === undefined) call.firstTextMs = Math.round(performance.now() - start);
        }
        controller.enqueue(chunk);
      },
      flush() { call.totalMs = Math.round(performance.now() - start); },
    }));
    return new Response(stream, {status: response.status, headers: response.headers});
  };
  const owner = randomUUID();
  const results: unknown[] = [];
  async function run(label: string, message: string, conversationId?: string) {
    calls = [];
    const start = performance.now();
    const sent = await sendMessage(owner, {message, conversation_id: conversationId, request_key: randomUUID(), locale: 'zh'});
    const job = await claimJob(['chat'], {id: sent.job.id, userId: owner}); assert.ok(job);
    const timer = setInterval(() => void heartbeat(job), 20000);
    try {
      await finishJob(job, await assistantReply(job, value => heartbeat(job, value)));
      const details = await conversationDetails(owner, sent.conversation_id);
      const answer = details.messages.filter(m => m.role === 'assistant').at(-1)!;
      assert.ok(answer.content.trim());
      const result = {label, conversation: sent.conversation_id, elapsedMs: Math.round(performance.now()-start), calls: [...calls], answer: answer.content};
      results.push(result); console.log(JSON.stringify(result));
      return sent.conversation_id;
    } finally { clearInterval(timer); }
  }
  try {
    for (let i=0; i<3; i++) {
      for (const old of i % 2 ? [false, true] : [true, false]) {
        baseline = old;
        await run(`${old ? 'baseline' : 'changed'}-${i+1}`, '你好');
        assert.equal(calls[0].thinking, old ? agentProviderOptions()!.deepseek.thinking.type : 'disabled');
      }
    }
    baseline = false;
    const conversation = await run('tool-first-turn', '读取我保存的个人偏好，并简要告诉我有哪些。');
    assert.ok(calls.length >= 2, 'Must actually exercise a tool round trip');
    assert.equal(calls[0].thinking, 'disabled');
    for (const call of calls.slice(1)) assert.equal(call.thinking, agentProviderOptions()!.deepseek.thinking.type);
    await run('follow-up', '谢谢', conversation);
    assert.equal(calls[0].thinking, agentProviderOptions()!.deepseek.thinking.type);
  } finally {
    globalThis.fetch = originalFetch;
    await writeFile('tmp/first-message-benchmark.json', JSON.stringify(results, null, 2));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await closeTurnChannel(); await closeDb(); });
