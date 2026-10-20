import { pathToFileURL } from "node:url";
import pg from "pg";
import { accountSelection } from "./export-account-data.mjs";

const quote = (name) => `"${name.replaceAll('"', '""')}"`;

// Run only after support verifies ownership, handles billing retention/cancellation,
// and puts web/worker/webhook writers into a maintenance window.
// Default is a full deletion rehearsal followed by ROLLBACK.
export async function deleteAccountData(client, userId, email, options = {}) {
  if (options.apply && (!options.maintenanceConfirmed || !options.billingReviewed)) {
    throw new Error("Apply requires confirmed maintenance and billing review");
  }
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout='5s'");
    const columns = (await client.query(`
      SELECT table_name,column_name FROM information_schema.columns
      WHERE table_schema='public' ORDER BY table_name,ordinal_position
    `)).rows;
    const tables = new Map();
    for (const { table_name, column_name } of columns) {
      if (!tables.has(table_name)) tables.set(table_name, []);
      tables.get(table_name).push(column_name);
    }
    const selected = new Map();
    for (const [table, names] of tables) {
      const selection = accountSelection(table, names, userId, email);
      if (selection.predicate) selected.set(table, selection);
    }
    selected.set("user", { predicate: "t.id=$1 AND lower(t.email)=lower($2)", params: [userId, email] });
    selected.set("verification", {
      predicate: "t.identifier=ANY($1::text[])",
      params: [["sign-in", "email-verification", "forget-password"].map((type) => `${type}-otp-${email.toLowerCase()}`)],
    });
    // Block concurrent table writes while resolving and deleting the exact rows.
    // This is NOT a substitute for stopping writers before/after the transaction.
    await client.query(`LOCK TABLE ${[...selected.keys()].sort().map((t) => `public.${quote(t)}`).join(",")} IN SHARE ROW EXCLUSIVE MODE`);
    const identity = await client.query('SELECT id FROM public."user" WHERE id=$1 AND lower(email)=lower($2)', [userId, email]);
    if (identity.rowCount !== 1) throw new Error("Account ID and email do not match");
    const active = await client.query(`SELECT 1 FROM hirelix_private_jobs WHERE user_id::text=$1 AND status IN ('running','queued') LIMIT 1`, [userId]);
    if (active.rowCount) throw new Error("Drain or cancel account jobs before deletion");
    const sending = await client.query("SELECT 1 FROM hirelix_private_email_deliveries WHERE user_id::text=$1 AND status='sending' LIMIT 1", [userId]);
    if (sending.rowCount) throw new Error("Resolve in-flight email delivery before deletion");

    const edges = (await client.query(`
      SELECT child.relname AS child,parent.relname AS parent,
        ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(n,pos)
          JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY k.pos)::text[] AS child_keys,
        ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY k(n,pos)
          JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.n ORDER BY k.pos)::text[] AS parent_keys
      FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid
      JOIN pg_class parent ON parent.oid=c.confrelid
      WHERE c.contype='f' AND child.relnamespace='public'::regnamespace
    `)).rows;
    // Logical ownership dependency without a declared FK.
    edges.push({ child: "hirelix_beta_invite_events", parent: "hirelix_beta_invites" });
    for (const { child, parent } of edges) {
      if (selected.has(parent) && !selected.has(child)) throw new Error(`Unreviewed dependent table: ${child}`);
    }
    const pending = new Set(selected.keys());
    const order = [];
    while (pending.size) {
      const next = [...pending].find((parent) => !edges.some((e) => e.parent === parent && e.child !== parent && pending.has(e.child)));
      if (!next) throw new Error("Review cyclic deletion dependencies");
      order.push(next);
      pending.delete(next);
    }
    const counts = {};
    // Materialize row identities before deleting any ownership parent.
    await client.query("CREATE TEMP TABLE account_delete_rows(table_name text, row_id tid) ON COMMIT DROP");
    for (const [table, { predicate, params }] of selected) {
      await client.query(`INSERT INTO account_delete_rows SELECT '${table.replaceAll("'", "''")}',t.ctid FROM public.${quote(table)} t WHERE ${predicate}`, params);
    }
    // A corrupt/legacy cross-owner relation must abort, never cascade-delete
    // another account's row merely because its parent belongs to this account.
    for (const edge of edges) {
      if (!selected.has(edge.parent) || !edge.child_keys) continue;
      const join = edge.child_keys.map((key, i) => `c.${quote(key)}=p.${quote(edge.parent_keys[i])}`).join(" AND ");
      const foreign = await client.query(`SELECT 1 FROM public.${quote(edge.child)} c
        JOIN public.${quote(edge.parent)} p ON ${join}
        JOIN account_delete_rows r ON r.table_name=$1 AND r.row_id=p.ctid
        WHERE NOT EXISTS(SELECT 1 FROM account_delete_rows cr WHERE cr.table_name=$2 AND cr.row_id=c.ctid) LIMIT 1`,
      [edge.parent, edge.child]);
      if (foreign.rowCount) throw new Error("A dependent record is outside this account's deletion scope");
    }
    for (const table of order) {
      const result = await client.query(`DELETE FROM public.${quote(table)} t USING account_delete_rows r WHERE r.table_name=$1 AND t.ctid=r.row_id`, [table]);
      counts[table] = result.rowCount;
    }
    for (const [table, { predicate, params }] of selected) {
      if ((await client.query(`SELECT 1 FROM public.${quote(table)} t WHERE ${predicate} LIMIT 1`, params)).rowCount) {
        throw new Error(`Account rows remain: ${table}`);
      }
    }
    await client.query(options.apply ? "COMMIT" : "ROLLBACK");
    return { applied: !!options.apply, counts };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const [userId, email, ...flags] = process.argv.slice(2);
  if (!userId || !email || !process.env.DATABASE_URL || flags.some((f) => !["--apply", "--maintenance-confirmed", "--billing-reviewed"].includes(f))) {
    throw new Error("Usage: USER_ID EMAIL [--apply --maintenance-confirmed --billing-reviewed]");
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await deleteAccountData(client, userId, email, {
      apply: flags.includes("--apply"),
      maintenanceConfirmed: flags.includes("--maintenance-confirmed"),
      billingReviewed: flags.includes("--billing-reviewed"),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await client.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write("Account deletion failed; transaction rolled back. Check identity, queued jobs, maintenance, billing review and schema dependencies.\n");
    process.exitCode = 1;
  });
}
