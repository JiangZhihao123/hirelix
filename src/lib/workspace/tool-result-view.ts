import type { TurnPart } from "./turn-progress";
import type { MailboxMessageView, MailboxProvider, MailboxResultView } from "./mailbox-contract";

type ToolPart = Extract<TurnPart, {type: "tool"}>;
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : undefined;

function mailboxSource(value: unknown, provider: MailboxProvider) {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    const hosts = provider === "google" ? ["mail.google.com"] : ["outlook.office.com", "outlook.office365.com", "outlook.live.com"];
    if (url.protocol === "https:" && !url.username && !url.password && !url.port && hosts.includes(url.hostname)) return url.href;
  } catch { /* No usable provider source link. */ }
}

// Mail content is plain display text. Never forward raw headers, provider
// payloads or HTML into persisted turn parts or the message-reading response.
export function toolResultMailbox(name: string, result: Record<string, unknown>): MailboxResultView | undefined {
  if (!["search_mail", "read_mail"].includes(name) || !["google", "microsoft"].includes(String(result.provider))) return;
  const provider = result.provider as MailboxProvider;
  const entries = name === "read_mail" ? [result] : result.messages;
  if (!Array.isArray(entries)) return;
  const address = (value: unknown) => text(value) || text(object(object(value).emailAddress).address) || "";
  const messages: MailboxMessageView[] = entries.slice(0, 20).flatMap(value => {
    const item = object(value), id = text(item.id);
    if (!id || id.length > 2048) return [];
    const body = name === "read_mail" ? text(item.body) : undefined;
    const href = mailboxSource(item.source_url || item.webLink, provider);
    return [{
      id, subject: (text(item.subject) || "").slice(0, 1000), from: address(item.from).slice(0, 1000),
      to: (text(item.to) || (Array.isArray(item.toRecipients) ? item.toRecipients.map(address).join(", ") : "")).slice(0, 2000),
      date: (text(item.date) || text(item.receivedDateTime) || "").slice(0, 100),
      ...(body !== undefined ? {body: body.slice(0, 30000), truncated: item.truncated === true || body.length > 30000} : {}),
      ...(href ? {source_url: href} : {}),
      ...(typeof item.mailbox_folder === "string" ? {mailbox_folder: item.mailbox_folder.slice(0, 200)} : {}),
      ...(Array.isArray(item.mailbox_labels) ? {mailbox_labels: item.mailbox_labels.filter((label): label is string => typeof label === "string").slice(0, 30)} : {}),
      ...(typeof item.is_draft === "boolean" ? {is_draft: item.is_draft} : {}),
    }];
  });
  return {provider, messages, more_available: result.more_available === true || entries.length > 20};
}

export function toolResultMailboxError(name: string, output: {ok?: boolean; error?: {code?: unknown; message?: unknown}}): ToolPart["mail_error"] {
  if (!["search_mail", "read_mail"].includes(name) || output.ok !== false) return;
  const error = output.error;
  if (typeof error?.code === "number" && error.code >= 400 && error.code <= 599 && typeof error.message === "string") {
    return {status: error.code, message: error.message.slice(0, 2000)};
  }
}

// Only the fields needed to inspect a returned list reach the conversation UI.
// Full profiles, private notes, embeddings and tool inputs remain server-side.
export function toolResultList(name: string, result: Record<string, unknown>): ToolPart["list"] {
  const kind = ({list_roles: "roles", find_roles: "roles", list_candidates: "people", find_candidates: "people", list_reminders: "reminders"} as Record<string, string>)[name];
  if (!kind) return;
  const entries = result[kind] ?? (kind === "people" ? result.matches : undefined);
  if (!Array.isArray(entries)) return;
  return {
    returned: typeof result.returned === "number" ? result.returned : entries.length,
    ...(typeof result.total === "number" ? {total: result.total} : {}),
    has_more: result.has_more === true,
    items: entries.flatMap(value => {
      const entry = object(value), person = object(entry.person);
      const title = text(entry.title) || text(entry.name) || text(person.name);
      if (!title) return [];
      const href = text(entry.href) || text(entry.source_href);
      return [{title, detail: text(entry.client_name) || text(entry.headline) || text(person.headline),
        ...(href?.startsWith("/app/") ? {href} : {}),
      }];
    }),
  };
}
