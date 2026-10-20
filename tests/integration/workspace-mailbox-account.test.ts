import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { auth } from "../../src/lib/auth";
import { closeDb, db } from "../../src/db/client";
import { rows } from "../../src/lib/workspace/database";
import { mailboxConnection, mailboxToken } from "../../src/lib/workspace/mailbox";

const database = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.pathname.startsWith("/hirelix_workspace_qa_"));
after(closeDb);

test("real DB: mailbox identity and tokens use the same latest owned provider account", async (t) => {
  const owner = randomUUID(), other = randomUUID(), oldId = randomUUID(), currentId = randomUUID();
  const previous = {id:process.env.MICROSOFT_CLIENT_ID,secret:process.env.MICROSOFT_CLIENT_SECRET,read:process.env.MICROSOFT_MAIL_READ_ENABLED};
  process.env.MICROSOFT_CLIENT_ID = "fixture";
  process.env.MICROSOFT_CLIENT_SECRET = "fixture";
  process.env.MICROSOFT_MAIL_READ_ENABLED = "true";
  t.after(async () => {
    for (const [key,value] of Object.entries({MICROSOFT_CLIENT_ID:previous.id,MICROSOFT_CLIENT_SECRET:previous.secret,MICROSOFT_MAIL_READ_ENABLED:previous.read})) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await db.execute(sql`DELETE FROM "user" WHERE id IN (${owner},${other})`);
  });
  await db.execute(sql`INSERT INTO "user"(id,email) VALUES (${owner},${`${owner}@example.test`}),(${other},${`${other}@example.test`})`);
  await db.execute(sql`INSERT INTO account(id,"userId","providerId","accountId","accessToken",scope,"mailboxEmail","updatedAt") VALUES
    (${oldId},${owner},'microsoft','old-provider-account','fixture-old','Mail.Send','old@example.test','2026-01-01'),
    (${currentId},${owner},'microsoft','current-provider-account','fixture-current','Mail.Send,Mail.Read',NULL,'2026-01-02'),
    (${randomUUID()},${other},'microsoft','other-provider-account','fixture-other','Mail.Send,Mail.Read',NULL,'2026-01-03')`);
  const requested: string[] = [];
  let disconnected = false;
  t.mock.getter(auth,"api",() => ({getAccessToken:async ({body}:{body:{userId:string;providerId:string;accountId:string}}) => {
    assert.equal(body.providerId,"microsoft");
    assert.equal(body.accountId,body.userId === owner ? "current-provider-account" : "other-provider-account");
    requested.push(body.accountId);
    return {accessToken:disconnected ? null : `fixture-${body.accountId}`,scopes:["Mail.Send","Mail.Read"]};
  }}));
  t.mock.method(globalThis,"fetch",async () => Response.json({mail:"current@example.test"}));
  const connection = await mailboxConnection(owner,"microsoft");
  assert.equal(connection.connected,true);
  assert.equal(connection.can_read,true);
  assert.equal(connection.email,"current@example.test");
  const accounts = await rows<{id:string;mailboxEmail:string}>(sql`SELECT id,"mailboxEmail" FROM account WHERE "userId"=${owner}`);
  assert.equal(accounts.find(a=>a.id===oldId)?.mailboxEmail,"old@example.test");
  assert.equal(accounts.find(a=>a.id===currentId)?.mailboxEmail,"current@example.test");
  assert.equal(await mailboxToken(owner,"microsoft","send"),"fixture-current-provider-account");
  assert.equal(await mailboxToken(owner,"microsoft","read"),"fixture-current-provider-account");
  assert.equal(await mailboxToken(other,"microsoft","read"),"fixture-other-provider-account");
  await db.execute(sql`UPDATE account SET "accessToken"=NULL,scope=NULL WHERE id=${currentId}`);
  disconnected = true;
  const before = requested.length;
  assert.equal((await mailboxConnection(owner,"microsoft")).connected,false);
  assert.equal(requested.length,before);
  await assert.rejects(mailboxToken(owner,"microsoft","send"),/Reconnect Microsoft/);
  assert.equal(requested.at(-1),"current-provider-account");
});
