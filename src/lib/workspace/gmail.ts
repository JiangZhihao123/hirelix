import { createHash, randomUUID } from "node:crypto";
import MailComposer from "nodemailer/lib/mail-composer";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { expectVersion, json, owned, rows, WorkspaceError, type Runner } from "./database";
import { clientDocument, assertSharingAllowed, activeDocumentShare } from "./document-sharing";
import { readFile } from "./files";
import { markSubmitted } from "./deliverables";
import { emailSnapshotSchema, type EmailSnapshot } from "./email-contract";
import type { Deliverable } from "./types";
import { recommendationCover } from "./recommendation-presentation";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const sendRecommendationInput = z.object({
  expected_version: z.number().int().positive(),
  to: z.email().max(320),
  request_key: z.uuid(),
  share_id: z.uuid().nullable().optional(),
  email_subject: z.string().trim().min(1).max(998).refine(value => !/[\r\n]/.test(value)).optional(),
  email_content: z.string().trim().min(1).max(40000).optional(),
  attach_cvs: z.boolean().default(true),
});
export type Receipt = {
  id: string;
  user_id: string;
  deliverable_id: string | null;
  deliverable_version: number | null;
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
    requires_reconnect: boolean;
  }>(
    sql`SELECT a.scope,u.email,(a."accessToken" IS NOT NULL) AS access_token, EXISTS(SELECT 1 FROM hirelix_private_email_deliveries e WHERE e.user_id::text=a."userId" AND e.updated_at>a."updatedAt" AND e.status='failed' AND e.error LIKE 'Gmail declined sending.%') AS requires_reconnect FROM account a JOIN "user" u ON u.id=a."userId" WHERE a."userId"=${userId} AND a."providerId"='google' ORDER BY a."updatedAt" DESC LIMIT 1`,
  );
  return {
    connected:
      !!account?.access_token &&
      !account.requires_reconnect &&
      !!account.scope?.split(/[ ,]+/).includes(GMAIL_SEND_SCOPE),
    email: account?.email || null,
    requires_reconnect: account?.requires_reconnect || false,
  };
}
export async function disconnectGmail(userId: string) {
  // Keep the Google account identity for sign-in; discard provider API credentials.
  await db.execute(
    sql`UPDATE account SET "accessToken"=NULL,"refreshToken"=NULL,"idToken"=NULL,scope=NULL,"accessTokenExpiresAt"=NULL,"updatedAt"=now() WHERE "userId"=${userId} AND "providerId"='google'`,
  );
}
export async function mailboxActivity(userId: string, filters: { role?: string; document?: string } = {}) {
  const role = filters.role ? z.uuid().parse(filters.role) : null;
  const document = filters.document ? z.uuid().parse(filters.document) : null;
  return rows<{
    id: string; status: string; recipient: string; subject: string; content: string;
    deliverable_id: string | null; role_id: string | null; role_title: string | null;
    client_name: string | null; error: string | null; created_at: string;
  }>(sql`
    SELECT e.id, CASE WHEN e.status='sending' AND e.created_at<now()-interval '2 minutes' THEN 'unknown' ELSE e.status END AS status,
      e.snapshot->>'to' AS recipient, e.snapshot->>'title' AS subject, e.snapshot->>'content' AS content,
      e.deliverable_id, d.role_id, r.title AS role_title, r.client_name, e.error, e.created_at
    FROM hirelix_private_email_deliveries e
    LEFT JOIN hirelix_private_deliverables d ON d.id=e.deliverable_id AND d.user_id=e.user_id
    LEFT JOIN hirelix_private_roles r ON r.id=d.role_id AND r.user_id=e.user_id
    WHERE e.user_id=${userId}::uuid
      AND (${role}::uuid IS NULL OR d.role_id=${role}::uuid)
      AND (${document}::uuid IS NULL OR e.deliverable_id=${document}::uuid)
    ORDER BY e.created_at DESC, e.id DESC LIMIT 100
  `);
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
    sql`SELECT id,deliverable_version,(coalesce(snapshot->>'document_title',snapshot->>'title')=(SELECT title FROM hirelix_private_deliverables WHERE user_id=${userId}::uuid AND id=${id}::uuid) AND coalesce(snapshot->>'document_content',snapshot->>'content')=(SELECT content FROM hirelix_private_deliverables WHERE user_id=${userId}::uuid AND id=${id}::uuid)) AS current_copy,CASE WHEN status='sending' AND created_at<now()-interval '2 minutes' THEN 'unknown' ELSE status END AS status,snapshot->>'to' AS recipient,error,created_at FROM hirelix_private_email_deliveries WHERE user_id=${userId}::uuid AND deliverable_id=${id}::uuid ORDER BY created_at DESC LIMIT 10`,
  );
}
export async function recommendationEmail(userId: string, document: Deliverable, input: z.infer<typeof sendRecommendationInput>, origin: string, runner?: Runner) {
  const reviewed = clientDocument(document);
  let link = "";
  if (input.share_id) {
    const share = await activeDocumentShare(userId, document.id, runner);
    if (!share || share.id !== input.share_id || !share.current_copy)
      throw new WorkspaceError("Publish the current version before including its link", 409);
    link = `\n\n${reviewed.language === "zh" ? "查看推荐与提交反馈" : "View recommendation and share feedback"}: ${new URL(share.path,origin).href}`;
  }
  if (input.share_id && input.email_content && /\{\{[^{}]+\}\}/.test(input.email_content))
    throw new WorkspaceError("Replace template placeholders with concrete text. Omit link placeholders: the recommendation URL is appended automatically. Prepare the corrected preview without asking the user to fix formatting.",400);
  const body = input.email_content ?? (input.share_id ? recommendationCover(reviewed) : reviewed.content);
  return {...reviewed, title: input.email_subject ?? reviewed.title, content: body + link,
    files: input.attach_cvs ? reviewed.files : [], document_title: reviewed.title, document_content: reviewed.content,
    share_id: input.share_id || null, delivery_options: deliveryOptions(input)};
}
function deliveryOptions(input: z.infer<typeof sendRecommendationInput>) {
  return {subject: input.email_subject ?? null, content: input.email_content ?? null, attach_cvs: input.attach_cvs};
}

export async function sendRecommendation(
  userId: string,
  id: string,
  value: unknown,
  origin = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
) {
  const input = sendRecommendationInput.parse(value);
  const [prior] = await rows<Receipt>(
    sql`SELECT * FROM hirelix_private_email_deliveries WHERE user_id=${userId}::uuid AND request_key=${input.request_key}`,
  );
  if (prior) {
    if (
      prior.deliverable_id !== id ||
      prior.deliverable_version !== input.expected_version ||
      prior.snapshot.to !== input.to ||
      (prior.snapshot.share_id || null) !== (input.share_id || null) ||
      JSON.stringify(prior.snapshot.delivery_options ?? {subject:null,content:null,attach_cvs:true}) !== JSON.stringify(deliveryOptions(input))
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
  const document = await owned<Deliverable>(userId, "deliverable", id);
  expectVersion(document.version, input.expected_version);
  const reviewed = await recommendationEmail(userId, document, input, origin);
  await assertSharingAllowed(userId, document.role_id, reviewed);
  const snapshot = { ...reviewed, from: connection.email!, to: input.to, document_id: id, document_version: input.expected_version };
  const { mime, messageId, accessToken } = await composeGmail(userId, snapshot);
  const claimed = await reserveEmailDelivery(
    userId,
    id,
    input,
    connection.email!,
    messageId,
    origin,
  );
  if (!claimed.send)
    return { receipt: claimed.receipt.id, status: claimed.receipt.status };
  const result = await deliverGmail(claimed.receipt, mime, accessToken);
  if (result.status !== "sent") return result;
  try {
    await markSubmitted(userId, id, {
      expected_version: input.expected_version,
      submitted_at: new Date().toISOString(),
      submission_note: `Sent through Gmail to ${input.to}. Gmail message: ${result.provider_message_id}.`,
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
  origin = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
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
    const reviewed = await recommendationEmail(userId, current, input, origin, tx);
    await assertSharingAllowed(userId, current.role_id, reviewed, tx);
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

async function composeGmail(userId: string, snapshot: EmailSnapshot) {
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
  return {...await buildEmailMime(userId,snapshot),accessToken};
}

export async function buildEmailMime(userId: string, snapshot: EmailSnapshot) {
  emailSnapshotSchema.parse(snapshot);
  const attachments = [];
  let bytes = 0;
  for (const selected of snapshot.files) {
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
    from: snapshot.from,
    to: snapshot.to,
    subject: snapshot.title,
    text: snapshot.content,
    attachments,
    messageId,
  })
    .compile()
    .build();
  return { mime, messageId };
}

async function deliverGmail(receipt: Receipt, mime: Buffer, accessToken: string) {
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
      sql`UPDATE hirelix_private_email_deliveries SET status='unknown',error='Gmail did not confirm delivery. Check Sent in Gmail before trying again.',updated_at=now() WHERE id=${receipt.id}::uuid`,
    );
    return { receipt: receipt.id, status: "unknown" };
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
      sql`UPDATE hirelix_private_email_deliveries SET status=${status},error=${error},updated_at=now() WHERE id=${receipt.id}::uuid`,
    );
    return { receipt: receipt.id, status };
  }
  const result = (await response.json().catch(() => null)) as {
    id?: string;
  } | null;
  if (!result?.id) {
    await db.execute(
      sql`UPDATE hirelix_private_email_deliveries SET status='unknown',updated_at=now() WHERE id=${receipt.id}::uuid`,
    );
    return { receipt: receipt.id, status: "unknown" };
  }
  // Record Gmail acceptance first. A later workspace update must never cause another send.
  await db.execute(
    sql`UPDATE hirelix_private_email_deliveries SET status='sent',provider_message_id=${result.id},updated_at=now() WHERE id=${receipt.id}::uuid`,
  );
  return { receipt: receipt.id, status: "sent", provider_message_id: result.id };
}

// Both UI and Agent sends use the same MIME, provider and uncertainty handling.
export async function sendConversationEmail(userId: string, snapshot: EmailSnapshot, requestKey: string, guard: (tx: Runner) => Promise<void>) {
  emailSnapshotSchema.parse(snapshot);
  const [prior] = await rows<Receipt>(sql`SELECT * FROM hirelix_private_email_deliveries WHERE user_id=${userId}::uuid AND request_key=${requestKey}`);
  if (prior) {
    if ((prior.snapshot.to !== snapshot.to || prior.snapshot.title !== snapshot.title || prior.snapshot.content !== snapshot.content || prior.deliverable_id !== snapshot.document_id)) throw new WorkspaceError("This send request belongs to another email",409);
    await recordConversationSubmission(userId, snapshot, prior);
    return { receipt: prior.id, status: effectiveDeliveryStatus(prior) };
  }
  const connection = await gmailConnection(userId);
  if (!connection.connected || connection.email !== snapshot.from) throw new WorkspaceError("Reconnect the reviewed Gmail account before sending", 409);
  const {mime, messageId, accessToken} = await composeGmail(userId, snapshot);
  const claimed = await reserveConversationEmail(userId, snapshot, requestKey, messageId, guard);
  if (!claimed.send) {
    await recordConversationSubmission(userId, snapshot, claimed.receipt);
    return {receipt: claimed.receipt.id, status: effectiveDeliveryStatus(claimed.receipt)};
  }
  const result = await deliverGmail(claimed.receipt, mime, accessToken);
  await recordConversationSubmission(userId, snapshot, {status:result.status,provider_message_id:result.provider_message_id || null});
  return result;
}
async function recordConversationSubmission(userId: string, snapshot: EmailSnapshot, receipt: {status:string;provider_message_id:string|null}) {
  if (receipt.status !== "sent" || !snapshot.document_id || !snapshot.document_version) return;
  try {
    await markSubmitted(userId, snapshot.document_id, {expected_version:snapshot.document_version,submitted_at:new Date().toISOString(),submission_note:`Sent through Gmail to ${snapshot.to}. Gmail message: ${receipt.provider_message_id}.`});
  } catch(error) {
    if (!(error instanceof WorkspaceError)) throw error;
  }
}
export function effectiveDeliveryStatus(receipt: Pick<Receipt, "status" | "created_at">) {
  return receipt.status === "sending" && Date.now() - new Date(receipt.created_at).getTime() > 120000 ? "unknown" : receipt.status;
}
export async function reserveConversationEmail(userId: string, snapshot: EmailSnapshot, requestKey: string, messageId: string, guard: (tx: Runner) => Promise<void>) {
  emailSnapshotSchema.parse(snapshot);
  return db.transaction(async tx => {
    await guard(tx);
    if (snapshot.document_id) {
      const document = await owned<Deliverable>(userId, "deliverable", snapshot.document_id, tx, true);
      expectVersion(document.version, snapshot.document_version!);
      const reviewed = snapshot.recommendation_delivery
        ? await recommendationEmail(userId,document,sendRecommendationInput.parse({...snapshot.recommendation_delivery,expected_version:snapshot.document_version,to:snapshot.to,request_key:requestKey}),process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",tx)
        : clientDocument(document);
      await assertSharingAllowed(userId, document.role_id, reviewed, tx);
      if (reviewed.title !== snapshot.title || reviewed.content !== snapshot.content || JSON.stringify(reviewed.files.map(f => [f.id, f.sha256])) !== JSON.stringify(snapshot.files.map(f => [f.id, f.sha256]))) throw new WorkspaceError("The email changed. Review it again before sending.", 409);
    }
    const fingerprint = createHash("sha256").update(JSON.stringify([snapshot.document_id, snapshot.to.toLowerCase(), snapshot.title, snapshot.content, snapshot.files.map(f => [f.id, f.sha256])])).digest("hex");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId + fingerprint},0))`);
    const [prior] = await rows<Receipt & {fingerprint:string}>(sql`SELECT * FROM hirelix_private_email_deliveries WHERE user_id=${userId}::uuid AND (request_key=${requestKey} OR (fingerprint=${fingerprint} AND status IN ('sending','sent','unknown'))) ORDER BY created_at LIMIT 1`, tx);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new WorkspaceError("This send request belongs to another email",409);
      return {receipt: prior, send: false};
    }
    const [receipt] = await rows<Receipt>(sql`INSERT INTO hirelix_private_email_deliveries(user_id,deliverable_id,deliverable_version,request_key,fingerprint,status,snapshot) VALUES(${userId}::uuid,${snapshot.document_id}::uuid,${snapshot.document_version},${requestKey},${fingerprint},'sending',${json({...snapshot,message_id:messageId})}) RETURNING *`, tx);
    return {receipt,send:true};
  });
}
