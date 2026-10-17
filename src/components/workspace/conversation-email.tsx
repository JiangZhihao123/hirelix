"use client";
import { Mail, Loader2, CheckCircle2, AlertCircle, Paperclip } from "lucide-react";
import { recipientAddressError } from "@/lib/workspace/email-contract";
import { useRef, useState } from "react";
import { connectMailbox, MailboxConnections } from "./mailbox-connections";
import type { MailboxConnection } from "@/lib/workspace/mailbox-contract";
import { useLanguage, useT } from "@/components/LanguageProvider";
import { api, ErrorNotice, useQuery } from "./client";
import type { ConversationEmail as Email } from "@/lib/workspace/email-contract";

export function ConversationEmail({email, conversationId, messageId, onChanged}: {email?:Email;conversationId:string;messageId:string;onChanged:()=>void}) {
  const t = useT(), {locale} = useLanguage();
  const mailboxes = useQuery<{connections:MailboxConnection[]}>("/mailboxes");
  const provider = email?.snapshot.provider || "google";
  const providerName = provider === "microsoft" ? "Microsoft" : "Gmail";
  const connection = {...mailboxes,data:mailboxes.data?.connections.find(c=>c.provider===provider)};
  const [bodyOpen,setBodyOpen] = useState(email?.status === "review");
  const [submitted,setSubmitted] = useState(false);
  const [busy,setBusy] = useState(false),[error,setError] = useState("");
  const key = useRef<string | null>(null);
  async function connect() {
    setBusy(true);setError("");
    try {
      const callbackURL = `/app?conversation=${encodeURIComponent(conversationId)}`;
      await connectMailbox(provider,false,callbackURL);
    } catch(cause) {setError(cause instanceof Error ? cause.message : "Could not connect Gmail");setBusy(false);}
  }
  async function respond(cancel = false) {
    if(busy)return;
    setBusy(true);setError("");
    try {
      if(cancel) await api(`/conversations/${conversationId}/emails/${messageId}`,{method:"DELETE"});
      else {
        key.current ||= crypto.randomUUID();
        await api("/conversations",{method:"POST",body:JSON.stringify({conversation_id:conversationId,email_confirmation_message_id:messageId,message:locale === "zh" ? "确认发送上面预览的邮件，收件人、正文和附件不变。" : "Confirm send of the email shown above, with the same recipient, message and attachments.",request_key:key.current,locale,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone})});
      }
      if (!cancel) setSubmitted(true);
      key.current = null;
      onChanged();window.dispatchEvent(new Event("hirelix:conversations-changed"));
    } catch(cause) {setError(cause instanceof Error ? cause.message : "Could not confirm this email");onChanged();}
    finally {setBusy(false);}
  }
  const status = submitted && email?.status === "review" ? "sending" : email?.status;
  const addressError = email ? recipientAddressError(email.snapshot.to) : null;
  const title = !email ? "Gmail connection" : status === "review" ? "Review email" : status === "sent" ? "Accepted by Gmail" : status === "sending" ? "Sending email…" : status === "unknown" ? "Sending result unknown" : status === "cancelled" ? "Email cancelled" : status === "superseded" ? "Email preview replaced" : "Email not sent";
  const Icon = status === "sending" ? Loader2 : addressError || status === "failed" || status === "unknown" ? AlertCircle : status === "sent" ? CheckCircle2 : Mail;
  return <section className="ws-email-card" data-status={addressError ? "failed" : status} aria-label={t("Email confirmation")}>
    <header><Icon size={20} className={status === "sending" ? "animate-spin" : undefined} /><strong role="status" aria-live="polite">{t(title).replaceAll("Gmail",providerName)}</strong></header>
    {!email && <MailboxConnections callbackURL={`/app?conversation=${encodeURIComponent(conversationId)}`} />}

    {email && <>
      <dl className="ws-email-envelope"><div><dt>{t("Sender email")}</dt><dd>{email.snapshot.from}</dd></div><div><dt>{t("Recipient email")}</dt><dd><strong>{email.snapshot.to}</strong></dd></div></dl>
      {addressError && <div className="ws-email-notice" role="alert">{t(addressError)}</div>}
      {status === "sent" && <p className="ws-email-notice">{(locale === "zh" ? `${providerName} 已接受邮件，但尚未确认收件人收到。可在邮箱查看退信；授权读取后，也可以让助理检查。` : `${providerName} accepted this email. Recipient delivery is not confirmed. Check your mailbox for failures, or ask the assistant when reading is connected.`)}</p>}
      {status === "unknown" && <p className="ws-email-notice" role="alert">{t("The sending result is unknown. Check Gmail Sent before retrying to avoid a duplicate email.").replaceAll("Gmail",providerName)}</p>}
      {status === "sending" && <p className="ws-email-notice">{t("Waiting for Gmail confirmation. You can stay in this conversation; the result will appear here.").replaceAll("Gmail",providerName)}</p>}
      <div className="ws-email-subject">{email.snapshot.title}</div>
      <details className="ws-email-body" open={bodyOpen} onToggle={event=>setBodyOpen(event.currentTarget.open)}><summary>{t("Email body")}</summary><div>{email.snapshot.content}</div></details>
      <div className="ws-email-attachments"><Paperclip size={15} /><span>{t("Attachments")}: {email.snapshot.files.length ? email.snapshot.files.map(file=>file.name).join(", ") : t("No attachments")}</span></div>
      {email.error && <ErrorNotice error={t(email.error)} />}
      {(status === "review" || status === "failed") && <p className="ws-email-help">{t("To change the recipient or message, tell the assistant in this conversation. Review the updated card before sending.")}</p>}
      {status === "review" && <footer>
        <button className="ws-button ws-button-primary" disabled={busy || !!addressError || !connection.data?.connected || connection.data.email !== email.snapshot.from} onClick={()=>void respond()}>{t(busy ? "Continuing…" : "Confirm and send email")}</button>
        <button className="ws-button" disabled={busy} onClick={()=>void respond(true)}>{t("Cancel email")}</button>
      </footer>}
      {email.receipt && <div className="ws-email-receipt">{t("Send receipt")}: {email.receipt}</div>}
      {(status === "sent" || status === "unknown") && <a className="ws-link" href={`${provider === "microsoft" ? "https://outlook.office.com/mail/sentitems" : `https://mail.google.com/mail/?authuser=${encodeURIComponent(email.snapshot.from)}#sent`}`} target="_blank" rel="noopener noreferrer">{provider === "microsoft" ? "Open Outlook Sent" : t("Open Gmail Sent")}</a>}
    </>}
    {(!email || status === "review" || status === "failed") && !!email && !connection.loading && !connection.data?.connected && <button className="ws-button" disabled={busy} onClick={()=>void connect()}>{provider === "microsoft" ? "Connect Outlook" : t("Connect Gmail")}</button>}
    <ErrorNotice error={error || connection.error} />
  </section>;
}
