import test from "node:test";
import assert from "node:assert/strict";
import {
  getDefaultLlmModel,
  getLightweightLlmModel,
  normalizeLlmModelForCurrentProvider,
} from "../src/lib/llm-client";

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
      assert.equal(getDefaultLlmModel(), "deepseek-v4-flash");
      assert.equal(getLightweightLlmModel(), "deepseek-v4-flash");
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
