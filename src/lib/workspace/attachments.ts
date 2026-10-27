import { z } from "zod";

export const MAX_CONVERSATION_FILES = 20;
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
export const UPLOAD_PART_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_PARTS = Math.ceil(MAX_ATTACHMENT_BYTES / UPLOAD_PART_BYTES);
export const DIRECT_UPLOAD_BYTES = 4 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.pptx,.csv,.tsv,.txt,.md,.json,.html,.xml,.zip";
export function attachmentPreviewType(name: string, mediaType?: string | null): string | null {
  const extension = name.split(".").pop()?.toLowerCase();
  const known = ({jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf"} as Record<string, string>)[extension || ""];
  // Imported platform archives can omit the filename extension. Their PDF
  // MIME type is set after checking the original file signature.
  return known || (!name.includes(".") && mediaType === "application/pdf" ? "application/pdf" : null);
}
export const attachmentSchema = z.object({
  file_id: z.uuid(), name: z.string(), size: z.number(),
});
export type ConversationAttachment = z.infer<typeof attachmentSchema>;
export function messageAttachments(metadata: Record<string, unknown>): ConversationAttachment[] {
  const values = Array.isArray(metadata.attachments)
    ? metadata.attachments : metadata.attachment ? [metadata.attachment] : [];
  return values.flatMap((value) => {
    const parsed = attachmentSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
}
export function messageImportJobs(metadata: Record<string, unknown>): string[] {
  const values = Array.isArray(metadata.import_job_ids)
    ? metadata.import_job_ids : [metadata.import_job_id];
  return [...new Set(values.filter((value): value is string => typeof value === "string" && z.uuid().safeParse(value).success))];
}
export function attachmentError(name: string, size: number): string | null {
  const extension = "." + (name.split(".").pop()?.toLowerCase() || "");
  if (!ATTACHMENT_ACCEPT.split(",").includes(extension)) return "Use images, PDF, DOCX, XLSX, PPTX, CSV, TSV, text files or candidate ZIP archives";
  if (!size || size > MAX_ATTACHMENT_BYTES) return "Each file must be non-empty and up to 50 MB.";
  return null;
}
