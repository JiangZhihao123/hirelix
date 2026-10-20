import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { exportAccountData } from "../scripts/ops/export-account-data.mjs";
import { deleteAccountData } from "../scripts/ops/delete-account-data.mjs";

test("real PG account export preserves original bytes and excludes other users and credentials", {
  skip: process.env.ACCOUNT_EXPORT_INTEGRATION !== "true",
}, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  assert.ok(url.pathname.startsWith("/hirelix_workspace_qa_"));
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  const owner = randomUUID();
  const other = randomUUID();
  const email = `${owner}@example.test`;
  const original = Buffer.from("Fictional CV\n中文\n");
  const guardTable = `qa_delete_guard_${owner.replaceAll("-", "")}`;
  await client.connect();
  try {
    for (const [id, address] of [[owner, email], [other, `${other}@example.test`]]) {
      await client.query('INSERT INTO public."user"(id,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,true,now(),now())', [id, address]);
      await client.query(`INSERT INTO hirelix_private_files(id,user_id,name,media_type,byte_size,sha256,bytes)
        VALUES($1,$2,'fixture.txt','text/plain',$3,'fixture-hash',$4)`,
      [randomUUID(), id, original.length, original]);
    }
    await client.query(`INSERT INTO account(id,"userId","accountId","providerId","accessToken","refreshToken",password,"createdAt","updatedAt")
      VALUES($1,$2,'fixture-account','google','secret-access','secret-refresh','secret-password',now(),now())`, [randomUUID(), owner]);
    const result = await exportAccountData(client, owner, email);
    assert.equal(result.data.user.length, 1);
    assert.equal(result.data.user[0].id, owner);
    assert.equal(result.data.hirelix_private_files.length, 1);
    assert.deepEqual(result.data.hirelix_private_files[0].bytes, original);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(other), false);
    for (const secret of ["secret-access", "secret-refresh", "secret-password"]) {
      assert.equal(serialized.includes(secret), false);
    }
    assert.equal(result.data.account[0].providerId, "google");
    await assert.rejects(exportAccountData(client, owner, `${other}@example.test`), /do not match/);
    // Failure rolled the transaction back and left the connection usable.
    assert.equal((await client.query("SELECT count(*)::int AS n FROM hirelix_private_files WHERE user_id=$1", [owner])).rows[0].n, 1);
    const roleId = randomUUID();
    const jobId = randomUUID();
    await client.query(`INSERT INTO hirelix_private_roles(id,user_id,title,client_name,jd_text) VALUES($1,$2,'Fictional role','QA','Fixture')`, [roleId, owner]);
    await client.query(`INSERT INTO hirelix_private_records(user_id,role_id,kind,title) VALUES($1,$2,'note','Private fixture')`, [owner, roleId]);
    await client.query(`INSERT INTO hirelix_private_versions(user_id,entity_type,entity_id,version,snapshot) VALUES($1,'role',$2,1,'{}')`, [owner, roleId]);
    await client.query(`INSERT INTO hirelix_private_jobs(id,user_id,kind,request_key) VALUES($1,$2,'chat','privacy-deletion-fixture')`, [jobId, owner]);
    await assert.rejects(deleteAccountData(client, owner, email), /Drain or cancel/);
    await client.query("UPDATE hirelix_private_jobs SET status='cancelled' WHERE id=$1", [jobId]);
    await assert.rejects(deleteAccountData(client, owner, email, { apply: true }), /maintenance/);
    const rehearsal = await deleteAccountData(client, owner, email);
    assert.equal(rehearsal.applied, false);
    assert.equal(rehearsal.counts.hirelix_private_files, 1);
    assert.equal(rehearsal.counts.hirelix_private_records, 1);
    assert.equal(rehearsal.counts.hirelix_private_versions, 1);
    assert.equal((await client.query('SELECT 1 FROM public."user" WHERE id=$1', [owner])).rowCount, 1);
    const legacySearch = randomUUID();
    await client.query("INSERT INTO hirelix_searches(id,user_id,jd_text,status) VALUES($1,$2,'Retired QA fixture','done')", [legacySearch, owner]);
    // Local historical schema may lack this legacy FK; create the actual
    // cascading dependency being tested rather than assuming it exists.
    await client.query(`CREATE TABLE public."${guardTable}"(user_id uuid, search_id uuid REFERENCES hirelix_searches(id) ON DELETE CASCADE)`);
    await client.query(`INSERT INTO public."${guardTable}" VALUES($1,$2)`, [other, legacySearch]);
    await assert.rejects(deleteAccountData(client, owner, email), /outside this account/);
    assert.equal((await client.query(`SELECT 1 FROM public."${guardTable}" WHERE search_id=$1`, [legacySearch])).rowCount, 1);
    await client.query(`UPDATE public."${guardTable}" SET user_id=$1 WHERE search_id=$2`, [owner, legacySearch]);
    // Inject a late database rejection, after child rows have been deleted:
    // all those deletes must roll back with the account row.
    await client.query(`CREATE FUNCTION public.qa_reject_account_delete() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN IF OLD.id='${owner}' THEN RAISE EXCEPTION 'QA deletion rejected'; END IF; RETURN OLD; END $$`);
    await client.query('CREATE TRIGGER qa_reject_account_delete BEFORE DELETE ON public."user" FOR EACH ROW EXECUTE FUNCTION public.qa_reject_account_delete()');
    try {
      await assert.rejects(deleteAccountData(client, owner, email, { apply: true, maintenanceConfirmed: true, billingReviewed: true }), /QA deletion rejected/);
      assert.equal((await client.query("SELECT 1 FROM hirelix_private_records WHERE user_id=$1", [owner])).rowCount, 1);
      assert.equal((await client.query("SELECT 1 FROM hirelix_private_files WHERE user_id=$1", [owner])).rowCount, 1);
    } finally {
      await client.query('DROP TRIGGER qa_reject_account_delete ON public."user"');
      await client.query("DROP FUNCTION public.qa_reject_account_delete()");
    }
    const applied = await deleteAccountData(client, owner, email, { apply: true, maintenanceConfirmed: true, billingReviewed: true });
    assert.equal(applied.applied, true);
    assert.equal((await client.query('SELECT 1 FROM public."user" WHERE id=$1', [owner])).rowCount, 0);
    assert.equal((await client.query("SELECT 1 FROM hirelix_private_versions WHERE user_id=$1", [owner])).rowCount, 0);
    assert.equal((await client.query("SELECT 1 FROM hirelix_private_files WHERE user_id=$1", [other])).rowCount, 1);
  } finally {
    await client.query(`DROP TABLE IF EXISTS public."${guardTable}"`);
    await client.query("DELETE FROM hirelix_private_records WHERE user_id=ANY($1::uuid[])", [[owner, other]]);
    await client.query("DELETE FROM hirelix_private_versions WHERE user_id=ANY($1::uuid[])", [[owner, other]]);
    await client.query("DELETE FROM hirelix_private_roles WHERE user_id=ANY($1::uuid[])", [[owner, other]]);
    await client.query("DELETE FROM hirelix_private_jobs WHERE user_id=ANY($1::uuid[])", [[owner, other]]);
    await client.query("DELETE FROM hirelix_searches WHERE user_id=ANY($1::uuid[])", [[owner, other]]);
    await client.query("DELETE FROM hirelix_private_files WHERE user_id=ANY($1::uuid[])", [[owner, other]]);
    await client.query('DELETE FROM public."user" WHERE id=ANY($1::text[])', [[owner, other]]);
    await client.end();
  }
});
