import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithUserSession } from "../src/lib/client-auth";

test("API instrumentation preserves requests, excludes private payloads, and distinguishes failure from cancellation", async () => {
  const originalFetch = globalThis.fetch,
    windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const events: Array<{ type: string; metadata: Record<string, unknown> }> = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { origin: "http://localhost:3000", pathname: "/app" },
      __hirelixGrowthTrack: async (
        type: string,
        metadata: Record<string, unknown>,
      ) => {
        events.push({ type, metadata });
        return true;
      },
    },
  });
  try {
    let seen: RequestInit | undefined;
    globalThis.fetch = async (_input, init) => {
      seen = init;
      return new Response("{}", { status: 200 });
    };
    await fetchWithUserSession(
      "/api/workspace/people/37e28e4a-8392-4ba0-889f-2b81c43d129d?private=x",
      {
        method: "PATCH",
        body: "private candidate details",
        headers: { "X-Test": "preserve" },
      },
    );
    assert.equal(seen?.credentials, "include");
    assert.equal(seen?.body, "private candidate details");
    assert.equal(new Headers(seen?.headers).get("X-Test"), "preserve");
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "product_action_success");
    assert.equal(events[0].metadata.endpoint, "/api/workspace/people/:id");
    assert.ok(!JSON.stringify(events).includes("private"));
    await fetchWithUserSession("/api/workspace/people");
    await fetchWithUserSession("https://external.example/api/action", {
      method: "POST",
    });
    assert.equal(events.length, 1);
    globalThis.fetch = async () => new Response("{}", { status: 500 });
    await fetchWithUserSession("/api/workspace/roles");
    assert.equal(events.at(-1)?.metadata.status, 500);
    globalThis.fetch = async () => {
      throw new Error("private network diagnostics");
    };
    await assert.rejects(fetchWithUserSession("/api/workspace/roles"));
    assert.equal(events.at(-1)?.metadata.status, 0);
    const count = events.length,
      controller = new AbortController();
    controller.abort();
    await assert.rejects(
      fetchWithUserSession("/api/workspace/roles", {
        signal: controller.signal,
      }),
    );
    assert.equal(events.length, count);
    window.__hirelixGrowthTrack = () => {
      throw new Error("analytics unavailable");
    };
    globalThis.fetch = async () => new Response("{}", { status: 200 });
    assert.equal(
      (await fetchWithUserSession("/api/workspace/roles", { method: "POST" }))
        .status,
      200,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (windowDescriptor)
      Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
