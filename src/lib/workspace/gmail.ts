import { createHash, randomUUID } from "node:crypto";
import MailComposer from "nodemailer/lib/mail-composer";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { expectVersion, json, owned, rows, WorkspaceError } from "./database";
import { clientDocument } from "./document-sharing";
import { readFile } from "./files";
import { markSubmitted } from "./deliverables";
import type { Deliverable } from "./types";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const sendRecommendationInput = z.object({
  expected_version: z.number().int().positive(),
  to: z.email().max(320),
  request_key: z.uuid(),
});
type Receipt = {
  id: string;
  user_id: string;
  deliverable_id: string;
  deliverable_version: number;
  status: "sending" | "sent" | "failed" | "unknown";
  snapshot: Record<string, unknown>;
  provider_message_id: string | null;
  error: string | null;
  created_at: string;
};
export async function gmailConnection(userId: string) {
  const [account] = await rows<{
    scope: string | null;
    email: string;
    access_token: boolean;
  }>(
    sql`SELECT a.scope,u.email,(a."accessToken" IS NOT NULL) AS access_token FROM account a JOIN "user" u ON u.id=a."userId" WHERE a."userId"=${userId} AND a."providerId"='google' ORDER BY a."updatedAt" DESC LIMIT 1`,
  );
  return {
    connected:
      !!account?.access_token &&
      !!account.scope?.split(/[ ,]+/).includes(GMAIL_SEND_SCOPE),
    email: account?.email || null,
  };
}
export async function disconnectGmail(userId: string) {
  // Keep the Google account identity for sign-in; discard provider API credentials.
  await db.execute(
    sql`UPDATE account SET "accessToken"=NULL,"refreshToken"=NULL,"idToken"=NULL,scope=NULL,"accessTokenExpiresAt"=NULL,"updatedAt"=now() WHERE "userId"=${userId} AND "providerId"='google'`,
  );
}
export async function emailReceipts(userId: string, id: string) {
  await owned(userId, "deliverable", id);
  return rows<{
    id: string;
    status: string;
    recipient: string;
    deliverable_version: number;
    current_copy: boolean;
    error: string | null;
    created_at: string;
  }>(
    sql`SELECT id,deliverable_version,(snapshot->>'title'=(SELECT title FROM hirelix_private_deliverables WHERE user_id=${userId}::uuid AND id=${id}::uuid) AND snapshot->>'content'=(SELECT content FROM hirelix_private_deliverables WHERE user_id=${userId}::uuid AND id=${id}::uuid)) AS current_copy,CASE WHEN status='sending' AND created_at<now()-interval '2 minutes' THEN 'unknown' ELSE status END AS status,snapshot->>'to' AS recipient,error,created_at FROM hirelix_private_email_deliveries WHERE user_id=${userId}::uuid AND deliverable_id=${id}::uuid ORDER BY created_at DESC LIMIT 10`,
  );
}
export async function sendRecommendation(
  userId: string,
  id: string,
  value: unknown,
) {
  const input = sendRecommendationInput.parse(value);
  const [prior] = await rows<Receipt>(
    sql`SELECT * FROM hirelix_private_email_deliveries WHERE user_id=${userId}::uuid AND request_key=${input.request_key}`,
  );
  if (prior) {
    if (
      prior.deliverable_id !== id ||
      prior.deliverable_version !== input.expected_version ||
      prior.snapshot.to !== input.to
    )
      throw new WorkspaceError(
        "This send request belongs to another email",
        409,
      );
    return { receipt: prior.id, status: prior.status };
  }
  const connection = await gmailConnection(userId);
  if (!connection.connected)
    throw new WorkspaceError("Connect Gmail before sending", 409);
  let accessToken: string;
  try {
    const token = await auth.api.getAccessToken({
      body: { providerId: "google", userId },
    });
    if (!token.accessToken || !token.scopes.includes(GMAIL_SEND_SCOPE))
      throw new Error("scope");
    accessToken = token.accessToken;
  } catch {
    throw new WorkspaceError(
      "Reconnect Gmail to renew sending permission",
      409,
    );
  }
  const document = await owned<Deliverable>(userId, "deliverable", id);
  expectVersion(document.version, input.expected_version);
  const reviewed = clientDocument(document);
  const attachments = [];
  let bytes = 0;
  for (const selected of reviewed.files) {
    const file = await readFile(userId, selected.id);
    if (file.sha256 !== selected.sha256)
      throw new WorkspaceError(
        "A selected CV has changed. Review the recommendation again.",
        409,
      );
    bytes += file.bytes.length;
    if (bytes > 18 * 1024 * 1024)
      throw new WorkspaceError(
        "The selected CVs are too large for one email. Use a share link instead.",
      );
    attachments.push({
      filename: file.name,
      content: file.bytes,
      contentType: file.media_type,
    });
  }
  const messageId = `<${randomUUID()}@hirelix.online>`;
  const mime = await new MailComposer({
    from: connection.email!,
    to: input.to,
    subject: reviewed.title,
    text: reviewed.content,
    attachments,
    messageId,
  })
    .compile()
    .build();
  const claimed = await reserveEmailDelivery(
    userId,
    id,
    input,
    connection.email!,
    messageId,
  );
  if (!claimed.send)
    return { receipt: claimed.receipt.id, status: claimed.receipt.status };
  let response: Response;
  try {
    response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: mime.toString("base64url") }),
        signal: AbortSignal.timeout(45000),
      },
    );
  } catch {
    await db.execute(
      sql`UPDATE hirelix_private_email_deliveries SET status='unknown',error='Gmail did not confirm delivery. Check Sent in Gmail before trying again.',updated_at=now() WHERE id=${claimed.receipt.id}::uuid`,
    );
    return { receipt: claimed.receipt.id, status: "unknown" };
  }
  if (!response.ok) {
    // A timeout or server error can follow acceptance. Never blindly resend it.
    const status =
      response.status >= 500 || response.status === 408 ? "unknown" : "failed";
    const error =
      status === "unknown"
        ? "Gmail did not confirm delivery. Check Sent in Gmail before trying again."
        : response.status === 401 || response.status === 403
          ? "Gmail declined sending. Reconnect Gmail and check that the Gmail API is enabled."
          : "Gmail rejected this email. Check the recipient and attachments before trying again.";
    await db.execute(
      sql`UPDATE hirelix_private_email_deliveries SET status=${status},error=${error},updated_at=now() WHERE id=${claimed.receipt.id}::uuid`,
    );
    return { receipt: claimed.receipt.id, status };
  }
  const result = (await response.json().catch(() => null)) as {
    id?: string;
  } | null;
  if (!result?.id) {
    await db.execute(
      sql`UPDATE hirelix_private_email_deliveries SET status='unknown',updated_at=now() WHERE id=${claimed.receipt.id}::uuid`,
    );
    return { receipt: claimed.receipt.id, status: "unknown" };
  }
  // Record Gmail acceptance first. A later workspace update must never cause another send.
  await db.execute(
    sql`UPDATE hirelix_private_email_deliveries SET status='sent',provider_message_id=${result.id},updated_at=now() WHERE id=${claimed.receipt.id}::uuid`,
  );
  try {
    await markSubmitted(userId, id, {
      expected_version: input.expected_version,
      submitted_at: new Date().toISOString(),
      submission_note: `Sent through Gmail to ${input.to}. Gmail message: ${result.id}.`,
    });
  } catch (error) {
    if (!(error instanceof WorkspaceError)) throw error;
  }
  return { receipt: claimed.receipt.id, status: "sent" };
}

// Reserve one immutable send before contacting Gmail. An uncertain attempt cannot be claimed again.
export async function reserveEmailDelivery(
  userId: string,
  id: string,
  value: unknown,
  from: string,
  messageId: string,
) {
  const input = sendRecommendationInput.parse(value);
  return db.transaction(async (tx) => {
    const current = await owned<Deliverable>(
      userId,
      "deliverable",
      id,
      tx,
      true,
    );
    expectVersion(current.version, input.expected_version);
    const reviewed = clientDocument(current);
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify([
          id,
          input.to.toLowerCase(),
          reviewed.title,
          reviewed.content,
          reviewed.files.map((f) => [f.id, f.sha256]),
        ]),
      )
      .digest("hex");
    const [prior] = await rows<Receipt & { fingerprint: string }>(
      sql`SELECT * FROM hirelix_private_email_deliveries WHERE user_id=${userId}::uuid AND request_key=${input.request_key}`,
      tx,
    );
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new WorkspaceError(
          "This send request belongs to another email",
          409,
        );
      return { receipt: prior, send: false };
    }
    const [existing] = await rows<Receipt>(
      sql`SELECT * FROM hirelix_private_email_deliveries WHERE user_id=${userId}::uuid AND fingerprint=${fingerprint} AND status IN ('sending','sent','unknown')`,
      tx,
    );
    if (existing) return { receipt: existing, send: false };
    const [receipt] = await rows<Receipt>(
      sql`INSERT INTO hirelix_private_email_deliveries(user_id,deliverable_id,deliverable_version,request_key,fingerprint,status,snapshot) VALUES(${userId}::uuid,${id}::uuid,${input.expected_version},${input.request_key},${fingerprint},'sending',${json({ ...reviewed, to: input.to, from, message_id: messageId })}) RETURNING *`,
      tx,
    );
    return { receipt, send: true };
  });
}
