import assert from "node:assert/strict";
import test from "node:test";
import {
  telemetryMetadata,
  telemetryRoute,
  telemetryReferrer,
  telemetryBot,
} from "../src/lib/telemetry";
import { parseAnalyticsFilters } from "../src/lib/product-analytics";

test("telemetry never keeps private query, shared token, account IDs or business content", () => {
  assert.equal(
    telemetryRoute(
      "https://hirelix.online/app/submissions/37e28e4a-8392-4ba0-889f-2b81c43d129d?email=private#secret",
    ),
    "/app/submissions/:id",
  );
  assert.equal(
    telemetryRoute("/recommendation/sensitive-share-token"),
    "/recommendation/:token",
  );
  assert.equal(telemetryRoute("/ops/secret"), "/ops");
  assert.equal(telemetryRoute("mailto:private@example.com"), "/external-action");
  assert.equal(
    telemetryReferrer("https://example.com/private?q=secret"),
    "https://example.com",
  );
  assert.deepEqual(
    telemetryMetadata({
      email: "private",
      content: "cv",
      user_id: "spoofed",
      internal: false,
      endpoint:
        "/api/workspace/files/37e28e4a-8392-4ba0-889f-2b81c43d129d?token=x",
      duration_ms: 100,
      status: NaN,
    }),
    { endpoint: "/api/workspace/files/:id", duration_ms: 100 },
  );
});
test("filter range and timezone reject bad and unbounded requests", () => {
  const now = new Date("2026-10-19T00:00:00Z");
  assert.equal(
    parseAnalyticsFilters(new URLSearchParams(), now).from,
    "2026-10-12T00:00:00.000Z",
  );
  const invalid: Record<string, string>[] = [
    { from: "bad" },
    { from: "2020-01-01" },
    { timezone: "invalid" },
    { from: now.toISOString(), to: now.toISOString() },
  ];
  for (const values of invalid)
    assert.throws(() =>
      parseAnalyticsFilters(new URLSearchParams(values), now),
    );
  assert.equal(
    parseAnalyticsFilters(new URLSearchParams({ internal: "1" }), now)
      .includeInternal,
    true,
  );
  assert.equal(telemetryBot("HeadlessChrome/1.0"), true);
  assert.equal(telemetryBot("Mozilla/5.0 Chrome/143.0 Safari/537.36"), false);
});
