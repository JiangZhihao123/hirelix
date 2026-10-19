import { randomBytes, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { digest, validAdminHash, verifyAdminPassword } from "./admin-password";

export const ADMIN_SESSION_SECONDS = 8 * 60 * 60;
export function adminCookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-hirelix-admin" : "hirelix-admin";
}
export function adminCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: ADMIN_SESSION_SECONDS };
}
function credentials() {
  const username = process.env.ADMIN_USERNAME || "";
  const hash = process.env.ADMIN_PASSWORD_HASH || "";
  return username && validAdminHash(hash) ? { username, hash, version: digest(`${username}:${hash}`) } : null;
}
export function adminConfigured() { return credentials() !== null; }

export async function checkAdminCredentials(username: string, password: string) {
  const config = credentials();
  if (!config) return false;
  // Always derive the password, including for an unknown username.
  const passwordValid = await verifyAdminPassword(password, config.hash);
  return timingSafeEqual(Buffer.from(digest(username)), Buffer.from(digest(config.username))) && passwordValid;
}

export async function createAdminSession() {
  const config = credentials();
  if (!config) throw Error("Admin authentication unavailable");
  const token = randomBytes(32).toString("hex");
  await db.execute(sql`DELETE FROM hirelix_admin_sessions WHERE expires_at <= now()`);
  await db.execute(sql`INSERT INTO hirelix_admin_sessions(token_hash,credential_version,expires_at)
    VALUES (${digest(token)},${config.version},now()+interval '8 hours')`);
  return token;
}
export async function readAdminSession(token?: string) {
  const config = credentials();
  if (!config || !token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const rows = await db.execute(sql`SELECT token_hash FROM hirelix_admin_sessions
    WHERE token_hash=${digest(token)} AND credential_version=${config.version} AND expires_at>now()`);
  return rows.length ? { username: config.username } : null;
}
export async function revokeAdminSession(token?: string) {
  if (token && /^[a-f0-9]{64}$/.test(token))
    await db.execute(sql`DELETE FROM hirelix_admin_sessions WHERE token_hash=${digest(token)}`);
}
export async function adminRequestAuthorized(req: { cookies: { get(name: string): { value: string } | undefined } }) {
  return !!(await readAdminSession(req.cookies.get(adminCookieName())?.value));
}
export function adminSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return origin === new URL(req.url).origin && req.headers.get("sec-fetch-site") !== "cross-site";
}
export function adminClientKey(req: Request) {
  // Vercel overwrites x-vercel-forwarded-for; never trust client x-forwarded-for there.
  const ip = process.env.VERCEL === "1"
    ? req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    : "local";
  return `ip:${digest(ip)}`;
}
export async function consumeAdminLoginAttempt(clientKey: string) {
  // Atomic fixed windows survive serverless restarts. A global cap bounds distributed attempts.
  await db.execute(sql`DELETE FROM hirelix_admin_login_limits WHERE expires_at < now()-interval '1 day'`);
  const result = await db.execute(sql`INSERT INTO hirelix_admin_login_limits(key,attempts,expires_at)
    VALUES (${clientKey},1,now()+interval '15 minutes'),('global',1,now()+interval '15 minutes')
    ON CONFLICT(key) DO UPDATE SET
      attempts=CASE WHEN hirelix_admin_login_limits.expires_at<=now() THEN 1 ELSE hirelix_admin_login_limits.attempts+1 END,
      expires_at=CASE WHEN hirelix_admin_login_limits.expires_at<=now() THEN now()+interval '15 minutes' ELSE hirelix_admin_login_limits.expires_at END
    RETURNING key,attempts,extract(epoch FROM (expires_at-now()))::int AS retry_after`);
  const blocked = result.filter(r => Number(r.attempts) > (r.key === "global" ? 60 : 8));
  return blocked.length ? Math.max(...blocked.map(r => Number(r.retry_after)), 1) : 0;
}
