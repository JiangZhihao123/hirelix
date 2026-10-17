"use client";
import { Mail, Loader2, CheckCircle2, AlertCircle, Paperclip } from "lucide-react";
import { recipientAddressError } from "@/lib/workspace/email-contract";
import { useRef, useState } from "react";
import { connectGmail } from "./connect-gmail";
import { useLanguage, useT } from "@/components/LanguageProvider";
import { api, ErrorNotice, useQuery } from "./client";
import type { ConversationEmail as Email } from "@/lib/workspace/email-contract";

export function ConversationEmail({email, conversationId, messageId, onChanged}: {email?:Email;conversationId:string;messageId:string;onChanged:()=>void}) {
  const t = useT(), {locale} = useLanguage();
  const connection = useQuery<{connected:boolean;email:string|null}>("/gmail");
  const [submitted,setSubmitted] = useState(false);
  const [busy,setBusy] = useState(false),[error,setError] = useState("");
  const key = useRef<string | null>(null);
  async function connect() {
    setBusy(true);setError("");
    try {
      const callbackURL = `/app?conversation=${encodeURIComponent(conversationId)}`;
      await connectGmail(callbackURL);
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
    <header><Icon size={20} className={status === "sending" ? "animate-spin" : undefined} /><strong role="status" aria-live="polite">{t(title)}</strong></header>
    {!email && <p>{connection.loading ? t("Loading…") : connection.data?.connected ? `${t("Gmail connected")}: ${connection.data.email}` : t("Gmail is not connected")}</p>}
    {email && <>
      <dl className="ws-email-envelope"><div><dt>{t("Sender email")}</dt><dd>{email.snapshot.from}</dd></div><div><dt>{t("Recipient email")}</dt><dd><strong>{email.snapshot.to}</strong></dd></div></dl>
      {addressError && <div className="ws-email-notice" role="alert">{t(addressError)}</div>}
      {status === "sent" && <p className="ws-email-notice">{t("Gmail accepted this email. Recipient delivery is not confirmed. Hirelix cannot read bounce notices; check Gmail for delivery failures.")}</p>}
      {status === "unknown" && <p className="ws-email-notice" role="alert">{t("The sending result is unknown. Check Gmail Sent before retrying to avoid a duplicate email.")}</p>}
      {status === "sending" && <p className="ws-email-notice">{t("Waiting for Gmail confirmation. You can stay in this conversation; the result will appear here.")}</p>}
      <div className="ws-email-subject">{email.snapshot.title}</div>
      <details className="ws-email-body" open={status === "review"}><summary>{t("Email body")}</summary><div>{email.snapshot.content}</div></details>
      <div className="ws-email-attachments"><Paperclip size={15} /><span>{t("Attachments")}: {email.snapshot.files.length ? email.snapshot.files.map(file=>file.name).join(", ") : t("No attachments")}</span></div>
      {email.error && <ErrorNotice error={t(email.error)} />}
      {(status === "review" || status === "failed") && <p className="ws-email-help">{t("To change the recipient or message, tell the assistant in this conversation. Review the updated card before sending.")}</p>}
      {status === "review" && <footer>
        <button className="ws-button ws-button-primary" disabled={busy || !!addressError || !connection.data?.connected || connection.data.email !== email.snapshot.from} onClick={()=>void respond()}>{t(busy ? "Continuing…" : "Confirm and send email")}</button>
        <button className="ws-button" disabled={busy} onClick={()=>void respond(true)}>{t("Cancel email")}</button>
      </footer>}
      {email.receipt && <div className="ws-email-receipt">{t("Send receipt")}: {email.receipt}</div>}
      {(status === "sent" || status === "unknown") && <a className="ws-link" href={`https://mail.google.com/mail/?authuser=${encodeURIComponent(email.snapshot.from)}#sent`} target="_blank" rel="noopener noreferrer">{t("Open Gmail Sent")}</a>}
    </>}
    {(!email || status === "review" || status === "failed") && !connection.loading && !connection.data?.connected && <button className="ws-button" disabled={busy} onClick={()=>void connect()}>{t("Connect Gmail")}</button>}
    <ErrorNotice error={error || connection.error} />
  </section>;
}
