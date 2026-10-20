import assert from "node:assert/strict";
import { test } from "node:test";
import { auth } from "../src/lib/auth";
import { getDb } from "../src/db/client";
import { gmailMessage, mailboxToken, readMailboxMessage, searchMailbox } from "../src/lib/workspace/mailbox";

process.env.DATABASE_URL ||= "postgresql://fixture:fixture@127.0.0.1:1/fixture";

test("mailbox access distinguishes temporary failures from missing authorization without exposing details", async (t) => {
  t.mock.method(getDb(), "execute", async () => [{accountId:"selected-account"}]);
  const readEnabled = process.env.GMAIL_READ_ENABLED;
  process.env.GMAIL_READ_ENABLED = "true";
  t.after(() => { if (readEnabled === undefined) delete process.env.GMAIL_READ_ENABLED; else process.env.GMAIL_READ_ENABLED = readEnabled; });
  let result: unknown = new TypeError("private transport detail");
  t.mock.getter(auth, "api", () => ({ getAccessToken: async ({body}: {body:{accountId:string;userId:string;providerId:string}}) => {
    assert.equal(body.accountId, "selected-account");
    assert.equal(body.userId, "fixture-owner");
    assert.equal(body.providerId, "google");
    if (result instanceof Error || (result as {body?:unknown})?.body) throw result;
    return result;
  } }));
  await assert.rejects(mailboxToken("fixture-owner", "google", "read"), (error: unknown) => {
    assert.equal((error as {status:number}).status, 502);
    assert.match((error as Error).message, /try again/i);
    assert.doesNotMatch((error as Error).message, /Reconnect|private transport detail/);
    return true;
  });
  for (const code of ["ACCOUNT_NOT_FOUND", "REFRESH_TOKEN_NOT_FOUND", "ACCESS_TOKEN_NOT_FOUND", "INVALID_TOKEN"]) {
    result = {body:{code,message:"private provider detail"}};
    await assert.rejects(mailboxToken("fixture-owner", "google", "read"), (error: unknown) => {
      assert.equal((error as {status:number}).status,409);
      assert.match((error as Error).message,/Reconnect Google/);
      assert.doesNotMatch((error as Error).message,/private provider detail/);
      return true;
    });
  }
  for (const token of [{accessToken:"fixture-only",scopes:[]}, {accessToken:null,scopes:["https://www.googleapis.com/auth/gmail.readonly"]}]) {
    result = token;
    await assert.rejects(mailboxToken("fixture-owner", "google", "read"), /Reconnect Google/);
  }
  // The SDK combines multiple refresh failure causes under this code. Do not
  // infer a network fault or revoked authorization from this wrapper alone.
  result = {body:{code:"FAILED_TO_GET_ACCESS_TOKEN",message:"private provider detail"}};
  await assert.rejects(mailboxToken("fixture-owner", "google", "read"), (error: unknown) => {
    assert.equal((error as {status:number}).status,502);
    assert.doesNotMatch((error as Error).message,/Reconnect|private provider detail/);
    return true;
  });
  result = {accessToken:"fixture-only",scopes:["https://www.googleapis.com/auth/gmail.readonly"]};
  assert.equal(await mailboxToken("fixture-owner", "google", "read"),"fixture-only");
});

test("unavailable Gmail search and reading explain capabilities and alternatives before accessing the provider", async (t) => {
  const previous = process.env.GMAIL_READ_ENABLED;
  t.after(() => { if (previous === undefined) delete process.env.GMAIL_READ_ENABLED; else process.env.GMAIL_READ_ENABLED = previous; });
  process.env.GMAIL_READ_ENABLED = "false";
  let tokenCalls = 0;
  t.mock.getter(auth, "api", () => ({ getAccessToken: async () => { tokenCalls++; throw new Error("must not request access"); } }));
  for (const action of [() => searchMailbox("owner", {provider:"google",query:"test"}), () => readMailboxMessage("owner", {provider:"google",message_id:"test"})]) {
    await assert.rejects(action(), (error: unknown) => {
      assert.match((error as Error).message, /Gmail reading is not supported yet/);
      assert.match((error as Error).message, /sending email after connection/);
      assert.match((error as Error).message, /paste.*upload/);
      assert.doesNotMatch((error as Error).message, /[Rr]econnect/);
      assert.doesNotMatch((error as Error).message, /review|verification|Sending remains available/);
      return true;
    });
  }
  assert.equal(tokenCalls, 0);
});

test("Gmail decodes each MIME part using its declared charset", () => {
  const part = { mimeType: "text/plain", headers: [{ name: "Content-Type", value: 'text/plain; charset="gb2312"' }], body: { data: Buffer.from("d6d0cec4", "hex").toString("base64url") } };
  assert.equal(gmailMessage({id:"chinese",payload:{parts:[part]}}).body,"中文");
  assert.equal(gmailMessage({id:"normalized",payload:{...part,body:{data:Buffer.from("中文").toString("base64url")}}}).body,"中文");
  assert.throws(() => gmailMessage({id:"unknown",payload:{...part,headers:[{name:"Content-Type",value:"text/plain; charset=unknown-charset"}]}}), /unsupported text encoding/);
});

test("Gmail preserves provider labels instead of treating a sent copy as received", () => {
  const message = gmailMessage({ id: "sent-copy", labelIds: ["SENT"], payload: { mimeType: "text/plain", body: { data: Buffer.from("test").toString("base64url") } } });
  assert.deepEqual(message.mailbox_labels, ["SENT"]);
  assert.equal(message.body, "test");
  assert.equal(gmailMessage({ id: "missing-labels" }).mailbox_labels, undefined);
});

test("Microsoft reading respects its gate and preserves provider folder evidence", async (t) => {
  t.mock.method(getDb(), "execute", async () => [{accountId:"selected-microsoft-account"}]);
  const previous = Object.fromEntries(["MICROSOFT_MAIL_READ_ENABLED", "MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"].map(key => [key, process.env[key]]));
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  process.env.MICROSOFT_CLIENT_ID = "test";
  process.env.MICROSOFT_CLIENT_SECRET = "test";
  process.env.MICROSOFT_MAIL_READ_ENABLED = "false";
  let tokenCalls = 0;
  t.mock.getter(auth, "api", () => ({ getAccessToken: async () => { tokenCalls++; return { accessToken: "test-token", scopes: ["Mail.Read"] }; } }));
  await assert.rejects(readMailboxMessage("owner", { provider: "microsoft", message_id: "copy" }), /Outlook reading is not supported yet/);
  assert.equal(tokenCalls, 0);
  process.env.MICROSOFT_MAIL_READ_ENABLED = "true";
  const requested: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    requested.push(String(url));
    return Response.json(String(url).includes("/mailFolders/") ? { displayName: "Sent Items" } : { id: "copy", parentFolderId: "folder/id", isDraft: false, sentDateTime: "2026-10-17T07:53:43Z", receivedDateTime: "2026-10-17T07:53:44Z", body: { contentType: "text", content: "test" } });
  });
  const message = await readMailboxMessage("owner", { provider: "microsoft", message_id: "copy" });
  assert.equal(message.mailbox_folder, "Sent Items");
  assert.equal(message.is_draft, false);
  assert.equal(message.sent_at, "2026-10-17T07:53:43Z");
  assert.ok(requested[1].includes("mailFolders/folder%2Fid"));
});
