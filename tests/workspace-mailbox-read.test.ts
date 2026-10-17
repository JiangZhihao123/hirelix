import assert from "node:assert/strict";
import { test } from "node:test";
import { auth } from "../src/lib/auth";
import { gmailMessage, readMailboxMessage } from "../src/lib/workspace/mailbox";

test("Gmail preserves provider labels instead of treating a sent copy as received", () => {
  const message = gmailMessage({ id: "sent-copy", labelIds: ["SENT"], payload: { mimeType: "text/plain", body: { data: Buffer.from("test").toString("base64url") } } });
  assert.deepEqual(message.mailbox_labels, ["SENT"]);
  assert.equal(message.body, "test");
  assert.equal(gmailMessage({ id: "missing-labels" }).mailbox_labels, undefined);
});

test("Microsoft reading respects its gate and preserves provider folder evidence", async (t) => {
  const previous = Object.fromEntries(["MICROSOFT_MAIL_READ_ENABLED", "MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"].map(key => [key, process.env[key]]));
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  process.env.MICROSOFT_CLIENT_ID = "test";
  process.env.MICROSOFT_CLIENT_SECRET = "test";
  process.env.MICROSOFT_MAIL_READ_ENABLED = "false";
  let tokenCalls = 0;
  t.mock.getter(auth, "api", () => ({ getAccessToken: async () => { tokenCalls++; return { accessToken: "test-token", scopes: ["Mail.Read"] }; } }));
  await assert.rejects(readMailboxMessage("owner", { provider: "microsoft", message_id: "copy" }), /not available/);
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
