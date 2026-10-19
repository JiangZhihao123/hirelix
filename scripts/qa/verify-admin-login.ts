/** Real PostgreSQL + HTTP security contract; isolated local QA only. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { digest } from "../../src/lib/admin-password";

async function main() {
  const database = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && /qa|test/.test(database.pathname));
  const base = process.env.ANALYTICS_TEST_URL || "http://localhost:3000";
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
  const username = process.env.ADMIN_USERNAME!, password = process.env.ADMIN_TEST_PASSWORD!;
  assert.ok(username && password);
  await db.execute(sql.raw(await readFile("supabase/migrations/20261019_admin_login.sql", "utf8")));
  const resetLimits = () => db.execute(sql`DELETE FROM hirelix_admin_login_limits`);
  const sessions: string[] = [];
  const login = (pw = password, origin = base) => fetch(base + "/api/admin/session", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ username, password: pw }),
  });
  const read = (path: string, cookie = "") => fetch(base + path, { headers: { Cookie: cookie } });
  const cookieOf = (r: Response) => {
    const cookie = r.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=strict/i);
    const part = cookie.split(";")[0]; sessions.push(part.split("=")[1]); return part;
  };
  await resetLimits();
  try {
    assert.equal((await read("/api/admin/session")).status, 401);
    for (const path of ["/api/ops/analytics", "/api/ops/conversion"])
      assert.equal((await read(path)).status, 404);
    assert.equal((await fetch(base+"/api/ops/analytics", { headers: { Authorization: `Bearer ${process.env.OPS_DASHBOARD_SECRET}` } })).status, 404);
    assert.equal((await login(password, "https://evil.invalid")).status, 403);
    assert.equal((await login("wrong-fixture-password")).status, 401);
    const success = await login(); assert.equal(success.status, 200);
    const cookie = cookieOf(success), token = cookie.split("=")[1];
    const stored = await db.execute(sql`SELECT token_hash FROM hirelix_admin_sessions WHERE token_hash=${digest(token)}`);
    assert.equal(stored.length, 1); assert.notEqual(stored[0].token_hash, token);
    assert.equal((await read("/api/ops/analytics", cookie)).status, 200);
    assert.equal((await read("/api/admin/session", cookie)).status, 200);
    const deniedLogout = await fetch(base+"/api/admin/session", { method: "DELETE", headers: { Origin: "https://evil.invalid", Cookie: cookie } });
    assert.equal(deniedLogout.status, 403);
    assert.equal((await read("/api/admin/session", cookie)).status, 200);
    const logout = await fetch(base+"/api/admin/session", { method: "DELETE", headers: { Origin: base, Cookie: cookie } });
    assert.equal(logout.status, 200);
    assert.equal((await read("/api/ops/analytics", cookie)).status, 404); // Captured cookie cannot be replayed.
    const second = cookieOf(await login()), secondToken = second.split("=")[1];
    await db.execute(sql`UPDATE hirelix_admin_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=${digest(secondToken)}`);
    assert.equal((await read("/api/admin/session", second)).status, 401);
    const third = cookieOf(await login()), thirdToken = third.split("=")[1];
    await db.execute(sql`UPDATE hirelix_admin_sessions SET credential_version='obsolete' WHERE token_hash=${digest(thirdToken)}`);
    assert.equal((await read("/api/admin/session", third)).status, 401);
    await resetLimits();
    const attempts = await Promise.all(Array.from({ length: 10 }, () => login("wrong-fixture-password")));
    assert.equal(attempts.filter(r => r.status === 401).length, 8);
    assert.equal(attempts.filter(r => r.status === 429).length, 2);
    assert.ok(Number(attempts.find(r => r.status === 429)!.headers.get("retry-after")) > 0);
    console.log("PASS: real admin login, origin checks, protected APIs, hashed session, logout replay, expiry, credential rotation and concurrent throttling");
  } finally {
    for (const token of sessions) await db.execute(sql`DELETE FROM hirelix_admin_sessions WHERE token_hash=${digest(token)}`);
    await resetLimits(); await closeDb();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
