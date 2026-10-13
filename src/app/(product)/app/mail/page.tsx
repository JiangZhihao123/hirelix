"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Mail } from "lucide-react";
import { useLanguage, useT } from "@/components/LanguageProvider";
import { useQuery, ErrorNotice, Loading, date } from "@/components/workspace/client";
import type { mailboxActivity } from "@/lib/workspace/gmail";
export default function Mailbox() {
  const t = useT(), { locale } = useLanguage();
  const connection = useQuery<{ connected: boolean; email: string | null }>("/gmail");
  const params = useSearchParams();
  const roleId = params.get("role");
  const documentId = params.get("document");
  const filters = new URLSearchParams();
  if (roleId) filters.set("role", roleId);
  if (documentId) filters.set("document", documentId);
  const activity = useQuery<{ emails: Awaited<ReturnType<typeof mailboxActivity>> }>(`/gmail/activity?${filters}`);
  const emails = activity.data?.emails;
  const refresh = activity.refresh;
  const sending = activity.data?.emails.some(email => email.status === "sending");
  useEffect(() => {
    if (!sending) return;
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [sending, refresh]);
  return <div className="ws-page">
    <header className="ws-page-header"><div><h1>{t("Email activity")}</h1><p>{t("Only emails sent through Hirelix appear here. Inbox reading and reply syncing are not connected.")}</p></div></header>
    {roleId && <Link className="ws-link" href={`/app/roles/${roleId}`}>{t("Role")} ↗</Link>}
    {documentId && <Link className="ws-link" href={`/app/submissions/${documentId}`}>{t("Open recommendation")} ↗</Link>}
    <section className="ws-question-card">
      <strong><Mail size={16} /> {t("Sending connection")}</strong>
      <ErrorNotice error={connection.error} retry={connection.refresh} />
      {connection.loading && !connection.data ? <Loading /> : connection.data && <p>{t(connection.data.connected ? "Gmail connected" : "Gmail is not connected")}{connection.data.email ? ` · ${connection.data.email}` : ""}</p>}
      <Link className="ws-button" href={`/app?${roleId ? `role=${encodeURIComponent(roleId)}&` : ""}${documentId ? `document=${encodeURIComponent(documentId)}&` : ""}prompt=${encodeURIComponent(locale === "zh" ? "检查我的 Gmail 发信连接状态，未连接则提供连接入口。不要发送邮件。" : "Check my Gmail sending connection and offer a connection link if needed. Do not send an email.")}`}>{t("Manage Gmail connection")}</Link>
    </section>
    <h2>{t("Email activity")}</h2>
    <ErrorNotice error={activity.error} retry={activity.refresh} />
    {activity.loading && !activity.data ? <Loading /> : activity.data && !emails?.length ? <p className="ws-muted">{t("No emails sent through Hirelix yet.")}</p> : emails?.map(email => <details className="ws-mail-record" key={email.id}>
      <summary><strong>{email.subject}</strong><span>{t(email.status === "sent" ? "Sent through Gmail" : email.status === "unknown" ? "Delivery uncertain" : email.status === "sending" ? "Sending" : "Failed")}</span></summary>
      <p className="ws-muted">{email.recipient} · {date(email.created_at, true)}</p>
      {email.role_id && <Link className="ws-link" href={`/app/roles/${email.role_id}`}>{email.client_name} · {email.role_title}</Link>}
      <p>{email.content}</p>
      {email.error && <ErrorNotice error={email.error} />}
      {email.status === "unknown" && <p>{t("Check Gmail Sent before retrying")}</p>}
      {email.deliverable_id && <Link className="ws-link" href={`/app/submissions/${email.deliverable_id}`}>{t("Open recommendation")} ↗</Link>}
    </details>)}
  </div>;
}
