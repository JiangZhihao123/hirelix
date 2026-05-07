/**
 * Drizzle ORM client for Hirelix self-hosted Postgres.
 *
 * Uses postgres.js driver with the following defaults:
 *   - prepare: false  (required for transaction-mode poolers like PgBouncer)
 *   - ssl: 'require'  (VPS Postgres exposed over public internet)
 *   - idle_timeout / max: tuned for both Vercel serverless and the long-running
 *     scheduler process.
 *
 * The DB pool is created lazily so that builds / scripts that don't need DB
 * access (e.g. type-checking) won't fail just because DATABASE_URL is missing.
 */

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

type DbClient = PostgresJsDatabase<typeof schema>;

let cachedDb: DbClient | null = null;
let cachedSql: ReturnType<typeof postgres> | null = null;

function readDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required. Set it to your VPS Postgres connection string, e.g. " +
        "postgresql://hirelix_app:PASSWORD@vps-host:5432/hirelix?sslmode=require",
    );
  }
  return url;
}

function shouldRequireSsl(connectionString: string): boolean {
  // Allow disabling SSL for local development via `?sslmode=disable`.
  if (/[?&]sslmode=disable\b/i.test(connectionString)) return false;
  if (process.env.DATABASE_SSL === "false") return false;
  // Loopback connections don't need SSL either.
  if (/@(localhost|127\.0\.0\.1)[:/]/i.test(connectionString)) {
    return process.env.DATABASE_SSL === "true";
  }
  return true;
}

function createClient(): DbClient {
  const connectionString = readDatabaseUrl();

  const sql = postgres(connectionString, {
    prepare: false,
    ssl: shouldRequireSsl(connectionString) ? "require" : false,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: Number(process.env.DATABASE_IDLE_TIMEOUT ?? 30),
    connect_timeout: Number(process.env.DATABASE_CONNECT_TIMEOUT ?? 10),
  });

  cachedSql = sql;
  return drizzle(sql, { schema });
}

/**
 * Lazy singleton. Re-uses one pool across requests within the same Node
 * process (Vercel Functions reuse warm instances, scheduler runs continuously).
 */
export function getDb(): DbClient {
  if (!cachedDb) {
    cachedDb = createClient();
  }
  return cachedDb;
}

/**
 * Proxy that defers initialization until first property access. This lets
 * modules `import { db } from '@/db/client'` at the top level without forcing
 * DATABASE_URL to be set during module load (e.g. for type-only imports).
 */
export const db = new Proxy({} as DbClient, {
  get(_target, prop, receiver) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(real)
      : value;
  },
});

/**
 * Close the pool. Mainly used by tests and graceful shutdown handlers.
 */
export async function closeDb(): Promise<void> {
  if (cachedSql) {
    await cachedSql.end({ timeout: 5 });
    cachedSql = null;
    cachedDb = null;
  }
}
