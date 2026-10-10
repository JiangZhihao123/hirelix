"use client";
import { useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useLanguage, useT } from "@/components/LanguageProvider";
import { api, ErrorNotice, useQuery } from "./client";
import type { ConversationEmail as Email } from "@/lib/workspace/email-contract";

export function ConversationEmail({email, conversationId, messageId, onChanged}: {email?:Email;conversationId:string;messageId:string;onChanged:()=>void}) {
  const t = useT(), {locale} = useLanguage();
  const connection = useQuery<{connected:boolean;email:string|null}>("/gmail");
  const [busy,setBusy] = useState(false),[error,setError] = useState("");
  const key = useRef<string | null>(null);
  async function connect() {
    setBusy(true);setError("");
    try {
      const callbackURL = `/app?conversation=${encodeURIComponent(conversationId)}`;
      const result = await authClient.linkSocial({provider:"google",scopes:["https://www.googleapis.com/auth/gmail.send"],disableRedirect:true,callbackURL,errorCallbackURL:callbackURL});
      if(result.error || !result.data?.url) throw new Error(result.error?.message || "Could not connect Gmail");
      const url = new URL(result.data.url);url.searchParams.set("prompt","consent");window.location.assign(url.href);
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
      key.current = null;
      onChanged();window.dispatchEvent(new Event("hirelix:conversations-changed"));
    } catch(cause) {setError(cause instanceof Error ? cause.message : "Could not confirm this email");onChanged();}
    finally {setBusy(false);}
  }
  const status = email?.status;
  return <section className="ws-question-card" aria-label={t("Email confirmation")}>
    <strong>{t(email ? status === "review" ? "Confirm this email" : status === "sent" ? "Sent through Gmail" : status === "unknown" || status === "sending" ? "Check Gmail Sent before retrying" : status === "cancelled" ? "Email cancelled" : status === "superseded" ? "Email preview replaced" : "Email not sent" : "Gmail connection")}</strong>
    {!email && <p>{connection.loading ? t("Loading…") : connection.data?.connected ? `${t("Gmail connected")}: ${connection.data.email}` : t("Gmail is not connected")}</p>}
    {email && <>
      <p>{t("Sender email")}: {email.snapshot.from}<br />{t("Recipient email")}: <strong>{email.snapshot.to}</strong></p>
      <p><strong>{t("Email subject")}: {email.snapshot.title}</strong></p>
      <div style={{whiteSpace:"pre-wrap",maxHeight:"24rem",overflowY:"auto"}}>{email.snapshot.content}</div>
      <p>{t("Attachments")}: {email.snapshot.files.length ? email.snapshot.files.map(file=>file.name).join(", ") : t("No attachments")}</p>
      {email.error && <ErrorNotice error={email.error} />}
      {status === "review" && <footer>
        <button className="ws-button ws-button-primary" disabled={busy || !connection.data?.connected || connection.data.email !== email.snapshot.from} onClick={()=>void respond()}>{t(busy ? "Continuing…" : "Confirm and send email")}</button>
        <button className="ws-button" disabled={busy} onClick={()=>void respond(true)}>{t("Cancel email")}</button>
      </footer>}
    </>}
    {(!email || status === "review" || status === "failed") && !connection.loading && (!connection.data?.connected || status === "failed") && <button className="ws-button" disabled={busy} onClick={()=>void connect()}>{t("Connect Gmail")}</button>}
    <ErrorNotice error={error || connection.error} />
  </section>;
}
