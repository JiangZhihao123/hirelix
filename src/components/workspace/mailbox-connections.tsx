"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { authClient } from "@/lib/auth-client";
import { mailboxCallbackURLs, mailboxScopes, type MailboxProvider, type MailboxSettings } from "@/lib/workspace/mailbox-contract";
import { api, useQuery, ErrorNotice } from "./client";

export async function connectMailbox(provider: MailboxProvider, read: boolean, callbackURL: string) {
  const callbacks = mailboxCallbackURLs(callbackURL, window.location.origin, provider);
  const scopes = [mailboxScopes[provider].send, ...(read ? [mailboxScopes[provider].read] : []), ...(provider === "microsoft" ? ["User.Read", "offline_access"] : [])];
  const result = await authClient.linkSocial({ provider, scopes, disableRedirect: true, ...callbacks });
  if (result.error || !result.data?.url) throw new Error(result.error?.message || "Could not connect this mailbox.");
  const url = new URL(result.data.url);
  url.searchParams.set("prompt", "consent");
  window.location.assign(url.href);
}

export function MailboxReturnNotice({connections, loading}: {connections: MailboxSettings["connections"] | undefined; loading:boolean}) {
  const params = useSearchParams(), {locale} = useLanguage(), zh = locale === "zh";
  const notice = useRef<HTMLParagraphElement>(null), positioned = useRef(false);
  const returned = !!params.get("mailbox_connected") || params.get("mailbox_return") === "1";
  useEffect(() => {
    if (returned && !loading && notice.current && !positioned.current) {
      notice.current.scrollIntoView({ block: "center" });
      positioned.current = true;
    }
  }, [returned, loading]);
  if (params.get("error")) return <p ref={notice} className="ws-email-notice" role="alert">{zh ? "连接未完成。之前的内容仍保留，可以重试或继续工作。" : "Connection was not completed. Your work is preserved; retry or continue working."}</p>;
  const provider = params.get("mailbox_connected");
  if (!provider) return null;
  const connection = connections?.find(c => c.provider === provider);
  return <p ref={notice} className="ws-email-notice" role="status">{loading ? (zh ? "正在确认邮箱连接…" : "Checking mailbox connection…") : connection?.connected ? (zh ? `已连接 ${connection.email}。可以继续当前工作，连接操作没有发送邮件。` : `Connected as ${connection.email}. Continue your work; connecting did not send an email.`) : (zh ? "尚未确认邮箱连接，请检查下方状态或重试。" : "Mailbox connection is not confirmed. Check the status below or retry.")}</p>;
}

export function MailboxConnections({ callbackURL = "/app/settings?section=email", oauthError, compact = false, preferredProvider = "google", onConnect }: { callbackURL?: string; oauthError?: string | null; compact?: boolean; preferredProvider?: MailboxProvider; onConnect?: (provider: MailboxProvider) => Promise<void> }) {
  const { locale } = useLanguage(), zh = locale === "zh";
  const query = useQuery<MailboxSettings>("/mailboxes");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [manage, setManage] = useState<MailboxProvider | null>(null);
  const [disconnect, setDisconnect] = useState<MailboxProvider | null>(null);
  const [showOther, setShowOther] = useState(false);
  const [notice, setNotice] = useState("");
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await action(); query.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update mailbox"); }
    finally { setBusy(false); }
  }
  return <section className={compact ? "ws-mailbox-compact" : "ws-mailbox-settings"} aria-label={zh ? "邮箱连接" : "Email connections"}>
    {!compact && <header><h2>{zh ? "邮箱" : "Email"}</h2><p>{zh ? "连接你的工作邮箱，用它发送推荐，并按需让助理查阅邮件。" : "Connect your work mailbox to send recommendations and let your assistant read mail when needed."}</p></header>}
    {compact && <p className="ws-muted">{zh ? "以下是当前连接状态。连接后可回到这段对话继续准备邮件。" : "Live connection status. Return to this conversation after connecting to continue preparing your email."}</p>}
    <MailboxReturnNotice connections={query.data?.connections} loading={query.loading} />
    {query.loading && <p role="status">{zh ? "正在检查邮箱…" : "Checking mailboxes…"}</p>}
    {query.data?.connections.filter(c => !compact || showOther || c.provider === preferredProvider).map(c => <article key={c.provider} className="ws-mailbox-account">
      <div className="ws-mailbox-heading"><div><strong>{c.email || (c.provider === "google" ? "Gmail / Google Workspace" : "Outlook / Microsoft 365")}</strong><p className="ws-muted">{c.error ? (zh ? "连接需要检查" : "Connection needs attention") : c.connected ? (c.can_read ? (zh ? "可发送 · 可按需读取" : "Sending enabled · Reading enabled") : (!c.read_enabled ? (zh ? "可发送 · 读取暂未开放" : "Sending enabled · Reading unavailable") : (zh ? "可发送 · 未开启读取" : "Sending enabled · Reading off"))) : (zh ? "尚未连接发信权限" : "Not connected for sending")}{query.data?.default_provider === c.provider && ` · ${zh ? "默认发件人" : "Default sender"}`}</p></div>
        {c.connected && !compact && <button className="ws-link" aria-expanded={manage === c.provider} onClick={() => { setManage(manage === c.provider ? null : c.provider); setDisconnect(null); }}>{zh ? "管理" : "Manage"}</button>}
      </div>
      {!c.configured ? <p>{zh ? "此服务暂未配置完成。" : "This provider is not configured yet."}</p> : <div className="ws-actions">
        {!c.connected && <button className="ws-button ws-button-primary" disabled={busy || query.loading} onClick={() => c.error && !c.needs_reconnect ? query.refresh() : void run(() => onConnect ? onConnect(c.provider) : connectMailbox(c.provider, !!c.granted_read && c.read_enabled, callbackURL))}>{c.error && !c.needs_reconnect ? (zh ? "重新检查连接" : "Check connection again") : c.needs_reconnect ? (zh ? "重新连接邮箱" : "Reconnect mailbox") : (zh ? "连接邮箱" : "Connect mailbox")}</button>}
        {!compact && manage === c.provider && c.connected && query.data?.default_provider !== c.provider && <button className="ws-button" disabled={busy} onClick={() => void run(async () => { await api("/mailboxes", { method: "PATCH", body: JSON.stringify({ provider: c.provider }) }); setNotice(zh ? "已更新默认发件人。单封邮件仍可选择其他邮箱。" : "Default sender updated. You can still choose another mailbox for an individual email."); })}>{zh ? "设为默认发件人" : "Use as default sender"}</button>}
      </div>}
      {(manage === c.provider || !c.connected) && !compact && <div className="ws-mailbox-details">
        {!c.connected && <p>{zh ? "连接首先申请发送权限。每封邮件发送前仍需你的明确确认。" : "Connecting requests sending permission. Each email still needs your explicit confirmation before sending."}</p>}
        {c.connected && !c.can_read && c.read_enabled && <><p>{zh ? "可选：按你的要求检索邮件，相关内容会交给 AI 处理，摘要可能保留在对话中。不会自动同步整个邮箱。" : "Optional: search mail for your requests. Relevant content is processed by AI, and summaries may remain in conversations. Your entire mailbox is not automatically synced."}</p><button className="ws-button" disabled={busy} onClick={() => void run(() => connectMailbox(c.provider, true, callbackURL))}>{zh ? "开启读取与 AI 分析" : "Enable reading and AI analysis"}</button></>}
        {(c.email || c.error) && <div><button className="ws-link" onClick={() => setDisconnect(disconnect === c.provider ? null : c.provider)}>{zh ? "断开邮箱…" : "Disconnect mailbox…"}</button>{disconnect === c.provider && <div className="ws-email-notice"><p>{zh ? "断开后，助理无法通过此邮箱发送或读取邮件。已保存的对话、推荐及发送记录会保留。" : "Disconnecting stops sending and reading through this mailbox. Saved conversations, recommendations and delivery records remain."}</p><button className="ws-button" disabled={busy} onClick={() => void run(async () => { await api(`/mailboxes?provider=${c.provider}`, { method: "DELETE" }); setDisconnect(null); setManage(null); })}>{zh ? "确认断开" : "Confirm disconnect"}</button><button className="ws-link" onClick={() => setDisconnect(null)}>{zh ? "取消" : "Cancel"}</button></div>}</div>}
      </div>}
      {c.error && <ErrorNotice error={c.error} />}
      {c.error && !c.needs_reconnect && !compact && <button className="ws-link" disabled={busy} onClick={() => void run(() => connectMailbox(c.provider, !!c.granted_read && c.read_enabled, callbackURL))}>{zh ? "仍有问题？重新连接邮箱" : "Still having trouble? Reconnect mailbox"}</button>}
    </article>)}
    {compact && <button className="ws-link" onClick={() => setShowOther(!showOther)}>{zh ? (showOther ? "收起其他邮箱" : "选择其他邮箱") : (showOther ? "Hide other mailboxes" : "Choose another mailbox")}</button>}
    {notice && <p role="status">{notice}</p>}
    <ErrorNotice error={error || query.error || (oauthError ? (zh ? "邮箱连接未完成，之前的内容仍保留。可以重试或继续工作。" : "Mailbox connection was not completed. Your work is preserved. Retry or continue working.") : "")} retry={query.error ? query.refresh : undefined} />
    <p className="ws-muted"><a className="ws-link" href={compact ? "/app/settings?section=email" : "/privacy"}>{compact ? (zh ? "管理邮箱与默认发件人" : "Manage email and default sender") : (zh ? "邮箱数据使用说明" : "How mailbox data is used")}</a></p>
  </section>;
}
