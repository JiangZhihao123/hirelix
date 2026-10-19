import { db } from "@/db/client";
import { sql } from "drizzle-orm";
export function internalAnalyticsUsers() {
  return {
    ids: (process.env.ANALYTICS_INTERNAL_USER_IDS || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    emails: (process.env.ANALYTICS_INTERNAL_EMAILS || "")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  };
}
export async function analyticsUserIsInternal(id: string, email?: string) {
  const config = internalAnalyticsUsers();
  return (
    config.ids.includes(id) ||
    (!!email && config.emails.includes(email.toLowerCase()))
  );
}
export async function analyticsDatabaseIsLocal() {
  if (process.env.NODE_ENV === "production") return false;
  const url = new URL(
    process.env.DATABASE_URL || "postgres://localhost/unknown",
  );
  return ["localhost", "127.0.0.1"].includes(url.hostname) && /qa|test/.test(url.pathname);
}
export async function analyticsCoverage() {
  const result = await db.execute(
    sql`SELECT min(created_at) AS since FROM hirelix_growth_landing_events WHERE metadata->>'telemetry_version'='2'`,
  );
  return result[0]?.since || null;
}
