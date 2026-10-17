import { z } from "zod";
export const mailboxProvider = z.enum(["google", "microsoft"]);
export type MailboxProvider = z.infer<typeof mailboxProvider>;
export const mailboxScopes = {
  google: { send: "https://www.googleapis.com/auth/gmail.send", read: "https://www.googleapis.com/auth/gmail.readonly" },
  microsoft: { send: "Mail.Send", read: "Mail.Read" },
};
export function hasMailboxScope(scope: string | null | undefined, provider: MailboxProvider, capability: "read" | "send") {
  return (scope || "").split(/[ ,]+/).some(value => value === mailboxScopes[provider][capability] || (provider === "microsoft" && value === `https://graph.microsoft.com/${mailboxScopes[provider][capability]}`));
}
export type MailboxConnection = { provider: MailboxProvider; configured: boolean; connected: boolean; can_read: boolean; read_enabled: boolean; email: string | null; error?: string };
export const mailboxSearchInput = z.object({
  provider: mailboxProvider,
  query: z.string().trim().min(1).max(1000).describe("Gmail search syntax for google; Microsoft Graph message search syntax for microsoft. Narrow to the people, dates or subject needed by the user."),
  limit: z.number().int().min(1).max(20).default(10),
});
export const mailboxReadInput = z.object({ provider: mailboxProvider, message_id: z.string().min(1).max(2048) });
