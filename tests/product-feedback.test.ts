import test from "node:test";
import assert from "node:assert/strict";
import {
  feedbackInput,
  feedbackPagePath,
} from "../src/lib/product-feedback-contract";
test("feedback collects only a safe route, never query context or private record IDs", () => {
  assert.equal(
    feedbackPagePath(
      "/app/submissions/12345678-1234-1234-1234-123456789abc?token=secret#body",
    ),
    "/app/submissions/item",
  );
  const base = {
    request_key: "12345678-1234-4234-8234-123456789abc",
    message: " Useful suggestion ",
    page_path: "/app",
  };
  assert.equal(feedbackInput.parse(base).message, "Useful suggestion");
  for (const page_path of [
    "https://evil.test",
    "//evil.test",
    "/app?candidate=private",
    "/app#secret",
  ])
    assert.equal(
      feedbackInput.safeParse({ ...base, page_path }).success,
      false,
    );
  assert.equal(
    feedbackInput.safeParse({ ...base, message: " " }).success,
    false,
  );
  assert.equal(
    feedbackInput.safeParse({ ...base, message: "x".repeat(5001) }).success,
    false,
  );
});
