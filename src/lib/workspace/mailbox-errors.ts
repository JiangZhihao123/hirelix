import type { MailboxProvider } from "./mailbox-contract";

// Only expose our own explanations, never provider response bodies or account details.
export const microsoftSuspendedMessage = "Microsoft has suspended this mailbox. Open Outlook and complete Microsoft's account verification before trying again. Reconnecting Hirelix alone will not remove the suspension.";

export function mailboxProviderError(provider: MailboxProvider, status: number, body: unknown) {
  const code = body && typeof body === "object" && "error" in body
    ? (body as { error?: { code?: unknown } }).error?.code : undefined;
  if (provider === "microsoft" && code === "ErrorAccountSuspend")
    return { message: microsoftSuspendedMessage, reconnect: false };
  if (status === 401) return { message: "Mailbox authorization has expired. Reconnect this mailbox to renew access.", reconnect: true };
  if (status === 403) return { message: "The email provider denied access. Check mailbox permissions and account restrictions with your provider; reconnect only if permission needs to be granted again.", reconnect: false };
  if (status === 429) return { message: "The email provider is temporarily rate limiting requests. Please try later.", reconnect: false };
  return { message: "The email provider could not complete this request. Check the recipient and attachments before trying again.", reconnect: false };
}
