import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOfficialDeepSeekBody,
  getDefaultLlmModel,
  getLightweightLlmModel,
  normalizeLlmModelForCurrentProvider,
  assertLlmOutputComplete,
  LlmOutputTruncatedError,
} from "../src/lib/llm-client";

test("reasoning-only and partial JSON truncation retain usage instead of becoming empty-content retries", () => {
  for (const content of ["", '{"answer":"Saved']) {
    const response = { choices: [{ message: { content }, finish_reason: "length" }], usage: { prompt_tokens: 1200, completion_tokens: 7000 } };
    assert.throws(() => assertLlmOutputComplete(response, 7000), error => {
      assert(error instanceof LlmOutputTruncatedError);
      assert.equal(error.outputTokenLimit, 7000);
      assert.equal(error.usage?.outputTokens, 7000);
      assert.equal(error.rawResponse, response);
      return true;
    });
  }
  assert.doesNotThrow(() => assertLlmOutputComplete({choices: [{finish_reason: "stop"}]}, 7000));
});

const mutableEnv = process.env as Record<string, string | undefined>;

function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    original[key] = mutableEnv[key];
    const value = overrides[key];
    if (value === undefined) {
      delete mutableEnv[key];
    } else {
      mutableEnv[key] = value;
    }
  }

  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete mutableEnv[key];
      } else {
        mutableEnv[key] = value;
      }
    }
  }
}

test("official DeepSeek normalizes OpenRouter-style model names", () => {
  withEnv(
    {
      OPENROUTER_BASE_URL: undefined,
      DEEPSEEK_BASE_URL: "https://api.deepseek.com",
      AI_PROVIDER: "deepseek",
      AI_MODEL: "deepseek/deepseek-chat-v3.1",
      DEEPSEEK_MODEL: "deepseek/deepseek-chat-v3.1",
      SEARCH_JUDGE_MODEL: "deepseek-v4-flash",
      SEARCH_LIGHT_MODEL: "deepseek-v4-flash",
    },
    () => {
      assert.equal(getDefaultLlmModel(), "deepseek-flash");
      assert.equal(getLightweightLlmModel(), "deepseek-flash");
      assert.equal(normalizeLlmModelForCurrentProvider("deepseek-v4-flash"), "deepseek-flash");
      assert.equal(normalizeLlmModelForCurrentProvider("deepseek-flash"), "deepseek-flash");
      assert.equal(
        normalizeLlmModelForCurrentProvider("deepseek/deepseek-reasoner"),
        "deepseek-v4-pro",
      );
    },
  );
});

test("OpenRouter keeps provider-prefixed model names", () => {
  withEnv(
    {
      OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
      DEEPSEEK_BASE_URL: undefined,
      AI_PROVIDER: undefined,
      AI_MODEL: "deepseek/deepseek-chat-v3.1",
      SEARCH_JUDGE_MODEL: undefined,
      SEARCH_LIGHT_MODEL: undefined,
    },
    () => {
      assert.equal(getDefaultLlmModel(), "deepseek/deepseek-chat-v3.1");
      assert.equal(
        normalizeLlmModelForCurrentProvider("deepseek/deepseek-chat-v3.1"),
        "deepseek/deepseek-chat-v3.1",
      );
    },
  );
});

 test("official JSON mode transmits the schema even when caller does not embed it", () => {
  const schema = { type: "object", required: ["requirements"], properties: { requirements: { type: "array" } } };
  const body = buildOfficialDeepSeekBody({ model: "deepseek-flash", system: "Extract role facts", prompt: "Backend engineer", jsonSchema: { name: "role", strict: true, schema } }, "disabled", null);
  assert.ok(body.messages.some((message) => typeof message.content === "string" && message.content.includes(JSON.stringify(schema))));
  assert.deepEqual(body.response_format, { type: "json_object" });
});

test("official multimodal JSON keeps the schema and original image in their proper message roles", () => {
  const schema = {type: "object", properties: {name: {type: "string"}}};
  const url = "data:image/png;base64,ZmFrZQ==";
  const body = buildOfficialDeepSeekBody({model: "deepseek-flash", system: "Extract facts", prompt: "Read this CV", images: [{label: "CV page 1", url}], jsonSchema: {name: "cv", schema}}, "disabled", null);
  assert.equal(body.messages[0].role, "system");
  assert.equal(typeof body.messages[0].content, "string");
  assert.match(body.messages[0].content as string, /\"name\"/);
  assert.equal(body.messages[1].role, "user");
  assert.deepEqual(body.messages[1].content, [{type: "text", text: "Read this CV"}, {type: "text", text: "Original source image: CV page 1"}, {type: "image_url", image_url: {url}}]);
  assert.deepEqual(body.response_format, {type: "json_object"});
});
