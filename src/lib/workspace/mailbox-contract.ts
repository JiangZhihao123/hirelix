import { z } from "zod";
export const mailboxProvider = z.enum(["google", "microsoft"]);
export type MailboxProvider = z.infer<typeof mailboxProvider>;
export function mailboxCallbackURLs(path: string, origin: string, provider: MailboxProvider) {
  const success = new URL(path, origin);
  if (success.origin !== origin) throw new Error("Return to Hirelix after connecting your mailbox.");
  success.searchParams.delete("error");
  success.searchParams.delete("error_description");
  success.searchParams.delete("mailbox_connected");
  const failure = new URL(success);
  // better-auth appends error parameters as text, so a fragment would swallow them.
  failure.hash = "";
  failure.searchParams.set("mailbox_return", "1");
  success.searchParams.set("mailbox_connected", provider);
  return { callbackURL: success.href, errorCallbackURL: failure.href };
}
export const mailboxScopes = {
  google: { send: "https://www.googleapis.com/auth/gmail.send", read: "https://www.googleapis.com/auth/gmail.readonly" },
  microsoft: { send: "Mail.Send", read: "Mail.Read" },
};
export function hasMailboxScope(scope: string | null | undefined, provider: MailboxProvider, capability: "read" | "send") {
  return (scope || "").split(/[ ,]+/).some(value => value === mailboxScopes[provider][capability] || (provider === "microsoft" && value === `https://graph.microsoft.com/${mailboxScopes[provider][capability]}`));
}
export function mailboxReadUnavailableReason(provider: MailboxProvider) {
  return provider === "google"
    ? "Gmail reading is awaiting Google review and is not yet available. Sending remains available. To analyze incoming mail, paste the email content into the conversation or upload the email exported as a PDF or text file."
    : "Microsoft mailbox reading is not available yet. To analyze incoming mail, paste the email content into the conversation or upload the email exported as a PDF or text file.";
}
export type MailboxConnection = { provider: MailboxProvider; configured: boolean; connected: boolean; can_read: boolean; read_enabled: boolean; read_unavailable_reason?: string; email: string | null; error?: string; needs_reconnect?: boolean; granted_read?: boolean };
export const mailboxSearchInput = z.object({
  provider: mailboxProvider,
  query: z.string().trim().min(1).max(1000).describe("Gmail search syntax for google; Microsoft Graph message search syntax for microsoft. Narrow to the people, dates or subject needed by the user."),
  limit: z.number().int().min(1).max(20).default(10),
});
export const mailboxReadInput = z.object({ provider: mailboxProvider, message_id: z.string().min(1).max(2048) });

export type MailboxSettings = { connections: MailboxConnection[]; default_provider: MailboxProvider | null };

export type MailboxMessageView = {
  id: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body?: string;
  truncated?: boolean;
  source_url?: string;
  mailbox_folder?: string;
  mailbox_labels?: string[];
  is_draft?: boolean;
};
export type MailboxResultView = { provider: MailboxProvider; messages: MailboxMessageView[]; more_available: boolean };

// OAuth return authorizes preparation only, never delivery or other business mutations.
export function mailboxResumeAllowsTool(name: string, input: unknown) {
  if (name === "email") return ["status", "prepare", "none"].includes((input as {intent?:string})?.intent || "");
  return ["web_search", "read_skill", "list_candidates", "list_roles", "find_candidates", "find_roles", "read_candidate", "read_role", "read_record", "read_document", "read_file", "find_conversations", "read_conversation", "mailbox_status", "ask_user"].includes(name);
}
