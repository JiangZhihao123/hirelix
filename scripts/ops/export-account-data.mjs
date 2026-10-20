import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";

// Operator-only, read-only export. Never expose auth credentials or lease tokens.
const omit = ["password", "token", "token_hash", "accessToken", "refreshToken",
  "idToken", "pdl_api_key", "lease_token"];
const quote = (value) => `"${value.replaceAll('"', '""')}"`;

export function accountSelection(table, names, userId, email) {
      let predicate;
      let params = [userId];
      if (names.includes("user_id")) predicate = "t.user_id::text=$1";
      else if (["account", "session"].includes(table)) predicate = 't."userId"=$1';
      else if (names.includes("search_id")) {
        predicate = "t.search_id IN (SELECT id FROM public.hirelix_searches WHERE user_id::text=$1)";
      } else if (table === "hirelix_growth_landing_events") {
        predicate = "t.metadata->>'user_id'=$1 OR lower(t.recipient)=lower($2)";
        params = [userId, email];
      } else if (table === "hirelix_growth_outreach_clicks") {
        predicate = "lower(t.recipient)=lower($2)";
        params = [userId, email];
        // Keep both placeholders typed; the account ID is already verified.
        predicate = `$1::text IS NOT NULL AND (${predicate})`;
      } else if (table === "hirelix_beta_invites") {
        predicate = "t.activated_user_id::text=$1 OR lower(t.recipient_email)=lower($2)";
        params = [userId, email];
      } else if (table === "hirelix_beta_invite_events") {
        predicate = `t.invite_code IN (SELECT invite_code FROM public.hirelix_beta_invites
          WHERE activated_user_id::text=$1 OR lower(recipient_email)=lower($2))`;
        params = [userId, email];
      }
  return { predicate, params };
}

export async function exportAccountData(client, userId, email) {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const identity = await client.query(
      'SELECT * FROM public."user" WHERE id=$1 AND lower(email)=lower($2)', [userId, email],
    );
    if (identity.rowCount !== 1) throw new Error("Account ID and email do not match");
    const columns = (await client.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' ORDER BY table_name, ordinal_position
    `)).rows;
    const tables = new Map();
    for (const row of columns) {
      if (!tables.has(row.table_name)) tables.set(row.table_name, []);
      tables.get(row.table_name).push(row.column_name);
    }
    const data = { user: identity.rows };
    for (const [table, names] of tables) {
      // Known ownership paths, including retired search records. Shared public
      // talent caches are not owned by an individual account and are excluded.
      const { predicate, params } = accountSelection(table, names, userId, email);
      if (!predicate) continue;
      const projection = names.filter((name) => !omit.includes(name))
        .map((name) => `t.${quote(name)}`).join(", ");
      data[table] = (await client.query(
        `SELECT ${projection} FROM public.${quote(table)} t WHERE ${predicate}`, params,
      )).rows;
    }
    await client.query("COMMIT");
    return {
      format: "hirelix-account-export-v1",
      exported_at: new Date().toISOString(),
      account_id: userId,
      notes: [
        "Binary files and screenshots are encoded as Buffer data arrays in JSON.",
        "Authentication secrets, API keys, share-token hashes and worker lease tokens are excluded.",
        "Only attributable account records are included; anonymous visits are not guessed from shared browser identifiers.",
        "Provider mailboxes, payment-provider records and restricted backups are outside this database export.",
      ],
      data,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const [userId, email, destination] = process.argv.slice(2);
  if (!userId || !email || !destination || !process.env.DATABASE_URL) {
    throw new Error("Usage: DATABASE_URL=... node scripts/ops/export-account-data.mjs USER_ID ACCOUNT_EMAIL NEW_OUTPUT_FILE");
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await exportAccountData(client, userId, email);
    // Exclusive creation prevents overwriting an existing export or following a symlink.
    await writeFile(destination, JSON.stringify(result, null, 2), { flag: "wx", mode: 0o600 });
    process.stdout.write(`Exported ${Object.keys(result.data).length} record groups. Output permissions: 0600.\n`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write("Account export failed. Check account identity, database access and a new output path; no database changes were made.\n");
    process.exitCode = 1;
  });
}
