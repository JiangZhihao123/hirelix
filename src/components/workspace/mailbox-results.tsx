"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Mail, Loader2, AlertCircle, ArrowUpRight } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import type { MailboxMessageView, MailboxProvider } from "@/lib/workspace/mailbox-contract";
import type { TurnPart } from "@/lib/workspace/turn-progress";
import { api, ApiError, date, ErrorNotice } from "./client";

type ToolPart = Extract<TurnPart, {type: "tool"}>;

function MailboxMessageCard({message, provider}: {message: MailboxMessageView; provider: MailboxProvider}) {
  const t = useT(), panelId = useId();
  const [opened, setOpened] = useState(message.body !== undefined);
  const [loaded, setLoaded] = useState(message);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [canRetry, setCanRetry] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function open() {
    setOpened(true);
    if (loaded.body !== undefined || loading) return;
    const controller = new AbortController();
    request.current?.abort(); request.current = controller;
    setLoading(true); setError("");
    try {
      const result = await api<{message: MailboxMessageView}>(`/mailboxes/messages?${new URLSearchParams({provider, message_id: message.id})}`, {signal: controller.signal});
      if (!controller.signal.aborted) setLoaded(result.message);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Could not load this email. Try again.");
        setCanRetry(!(cause instanceof ApiError) || cause.status >= 500 || cause.status === 429);
      }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }
  function back() {
    request.current?.abort(); setLoading(false); setError(""); setOpened(false);
  }
  const subject = loaded.subject || t("(No subject)");
  return <article className="ws-email-card ws-mail-message" aria-label={subject}>
    <header><Mail size={18} /><span>{provider === "google" ? "Gmail" : "Outlook"}</span>
      {loaded.date && <time suppressHydrationWarning dateTime={loaded.date}>{date(loaded.date, true)}</time>}
    </header>
    <button className="ws-mail-open" aria-expanded={opened} aria-controls={panelId} onClick={() => opened ? back() : void open()}>
      <strong>{subject}</strong><span>{t(opened ? "Back to email results" : "Open email")}</span>
    </button>
    <dl className="ws-email-envelope"><div><dt>{t("Sender email")}</dt><dd>{loaded.from || t("Not recorded")}</dd></div>
      {opened && <div><dt>{t("Recipient email")}</dt><dd>{loaded.to || t("Not recorded")}</dd></div>}
    </dl>
    {opened && <div id={panelId} className="ws-mail-content" aria-busy={loading}>
      {loading && <p role="status"><Loader2 size={15} className="animate-spin" />{t("Loading email…")}</p>}
      <ErrorNotice error={error} retry={canRetry ? () => void open() : undefined} />
      {error && !canRetry && <a className="ws-link" href="/app/settings?section=email">{t("Review email settings")}</a>}
      {loaded.body !== undefined && <>
        {(loaded.mailbox_folder || loaded.mailbox_labels?.length || loaded.is_draft) && <p className="ws-muted">{[loaded.mailbox_folder, ...(loaded.mailbox_labels || []), ...(loaded.is_draft ? [t("Draft")] : [])].filter(Boolean).join(" · ")}</p>}
        {(loaded.mailbox_labels?.includes("SENT") || loaded.mailbox_folder === "Sent Items") && <p className="ws-email-notice">{t("A sent copy does not confirm recipient delivery.")}</p>}
        <div className="ws-mail-text">{loaded.body || t("This email has no text body.")}</div>
        {loaded.truncated && <p className="ws-muted">{t("Only part of this email is shown. Open the original for the full message.")}</p>}
      </>}
      {loaded.source_url && <a className="ws-link" href={loaded.source_url} target="_blank" rel="noopener noreferrer">{t("Open original email")}<ArrowUpRight size={13} /></a>}
    </div>}
  </article>;
}

export function MailboxResults({part, running}: {part: ToolPart; running: boolean}) {
  const t = useT();
  const loading = part.status === "running" && running;
  const interrupted = part.status === "interrupted" || (part.status === "running" && !running);
  return <section className="ws-mail-results" aria-label={t("Mailbox results")}>
    <p className="ws-mail-results-status" role="status">{loading ? <Loader2 size={15} className="animate-spin" /> : part.status === "error" ? <AlertCircle size={15} /> : <Mail size={15} />}
      {t(loading ? (part.tool === "read_mail" ? "Loading email…" : "Searching your mailbox…") : part.status === "error" ? "Email request failed." : interrupted ? "Email request interrupted. Completed results are kept." : "Mailbox results")}
    </p>
    {part.status === "error" && part.mail_error && <ErrorNotice error={part.mail_error.message} />}
    {part.status === "error" && part.mail_error && [401,403,409].includes(part.mail_error.status) && <a className="ws-link" href="/app/settings?section=email">{t("Review email settings")}</a>}
    {part.mail?.messages.map(message => <MailboxMessageCard key={message.id} message={message} provider={part.mail!.provider} />)}
    {part.status === "done" && (part.mail ? !part.mail.messages.length && <p>{t("No matching emails found. Try a different sender, date or subject.")}</p> : <p>{t("This older result has no saved email cards. Ask the assistant to search again.")}</p>)}
    {part.mail?.more_available && <p className="ws-muted">{t("More matching emails are available. Narrow your search to find a specific message.")}</p>}
    {part.tool === "search_mail" && part.status === "done" && part.mail && <p className="ws-muted">{t("Search results may be incomplete. No match does not prove delivery or absence of a reply.")}</p>}
  </section>;
}
