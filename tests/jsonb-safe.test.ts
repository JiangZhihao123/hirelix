import test from "node:test";
import assert from "node:assert/strict";

import { toJsonbSafeRecord } from "../src/lib/jsonb-safe";

test("toJsonbSafeRecord removes null-character escapes that Postgres jsonb rejects", () => {
  const value = toJsonbSafeRecord({
    "\u0000bad": "hello\\u0000world",
    nested: {
      text: "a\u0000b",
      missing: undefined,
      notFinite: Number.NaN,
    },
  });

  assert.deepEqual(value, {
    bad: "helloworld",
    nested: {
      text: "ab",
      missing: null,
      notFinite: null,
    },
  });
  assert.doesNotMatch(JSON.stringify(value), /\\u0000|\u0000/i);
});
