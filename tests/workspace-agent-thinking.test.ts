import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { agentProviderOptions } from '../src/lib/workspace/agent-model';

test('Agent replies consistently use configured DeepSeek thinking and effort', async () => {
  const saved = {...process.env};
  try {
    process.env.OPENROUTER_BASE_URL = 'https://api.deepseek.com';
    process.env.DEEPSEEK_THINKING = 'enabled';
    process.env.DEEPSEEK_REASONING_EFFORT = 'high';
    const bodies: Array<{thinking: {type: string}; reasoning_effort: string}> = [];
    const model = createDeepSeek({apiKey: 'test-only', fetch: async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({id: 'test', created: 1, model: 'deepseek-v4-flash', choices: [{index: 0, message: {role: 'assistant', content: 'ok'}, finish_reason: 'stop'}], usage: {prompt_tokens: 1, completion_tokens: 1}}), {headers: {'content-type': 'application/json'}});
    }})('deepseek-v4-flash');
    for (let call = 0; call < 2; call++) {
      await model.doGenerate({prompt: [{role: 'user', content: [{type: 'text', text: 'hello'}]}], providerOptions: agentProviderOptions()});
    }
    assert.deepEqual(bodies.map(body => body.thinking.type), ['enabled', 'enabled']);
    assert.deepEqual(bodies.map(body => body.reasoning_effort), ['high', 'high']);
    process.env.DEEPSEEK_THINKING = 'disabled';
    assert.equal(agentProviderOptions()?.deepseek.thinking.type, 'disabled');
    process.env.OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
    assert.equal(agentProviderOptions(), undefined);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
