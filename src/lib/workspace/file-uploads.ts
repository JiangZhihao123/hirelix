import { createHash } from "node:crypto";
import path from "node:path";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { rows, WorkspaceError } from "./database";
import { attachmentError, MAX_ATTACHMENT_BYTES, MAX_UPLOAD_PARTS, UPLOAD_PART_BYTES } from "./attachments";
import { saveFile, type PrivateFile } from "./files";

export const uploadInput = z.object({
  name: z.string().min(1).max(250), type: z.string().max(200).regex(/^[^\r\n]*$/),
  size: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
function filename(value: string) {
  const name = path.basename(value);
  if (name !== value || (name.includes("\u0000") || name.includes("\\"))) throw new WorkspaceError("Use a filename without path components.");
  const error = attachmentError(name, 1);
  if (error) throw new WorkspaceError(error);
  return name;
}
const resultFile = (file: PrivateFile) => ({ file_id: file.id, name: file.name, size: file.byte_size });

// A retry of a received part is a read; conflicting bytes never overwrite it.
export async function saveUploadPart(userId: string, id: string, index: number, name: string, bytes: Uint8Array) {
  z.uuid().parse(id);
  z.number().int().min(0).max(MAX_UPLOAD_PARTS - 1).parse(index);
  name = filename(name);
  if (!bytes.length || bytes.length > UPLOAD_PART_BYTES) throw new WorkspaceError("Upload parts must be non-empty and at most 2 MB.");
  const hash = createHash("sha256").update(bytes).digest("hex");
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`file-upload:${userId}:${id}`},0))`);
    const existing = await rows<{ upload_part: number; name: string; sha256: string }>(sql`SELECT upload_part,name,sha256 FROM hirelix_private_files WHERE user_id=${userId}::uuid AND upload_id=${id}::uuid`, tx);
    if (existing.some(part => part.name !== name)) throw new WorkspaceError("This upload belongs to another file.", 409);
    const prior = existing.find(part => part.upload_part === index);
    if (prior && prior.sha256 !== hash) throw new WorkspaceError("This upload part has different bytes. Choose the original file again.", 409);
    if (!prior) await tx.execute(sql`INSERT INTO hirelix_private_files(user_id,name,media_type,byte_size,sha256,bytes,upload_id,upload_part)
      VALUES(${userId}::uuid,${name},'application/octet-stream',${bytes.length},${hash},decode(${Buffer.from(bytes).toString("base64")},'base64'),${id}::uuid,${index})`);
    return { received_part: index };
  });
}

// Status, completion and recovery all use the same upload identity. A lost final
// response is recovered by its verified content hash without another original.
export async function completeFileUpload(userId: string, id: string, value: unknown) {
  z.uuid().parse(id);
  const input = uploadInput.parse(value), name = filename(input.name);
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`file-upload:${userId}:${id}`},0))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId + input.sha256 + name},0))`);
    const [existing] = await rows<PrivateFile>(sql`SELECT id,user_id,name,media_type,byte_size,sha256,created_at FROM hirelix_private_files
      WHERE user_id=${userId}::uuid AND sha256=${input.sha256} AND name=${name} AND upload_id IS NULL ORDER BY created_at LIMIT 1`, tx);
    if (existing && existing.byte_size !== input.size) throw new WorkspaceError("The declared file size does not match its content.", 409);
    const parts = await rows<{ upload_part: number; name: string; byte_size: number; encoded: string }>(sql`SELECT upload_part,name,byte_size,encode(bytes,'base64') encoded FROM hirelix_private_files
      WHERE user_id=${userId}::uuid AND upload_id=${id}::uuid ORDER BY upload_part`, tx);
    if (existing && !parts.length) return { file: resultFile(existing), received_parts: [] as number[] };
    const count = Math.ceil(input.size / UPLOAD_PART_BYTES);
    if (parts.some(part => part.name !== name || part.upload_part >= count || part.byte_size !== Math.min(UPLOAD_PART_BYTES, input.size - part.upload_part * UPLOAD_PART_BYTES)))
      throw new WorkspaceError("Uploaded parts do not match this file's name or size. Choose the original file again.", 409);
    if (parts.length !== count) return { file: existing ? resultFile(existing) : null, received_parts: parts.map(part => part.upload_part) };
    const bytes = Buffer.concat(parts.map(part => Buffer.from(part.encoded, "base64")));
    if (bytes.length !== input.size || createHash("sha256").update(bytes).digest("hex") !== input.sha256)
      throw new WorkspaceError("The uploaded file failed its integrity check. Choose the original file again.", 409);
    const saved = existing || await saveFile(userId, { name, type: input.type, bytes }, tx);
    await tx.execute(sql`DELETE FROM hirelix_private_files WHERE user_id=${userId}::uuid AND upload_id=${id}::uuid`);
    return { file: resultFile(saved), received_parts: [] as number[] };
  });
}
