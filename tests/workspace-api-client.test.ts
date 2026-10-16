import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { api, ApiError, ErrorNotice } from "../src/components/workspace/client";

Object.assign(globalThis, { React });

for (const [status, body, message] of [
  [503, "<html>Gateway timeout</html>", "Could not complete this request"],
  [401, "", "Sign in to continue"],
  [500, "null", "Could not complete this request"],
  [500, '{"error":""}', "Could not complete this request"],
  [500, '{"error":"   "}', "Could not complete this request"],
  [409, '{"error":"The document changed"}', "The document changed"],
] as const) {
  test(`API failure ${status} preserves status and a readable retry notice`, async () => {
    const original = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response(body, { status });
      await assert.rejects(api("/people"), (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, status);
        assert.equal(error.message, message);
        const html = renderToStaticMarkup(
          React.createElement(ErrorNotice, { error: error.message, retry: () => {} }),
        );
        assert.match(html, /role="alert"/);
        assert.ok(html.includes(message));
        assert.match(html, /Try again/);
        return true;
      });
    } finally {
      globalThis.fetch = original;
    }
  });
}

test("a disconnected write is attempted once; an explicit retry preserves its request key", async () => {
  const original = globalThis.fetch;
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const failure = new TypeError("Failed to fetch");
  const options = { method: "POST", body: JSON.stringify({ request_key: "same-user-action", message: "Fictional QA" }) };
  try {
    globalThis.fetch = async (input, init) => {
      requests.push({ input, init });
      if (requests.length === 1) throw failure;
      return Response.json({ saved: true });
    };
    await assert.rejects(api("/conversations", options), (error) => error === failure);
    assert.equal(requests.length, 1);
    assert.deepEqual(await api("/conversations", options), { saved: true });
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0], requests[1]);
    assert.equal(requests[0].init?.credentials, "include");
  } finally {
    globalThis.fetch = original;
  }
});
