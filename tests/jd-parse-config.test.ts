import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_JD_PARSE_MAX_OUTPUT_TOKENS,
  getJobDescriptionParseMaxOutputTokens,
} from "@/lib/jd-parse";

test("JD parse token budget is large enough for headhunter workflow output", () => {
  const previous = process.env.SEARCH_PARSE_MAX_OUTPUT_TOKENS;
  try {
    delete process.env.SEARCH_PARSE_MAX_OUTPUT_TOKENS;
    assert.equal(DEFAULT_JD_PARSE_MAX_OUTPUT_TOKENS, 6400);
    assert.equal(getJobDescriptionParseMaxOutputTokens(), 6400);

    process.env.SEARCH_PARSE_MAX_OUTPUT_TOKENS = "3200";
    assert.equal(getJobDescriptionParseMaxOutputTokens(), 4000);

    process.env.SEARCH_PARSE_MAX_OUTPUT_TOKENS = "12000";
    assert.equal(getJobDescriptionParseMaxOutputTokens(), 10000);
  } finally {
    if (previous == null) {
      delete process.env.SEARCH_PARSE_MAX_OUTPUT_TOKENS;
    } else {
      process.env.SEARCH_PARSE_MAX_OUTPUT_TOKENS = previous;
    }
  }
});
