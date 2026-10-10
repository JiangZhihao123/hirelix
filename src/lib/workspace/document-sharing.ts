import { createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { expectVersion, json, owned, rows, WorkspaceError, type Runner } from "./database";
import { readFile } from "./files";
import type { Deliverable } from "./types";

// Deliberately allowlist client content. Never publish the full source snapshot.
export const clientDocumentSchema = z.object({
  title: z.string(),
  content: z.string(),
  language: z.enum(["en", "zh"]),
  client: z.string(),
  role: z.string(),
  people: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      headline: z.string().default(""),
      location: z.string().default(""),
    }),
  ),
  files: z.array(
    z.object({
      id: z.uuid(),
      person_id: z.uuid(),
      name: z.string(),
      sha256: z.string(),
    }),
  ),
});
export type ClientDocument = z.infer<typeof clientDocumentSchema>;
type Share = {
  id: string;
  user_id: string;
  deliverable_id: string;
  deliverable_version: number;
  snapshot: ClientDocument;
  expires_at: string;
  revoked_at: string | null;
};
export function clientDocument(document: Deliverable): ClientDocument {
  if (
    document.kind !== "submission" ||
    document.source_snapshot.audience === "internal"
  )
    throw new WorkspaceError(
      "Only client candidate recommendations can be shared",
      409,
    );
  const source = document.source_snapshot;
  const role = (source.role || {}) as Record<string, unknown>;
  return clientDocumentSchema.parse({
    title: document.title,
    content: document.content,
    language: source.language || "en",
    client: role.client_name || "",
    role: role.title || "",
    people: source.people || [],
    files: source.files || [],
  });
}
// Explicit refusal is a live relationship fact, not a frozen draft property.
// Preparation, publication and send reservation share this check.
export async function assertSharingAllowed(userId: string, roleId: string, snapshot: ClientDocument, runner?: Runner) {
  const ids = [...new Set([...snapshot.people.map(person => person.id), ...snapshot.files.map(file => file.person_id)])];
  if (!ids.length) return;
  const relationships = await rows<{permission: string}>(sql`SELECT permission FROM hirelix_private_role_candidates WHERE user_id=${userId}::uuid AND role_id=${roleId}::uuid AND person_id IN (${sql.join(ids.map(id => sql`${id}::uuid`), sql`,`)}) ${runner ? sql`FOR SHARE` : sql``}`, runner);
  if (relationships.some(link => link.permission === 'declined')) throw new WorkspaceError("A candidate has declined sharing for this role. This document cannot be sent or shared unless that candidate explicitly changes their decision.", 409);
}
function token(id: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret)
    throw new Error("Document sharing requires the application secret");
  return `${id}.${createHmac("sha256", secret).update(`hirelix-document-share:${id}`).digest("base64url")}`;
}
function tokenId(value: string) {
  const parts = value.split(".");
  if (
    parts.length !== 2 ||
    !z.uuid().safeParse(parts[0]).success ||
    !/^[\w-]{43}$/.test(parts[1])
  )
    return null;
  const expected = Buffer.from(token(parts[0]));
  const supplied = Buffer.from(value);
  return expected.length === supplied.length &&
    timingSafeEqual(expected, supplied)
    ? parts[0]
    : null;
}
function summary(share: Share) {
  return {
    id: share.id,
    version: share.deliverable_version,
    expires_at: share.expires_at,
    path: `/recommendation/${token(share.id)}`,
  };
}
export async function activeDocumentShare(userId: string, id: string) {
  const document = await owned<Deliverable>(userId, "deliverable", id);
  const [share] = await rows<Share>(
    sql`SELECT * FROM hirelix_private_document_shares WHERE user_id=${userId}::uuid AND deliverable_id=${id}::uuid AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1`,
  );
  if (share) await assertSharingAllowed(userId, document.role_id, clientDocumentSchema.parse(share.snapshot));
  return share ? summary(share) : null;
}
export async function publishDocument(
  userId: string,
  id: string,
  version: number,
) {
  return db.transaction(async (tx) => {
    const document = await owned<Deliverable>(
      userId,
      "deliverable",
      id,
      tx,
      true,
    );
    expectVersion(document.version, version);
    const snapshot = clientDocument(document);
    await assertSharingAllowed(userId, document.role_id, snapshot, tx);
    const [existing] = await rows<Share>(
      sql`SELECT * FROM hirelix_private_document_shares WHERE user_id=${userId}::uuid AND deliverable_id=${id}::uuid AND deliverable_version=${version} AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1`,
      tx,
    );
    if (existing) return summary(existing);
    // Updating a shared copy invalidates the old URL; edits alone never change a published copy.
    await tx.execute(
      sql`UPDATE hirelix_private_document_shares SET revoked_at=now() WHERE user_id=${userId}::uuid AND deliverable_id=${id}::uuid AND revoked_at IS NULL`,
    );
    const [share] = await rows<Share>(
      sql`INSERT INTO hirelix_private_document_shares(user_id,deliverable_id,deliverable_version,snapshot) VALUES(${userId}::uuid,${id}::uuid,${version},${json(snapshot)}) RETURNING *`,
      tx,
    );
    return summary(share);
  });
}
export async function revokeDocumentShare(userId: string, id: string) {
  await owned(userId, "deliverable", id);
  await db.execute(
    sql`UPDATE hirelix_private_document_shares SET revoked_at=now() WHERE user_id=${userId}::uuid AND deliverable_id=${id}::uuid AND revoked_at IS NULL`,
  );
}
export async function readSharedDocument(value: string) {
  const id = tokenId(value);
  if (!id) return null;
  const [share] = await rows<Share>(
    sql`SELECT * FROM hirelix_private_document_shares WHERE id=${id}::uuid AND revoked_at IS NULL AND expires_at>now()`,
  );
  if (!share) return null;
  const snapshot = clientDocumentSchema.parse(share.snapshot);
  const document = await owned<Deliverable>(share.user_id, "deliverable", share.deliverable_id);
  try { await assertSharingAllowed(share.user_id, document.role_id, snapshot); }
  catch (error) { if (error instanceof WorkspaceError && error.status === 409) return null; throw error; }
  return { ...share, snapshot };
}
export async function sharedDocumentFile(value: string, fileId: string) {
  const share = await readSharedDocument(value);
  const selected = share?.snapshot.files.find((file) => file.id === fileId);
  if (!share || !selected)
    throw new WorkspaceError("This shared file is unavailable", 404);
  const file = await readFile(share.user_id, fileId);
  if (file.sha256 !== selected.sha256)
    throw new WorkspaceError("This shared file is unavailable", 404);
  return file;
}
