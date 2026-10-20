import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { exportAccountData } from "../scripts/ops/export-account-data.mjs";

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
  } finally {
    await client.query("DELETE FROM hirelix_private_files WHERE user_id=ANY($1::uuid[])", [[owner, other]]);
    await client.query('DELETE FROM public."user" WHERE id=ANY($1::text[])', [[owner, other]]);
    await client.end();
  }
});
