import { api } from "./client";
import { DIRECT_UPLOAD_BYTES, UPLOAD_PART_BYTES } from "@/lib/workspace/attachments";

type UploadState = { file: { file_id: string; name: string; size: number } | null; received_parts: number[] };
export async function uploadAttachment(id: string, file: File) {
  if (file.size <= DIRECT_UPLOAD_BYTES) {
    const body = new FormData();
    body.append("file", file);
    const result = await api<{ file: NonNullable<UploadState["file"]> }>("/files", { method: "POST", body });
    return result.file;
  }
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const metadata = JSON.stringify({ name: file.name, type: file.type, size: file.size, sha256 });
  const endpoint = `/files/uploads/${id}`;
  const initial = await api<UploadState>(endpoint, { method: "POST", body: metadata });
  if (initial.file) return initial.file;
  const received = new Set(initial.received_parts);
  for (let index = 0; index < Math.ceil(file.size / UPLOAD_PART_BYTES); index++) {
    if (received.has(index)) continue;
    await api(`${endpoint}?part=${index}`, {
      method: "PUT", headers: { "Content-Type": "application/octet-stream", "X-Upload-Filename": encodeURIComponent(file.name) },
      body: file.slice(index * UPLOAD_PART_BYTES, (index + 1) * UPLOAD_PART_BYTES),
    });
  }
  const completed = await api<UploadState>(endpoint, { method: "POST", body: metadata });
  if (!completed.file) throw new Error("This upload is incomplete. Retry to continue from the received parts.");
  return completed.file;
}
