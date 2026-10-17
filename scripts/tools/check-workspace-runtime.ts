/** Read-only, injected environment only. Never loads dotenv or prints values. */
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { missingAuthSettings } from "../../src/lib/auth-status";

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--database", "--worker"].includes(arg))) throw new Error("Use --database and/or --worker");
  const worker = args.includes("--worker");
  const missing: string[] = worker
    ? ["DATABASE_URL", "BETTER_AUTH_SECRET", "DEEPSEEK_API_KEY", "SILICONFLOW_API_KEY"].filter((name) => !process.env[name]?.trim())
    : [...missingAuthSettings(process.env)];
  const invalid: string[] = [];
  if (worker && process.env.PRIVATE_WORKSPACE_WORKER_ENABLED === "false") invalid.push("PRIVATE_WORKSPACE_WORKER_ENABLED");
  const origin = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!origin) missing.push("BETTER_AUTH_URL or NEXT_PUBLIC_APP_URL");
  else {
    try {
      const url = new URL(origin);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") invalid.push("application origin");
    } catch { invalid.push("application origin"); }
  }
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2) invalid.push("DATABASE_URL");
    } catch { invalid.push("DATABASE_URL"); }
  }
  if (process.env.SEARCH_EMBEDDING_DIMENSIONS && process.env.SEARCH_EMBEDDING_DIMENSIONS !== "1536") invalid.push("SEARCH_EMBEDDING_DIMENSIONS");

  const report: Record<string, unknown> = {
    component: worker ? "worker" : "web",
    scope: "Configuration presence and optional database metadata only; this does not verify provider credentials, worker liveness or an end-to-end trial.",
    configuration_ready: missing.length === 0 && invalid.length === 0,
    missing_settings: missing,
    invalid_settings: invalid,
    database: { checked: false },
    worker: {
      verified: false,
      action: "Run a dedicated same-version scheduler against this same isolated database; check its startup log. This command never starts a worker or enqueues work.",
    },
    optional_channels: {
      email_sign_in: Boolean(process.env.RESEND_API_KEY?.trim()),
      note: "Google sign-in does not prove email OTP, Gmail delivery or payment is configured. No external provider calls are made.",
    },
  };
  let databaseReady = true;
  if (args.includes("--database")) {
    databaseReady = false;
    if (process.env.DATABASE_URL && !invalid.includes("DATABASE_URL")) {
      process.env.DATABASE_CONNECT_TIMEOUT = "5";
      process.env.DATABASE_POOL_MAX = "1";
      try {
        // Auth, uploads/imports, conversation recovery, candidate/role evidence,
        // document versions/delivery, schedules and credit accounting.
        const tables = [
          "user", "session", "account", "verification",
          "hirelix_private_jobs", "hirelix_private_conversations", "hirelix_agent_messages",
          "hirelix_private_files", "hirelix_private_import_rows", "hirelix_agent_people",
          "hirelix_private_roles", "hirelix_private_records", "hirelix_private_role_candidates",
          "hirelix_private_deliverables", "hirelix_private_versions", "hirelix_private_embeddings",
          "hirelix_private_notifications", "hirelix_private_schedules",
          "hirelix_private_document_shares", "hirelix_private_email_deliveries",
          "hirelix_agent_credit_usage", "hirelix_user_settings", "hirelix_billing_events", "hirelix_llm_usage_events",
        ];
        const result = await db.transaction(async (tx) => {
          await tx.execute(sql`SET TRANSACTION READ ONLY`);
          await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
          const extensions = await tx.execute(sql`SELECT extname FROM pg_extension WHERE extname IN ('vector','pg_trgm')`);
          const absent: string[] = [];
          const denied: string[] = [];
          for (const name of tables) {
            const [row] = await tx.execute(sql`SELECT to_regclass(${"public." + name}) IS NOT NULL AS present`);
            if (!row.present) absent.push(name);
            else {
              const [access] = await tx.execute(sql`SELECT has_table_privilege(${"public." + name}, 'SELECT') AND has_table_privilege(${"public." + name}, 'INSERT') AND has_table_privilege(${"public." + name}, 'UPDATE') AND has_table_privilege(${"public." + name}, 'DELETE') AS allowed`);
              if (!access.allowed) denied.push(name);
            }
          }
          const [queue] = await tx.execute(sql`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hirelix_private_conversations' AND column_name='stopped') AS stopped_column`);
          const [transport] = await tx.execute(sql`SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()`);
          return { checked: true, connected: true, missing_tables: absent, insufficient_table_permissions: denied, extensions: extensions.map((row) => row.extname), queue_stopped_column: queue.stopped_column, postgres_connection_encrypted: transport?.ssl ?? null };
        });
        databaseReady = result.missing_tables.length === 0 && result.insufficient_table_permissions.length === 0 && result.extensions.length === 2 && result.queue_stopped_column === true;
        report.database = { ...result, ready: databaseReady };
      } catch (error) {
        report.database = { checked: true, ready: false, error_type: error instanceof Error ? error.name : "UnknownError", action: "Check the injected database connection, TLS, permissions and current schema. Connection strings and provider error details are intentionally omitted." };
      } finally { await closeDb(); }
    } else report.database = { checked: false, ready: false, action: "Supply a valid DATABASE_URL before testing connectivity." };
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.configuration_ready || !databaseReady) process.exitCode = 1;
}

main().catch(() => {
  console.error("Workspace diagnostic failed. Use only --database and/or --worker; no configuration values were printed.");
  process.exitCode = 1;
});
