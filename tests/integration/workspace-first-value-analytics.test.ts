// Deterministic cohort contract on an isolated real PostgreSQL database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../../src/db/client";
import { getProductAnalytics, parseAnalyticsFilters } from "../../src/lib/product-analytics";

const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.port !== "15432" && /^\/hirelix_workspace_qa_coldstart_/.test(database.pathname));
const owners = [randomUUID(), randomUUID()];
const source = `first_value_${randomUUID()}`;
after(async () => {
  for (const owner of owners) {
    await db.execute(sql`DELETE FROM hirelix_private_deliverables WHERE user_id=${owner}::uuid`);
    await db.execute(sql`DELETE FROM hirelix_private_roles WHERE user_id=${owner}::uuid`);
    await db.execute(sql`DELETE FROM hirelix_agent_people WHERE user_id=${owner}::uuid`);
    await db.execute(sql`DELETE FROM hirelix_private_jobs WHERE user_id=${owner}::uuid`);
    await db.execute(sql`DELETE FROM hirelix_growth_landing_events WHERE metadata->>'user_id'=${owner}`);
    await db.execute(sql`DELETE FROM "user" WHERE id=${owner}`);
  }
  await closeDb();
});

test("cohort distinguishes saved candidates, searches, multi-person documents and views without treating them as value", async () => {
  const now = new Date(), created = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const role = randomUUID(), people = [randomUUID(), randomUUID()];
  for (const [index, owner] of owners.entries()) {
    await db.execute(sql`INSERT INTO "user" (id,email,name,"createdAt") VALUES(${owner},${owner + "@first-value.invalid"},'fixture',${created}::timestamptz)`);
    await db.execute(sql`INSERT INTO hirelix_growth_landing_events(visitor_id,session_id,event_type,page_url,metadata)
      VALUES(${randomUUID()},${randomUUID()},${index === 0 ? "document_view" : "page_view"},'/app',${JSON.stringify({telemetry_version:2,traffic_source:source,user_id:owner,internal:true})}::jsonb)`);
    const event = {tool:"search_candidates", event:"tool_finished", status:index === 0 ? "success" : "error", started_at:now.toISOString()};
    await db.execute(sql`INSERT INTO hirelix_private_jobs(user_id,kind,request_key,status,result)
      VALUES(${owner}::uuid,'chat',${randomUUID()},'done',${JSON.stringify({agent_events:[event]})}::jsonb)`);
  }
  for (const id of people) await db.execute(sql`INSERT INTO hirelix_agent_people(id,user_id,name) VALUES(${id}::uuid,${owners[0]}::uuid,'fictional')`);
  await db.execute(sql`INSERT INTO hirelix_private_roles(id,user_id,title,client_name,jd_text) VALUES(${role}::uuid,${owners[0]}::uuid,'fixture','fixture','fixture')`);
  await db.execute(sql`INSERT INTO hirelix_private_deliverables(user_id,role_id,kind,title,content,person_ids)
    VALUES(${owners[0]}::uuid,${role}::uuid,'brief','fixture','fixture',ARRAY[${people[0]}::uuid,${people[1]}::uuid])`);
  const filters = parseAnalyticsFilters(new URLSearchParams({internal:"1",source,
    from:new Date(now.getTime()-86400000).toISOString(),to:new Date(now.getTime()+60000).toISOString()}));
  const result = await getProductAnalytics(filters);
  assert.equal(result.product.new_accounts, 2);
  assert.equal(result.product.new_accounts_with_candidates, 1);
  assert.equal(result.product.new_accounts_with_candidate_search, 1);
  assert.equal(result.product.new_accounts_with_multi_candidate_document, 1);
  assert.equal(result.product.new_accounts_with_document_view, 1);
  assert.equal(result.product.new_accounts_with_outcome, 1, "a saved brief with selected people is included");
  assert.equal(result.retention.reduce((n, row) => n + Number(row.activated), 0), 1);
});
