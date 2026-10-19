/** Explicit local PostgreSQL contract test; fixture rows are always removed. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import {
  getProductAnalytics,
  parseAnalyticsFilters,
} from "../../src/lib/product-analytics";

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
      /qa|test/.test(url.pathname),
    "Requires an isolated local QA database",
  );
  const base = process.env.ANALYTICS_TEST_URL || "http://localhost:3000";
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
  await db.execute(
    sql.raw(
      await readFile(
        "supabase/migrations/20261019_product_analytics_indexes.sql",
        "utf8",
      ),
    ),
  );
  const visitor = randomUUID(),
    session = randomUUID(),
    page = randomUUID(),
    id = randomUUID(),
    source = `contract_${randomUUID()}`;
  const payload = {
    event_type: "page_view",
    event_id: id,
    visitor_id: visitor,
    session_id: session,
    page_url: base + "/app?conversation=private",
    metadata: {
      telemetry_version: 2,
      page_id: page,
      traffic_source: source,
      device_type: "desktop",
      user_id: randomUUID(),
      internal: false,
      content: "must not persist",
    },
  };
  const send = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + "/api/growth/landing-event", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  const fixtureUsers = [randomUUID(), randomUUID()];
  try {
    assert.equal((await fetch(base + "/api/ops/analytics")).status, 404);
    assert.equal(
      (await send(payload, { Origin: "https://foreign.example" })).status,
      403,
    );
    assert.equal(
      (await send({ ...payload, event_id: "not-a-uuid" })).status,
      400,
    );
    assert.equal((await send(payload)).status, 200);
    assert.equal((await send(payload)).status, 200);
    const recorded = await db.execute(
      sql`SELECT page_url,metadata FROM hirelix_growth_landing_events WHERE id=${id}::uuid`,
    );
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].page_url, base + "/app");
    const metadata = recorded[0].metadata as Record<string, unknown>;
    assert.equal(metadata.user_id, null);
    assert.equal(metadata.content, undefined);
    assert.equal(metadata.internal, true);
    for (const active of [5, 20, 12])
      assert.equal(
        (
          await send({
            ...payload,
            event_id: randomUUID(),
            event_type: "session_summary",
            metadata: {
              ...payload.metadata,
              active_read_seconds: active,
              page_stay_seconds: active + 3,
            },
          })
        ).status,
        200,
      );
    const filters = parseAnalyticsFilters(
      new URLSearchParams({ internal: "1", source }),
    );
    const data = await getProductAnalytics(filters);
    assert.equal(data.traffic.page_views, 1);
    assert.equal(data.traffic.visitors, 1);
    assert.equal(data.traffic.sessions, 1);
    assert.equal(Number(data.engagement.active_seconds), 20);
    assert.equal(Number(data.engagement.measured_pages), 1);
    assert.equal(data.product.new_accounts, 0); // Anonymous events never impersonate a supplied account ID.
    const excluded = await getProductAnalytics({
      ...filters,
      includeInternal: false,
    });
    assert.equal(excluded.traffic.page_views, 0);
    const unrelated = await getProductAnalytics({
      ...filters,
      page: "/not-visited",
    });
    assert.equal(unrelated.traffic.page_views, 0);
    const login = await fetch(base + "/api/admin/session", {
      method: "POST", headers: { Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify({ username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_TEST_PASSWORD }),
    });
    assert.equal(login.status, 200);
    const auth = login.headers.get("set-cookie")!.split(";")[0];
    const response = await fetch(
      base + "/api/ops/analytics?internal=1&source=" + source,
      { headers: { Cookie: auth } },
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).traffic.page_views, 1);
    const now = Date.now();
    for (const [index, uid] of fixtureUsers.entries()) {
      const created = new Date(
        now - (index === 0 ? 9 : 1) * 86400000,
      ).toISOString();
      const cid = randomUUID();
      await db.execute(
        sql`INSERT INTO "user" (id,email,name,"createdAt") VALUES (${uid},${uid + "@analytics-test.invalid"},'Analytics contract fixture',${created}::timestamptz)`,
      );
      await db.execute(
        sql`INSERT INTO hirelix_private_conversations(id,user_id,created_at) VALUES(${cid}::uuid,${uid}::uuid,${created}::timestamptz)`,
      );
      for (const days of index === 0 ? [1.5, 7.5] : [0.5])
        await db.execute(
          sql`INSERT INTO hirelix_agent_messages(user_id,conversation_id,role,content,created_at) VALUES(${uid}::uuid,${cid}::uuid,'user','Analytics fixture',${new Date(+new Date(created) + days * 86400000).toISOString()}::timestamptz)`,
        );
      await db.execute(
        sql`INSERT INTO hirelix_growth_landing_events(visitor_id,session_id,event_type,page_url,metadata) VALUES(${visitor},${randomUUID()},'ui_action',${base + "/app"},${JSON.stringify({ telemetry_version: 2, user_id: uid, traffic_source: source, internal: true })}::jsonb)`,
      );
    }
    const cohort = await getProductAnalytics({
      ...filters,
      from: new Date(now - 30 * 86400000).toISOString(),
      to: new Date(Date.now() + 60000).toISOString(),
    });
    const sum = (field: string) =>
      cohort.retention.reduce((value, row) => value + Number(row[field]), 0);
    assert.equal(cohort.product.new_accounts, 2);
    assert.equal(cohort.product.conversation_accounts, 2);
    assert.equal(sum("d1_eligible"), 1);
    assert.equal(sum("d1_returned"), 1);
    assert.equal(sum("d7_eligible"), 1);
    assert.equal(sum("d7_returned"), 1);
    console.log(
      "PASS cohort fixtures on real PostgreSQL: registration dedup, incomplete windows excluded, D1/D7 return counts",
    );
    console.log(
      "PASS real local PostgreSQL + HTTP: migration, auth, origin, identity, privacy, event dedup, heartbeat max, internal/source/page filters and dashboard readback",
    );
  } finally {
    for (const uid of fixtureUsers) {
      await db.execute(
        sql`DELETE FROM hirelix_agent_messages WHERE user_id=${uid}::uuid`,
      );
      await db.execute(
        sql`DELETE FROM hirelix_private_conversations WHERE user_id=${uid}::uuid`,
      );
      await db.execute(sql`DELETE FROM "user" WHERE id=${uid}`);
    }
    await db.execute(
      sql`DELETE FROM hirelix_growth_landing_events WHERE visitor_id=${visitor}`,
    );
  }
}
main()
  .finally(closeDb)
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Verification failed",
    );
    process.exitCode = 1;
  });
