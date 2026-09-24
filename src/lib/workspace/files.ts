import { createHash } from "node:crypto";
import path from "node:path";
import { sql } from "drizzle-orm";
import { zipSync, strToU8 } from "fflate";
import { db } from "@/db/client";
import { rows, WorkspaceError, type Runner } from "./database";
import { personDetails } from "./people";

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export type PrivateFile = {
  id: string;
  user_id: string;
  name: string;
  media_type: string;
  byte_size: number;
  sha256: string;
  created_at: string;
};
export async function saveFile(
  userId: string,
  file: { name: string; type: string; bytes: Uint8Array },
  tx: Runner = db,
) {
  if (!file.bytes.byteLength || file.bytes.byteLength > MAX_FILE_BYTES)
    throw new WorkspaceError("Upload a non-empty file up to 4 MB");
  const name = path.basename(file.name).slice(0, 250) || "document";
  const hash = createHash("sha256").update(file.bytes).digest("hex");
  const [saved] = await rows<PrivateFile>(
    sql`INSERT INTO hirelix_private_files(user_id,name,media_type,byte_size,sha256,bytes) VALUES(${userId}::uuid,${name},${file.type || "application/octet-stream"},${file.bytes.byteLength},${hash},decode(${Buffer.from(file.bytes).toString("base64")},'base64')) RETURNING id,user_id,name,media_type,byte_size,sha256,created_at`,
    tx,
  );
  return saved;
}
export async function readFile(userId: string, id: string) {
  const [file] = await rows<PrivateFile & { encoded: string }>(
    sql`SELECT id,user_id,name,media_type,byte_size,sha256,created_at,encode(bytes,'base64') AS encoded FROM hirelix_private_files WHERE id=${id}::uuid AND user_id=${userId}::uuid`,
  );
  if (!file) throw new WorkspaceError("This file was not found", 404);
  const { encoded, ...metadata } = file;
  return { ...metadata, bytes: Buffer.from(encoded, "base64") };
}
export function attachment(bytes: Uint8Array, name: string, type: string) {
  const fallback =
    name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 150) || "download";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name).replace(/'/g, "%27")}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function exportPerson(userId: string, id: string) {
  const details = await personDetails(userId, id);
  const versions = await rows(
    sql`SELECT entity_type,entity_id,version,snapshot,created_at FROM hirelix_private_versions WHERE user_id=${userId}::uuid AND ((entity_type='person' AND entity_id=${id}::uuid) OR (entity_type='record' AND entity_id IN(SELECT id FROM hirelix_private_records WHERE user_id=${userId}::uuid AND person_id=${id}::uuid))) ORDER BY created_at`,
  );
  const archive: Record<string, Uint8Array> = {
    "profile.json": strToU8(JSON.stringify(details, null, 2)),
    "history.json": strToU8(JSON.stringify(versions, null, 2)),
    "README.txt": strToU8(
      "Private candidate export. Contains your profile, notes, role associations, original files and available record versions. Review before sharing with anyone. Client documents and assistant conversations are separate historical work.",
    ),
  };
  const fileIds = [
    ...new Set(
      details.records
        .map((record) => record.file_id)
        .filter((id): id is string => !!id),
    ),
  ];
  for (const fileId of fileIds) {
    const file = await readFile(userId, fileId);
    archive[`sources/${fileId}/${file.name.replace(/[\\/]/g, "_")}`] =
      file.bytes;
  }
  return attachment(
    zipSync(archive),
    `${details.person.name}-candidate.zip`,
    "application/zip",
  );
}
