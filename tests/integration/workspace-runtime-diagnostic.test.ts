import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db, closeDb } from "../../src/db/client";
import { auth } from "../../src/lib/auth";

// Opt-in only: the runner must create and bootstrap a NEW local fixture database.
// These tests rename fixture tables and use a temporary NOLOGIN permission role.
const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.equal(database.hostname, "127.0.0.1");
assert.match(database.pathname, /^\/hirelix_workspace_qa_isolated_[a-z0-9_]+$/);
assert.equal(process.env.WORKSPACE_DIAGNOSTIC_FIXTURE, database.pathname.slice(1));
after(closeDb);

function diagnose(connection = database) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/tools/check-workspace-runtime.ts", "--database"], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH, NODE_ENV: "test", NODE_OPTIONS: process.env.NODE_OPTIONS,
      DATABASE_URL: connection.toString(), BETTER_AUTH_SECRET: "isolated-diagnostic-fixture-only-secret",
      GOOGLE_CLIENT_ID: "nonfunctional-fixture", GOOGLE_CLIENT_SECRET: "nonfunctional-fixture",
      BETTER_AUTH_URL: "http://localhost:3000",
    },
    encoding: "utf8", timeout: 15000,
  });
  assert.equal(result.error, undefined);
  assert.ok(result.stdout.trim(), result.stderr);
  return { status: result.status, report: JSON.parse(result.stdout) };
}

test("real PostgreSQL diagnostic rejects partially missing evidence tables and denied core-table access", async () => {
  const complete = diagnose();
  assert.equal(complete.status, 0);
  assert.equal(complete.report.database.ready, true);
  const missing = ["hirelix_private_records", "hirelix_private_role_candidates", "hirelix_private_versions"];
  const hidden: string[] = [];
  try {
    for (const table of missing) {
      await db.execute(sql.raw(`ALTER TABLE public.${table} RENAME TO ${table}_diagnostic_hidden`));
      hidden.push(table);
    }
    const partial = diagnose();
    assert.equal(partial.status, 1);
    assert.equal(partial.report.database.ready, false);
    assert.deepEqual(partial.report.database.missing_tables.sort(), [...missing].sort());
  } finally {
    for (const table of hidden) await db.execute(sql.raw(`ALTER TABLE public.${table}_diagnostic_hidden RENAME TO ${table}`));
  }

  const role = "qa_diagnostic_" + randomUUID().replaceAll("-", "");
  await db.execute(sql.raw(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`));
  try {
    await db.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${role}`));
    await db.execute(sql.raw(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`));
    const restricted = new URL(database);
    restricted.searchParams.set("options", `-c role=${role}`);
    assert.equal(diagnose(restricted).status, 0, "Restricted role has the full fixture table grants");
    await db.execute(sql.raw(`REVOKE SELECT ON public.hirelix_private_records FROM ${role}`));
    const denied = diagnose(restricted);
    assert.equal(denied.status, 1);
    assert.equal(denied.report.database.ready, false);
    assert.deepEqual(denied.report.database.missing_tables, []);
    assert.deepEqual(denied.report.database.insufficient_table_permissions, ["hirelix_private_records"]);
  } finally {
    await db.execute(sql.raw(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${role}`));
    await db.execute(sql.raw(`REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${role}`));
    await db.execute(sql.raw(`DROP ROLE ${role}`));
  }
  assert.equal(diagnose().status, 0, "Fixture schema restored; no existing database was changed");
});

test("real local auth still accepts valid synthetic credentials and resolves its issued session", async () => {
  const id = randomUUID();
  const email = id + "@example.test";
  const password = randomUUID();
  const passwordHash = await hashPassword(password);
  await db.execute(sql`INSERT INTO "user"(id,email,"emailVerified",name) VALUES(${id},${email},true,'Fictional auth QA')`);
  try {
    await db.execute(sql`INSERT INTO account(id,"userId","accountId","providerId",password) VALUES(${randomUUID()},${id},${id},'credential',${passwordHash})`);
    const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({ email, password }),
    }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).user.id, id);
    const cookies = response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
    assert.ok(cookies);
    const session = await auth.handler(new Request("http://localhost:3000/api/auth/get-session", { headers: { cookie: cookies } }));
    assert.equal(session.status, 200);
    assert.equal((await session.json()).user.id, id);
  } finally {
    // Only this fresh fixture identity; cascade removes account and session.
    // No password, cookie or token is printed or retained in evidence.
    await db.execute(sql`DELETE FROM "user" WHERE id=${id}`);
  }
});
