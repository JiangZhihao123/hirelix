import { z } from "zod";

export const MAX_CONVERSATION_FILES = 20;
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
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
  if (!/\.(csv|pdf|docx|txt|md)$/i.test(name)) return "Use CSV, PDF, DOCX, TXT or Markdown files.";
  if (!size || size > MAX_ATTACHMENT_BYTES) return "Each file must be non-empty and up to 4 MB.";
  return null;
}
