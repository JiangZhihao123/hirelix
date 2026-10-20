"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useLanguage, useT } from "@/components/LanguageProvider";
import { Mail, Mails, Check, CircleAlert } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { microsoftSuspendedMessage } from "@/lib/workspace/mailbox-errors";
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
  const t = useT();
  const mailboxId = useId();
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
    {!compact && <header><h2>{zh ? "连接工作邮箱" : "Connect your work mailbox"}</h2><p>{zh ? "让助理帮你处理邮件。" : "Let your assistant help with email."}</p></header>}
    {compact && <p className="ws-muted">{zh ? "连接邮箱后，继续准备这封邮件。" : "Connect your mailbox to continue preparing this email."}</p>}
    <MailboxReturnNotice connections={query.data?.connections} loading={query.loading} />
    {query.loading && <p role="status">{zh ? "正在检查邮箱…" : "Checking mailboxes…"}</p>}
    {query.data?.connections.filter(c => !compact || showOther || c.provider === preferredProvider).map(c => {
      const name = c.provider === "google" ? "Gmail" : "Outlook";
      const temporaryError = ["The email provider could not be reached. Please try again.", "Could not verify mailbox access. Try again; reconnect if the problem persists."].includes(c.error || "");
      const connectionError = c.error === microsoftSuspendedMessage
        ? (zh ? "此邮箱已被 Microsoft 暂停，请前往 Outlook 验证账户。" : "Microsoft has suspended this mailbox. Verify your account in Outlook.")
        : c.needs_reconnect ? (zh ? "请重新连接邮箱以恢复访问。" : "Reconnect your mailbox to restore access.")
        : temporaryError ? (zh ? `暂时无法确认 ${name} 的连接，请重试。` : `Could not verify the ${name} connection. Please retry.`)
        : c.error ? t(c.error) : "";
      return <article key={c.provider} className="ws-mailbox-account" aria-label={name}>
      <div className="ws-mailbox-row">
        <div className="ws-mailbox-icon">{c.provider === "google" ? <Mail size={19} aria-hidden="true" /> : <Mails size={19} aria-hidden="true" />}</div>
        <div className="ws-mailbox-info">
          <div className="ws-mailbox-title"><strong>{name}</strong>
            <span className="ws-mailbox-status" data-state={c.error ? "error" : c.configured && c.connected ? "connected" : "disconnected"}>
              {c.error ? <CircleAlert size={12} aria-hidden="true" /> : c.configured && c.connected ? <Check size={12} aria-hidden="true" /> : null}
              {!c.configured ? (zh ? "暂不可用" : "Unavailable") : c.error ? (zh ? "连接异常" : "Connection issue") : c.connected ? (zh ? "已连接" : "Connected") : (zh ? "未连接" : "Not connected")}
            </span>
          </div>
          {c.email && <p className="ws-mailbox-address">{c.email}{query.data?.default_provider === c.provider && ` · ${zh ? "默认发件人" : "Default sender"}`}</p>}
          <p className="ws-mailbox-capabilities"><span><Check size={14} aria-hidden="true" />{c.read_enabled ? (zh ? "支持读取和发送" : "Supports reading and sending") : (zh ? "支持发送" : "Supports sending")}</span>{!c.read_enabled && <span>· {zh ? "暂不支持读取" : "Reading not supported yet"}</span>}</p>
          {c.connected && c.read_enabled && !c.can_read && <p className="ws-mailbox-address">{zh ? "尚未授权读取" : "Reading permission not granted"}</p>}
          {connectionError && <p className="ws-mailbox-error" role="alert"><CircleAlert size={15} aria-hidden="true" /><span>{connectionError}</span></p>}
          {!c.configured && <p className="ws-mailbox-address">{zh ? "此服务暂未配置完成。" : "This provider is not configured yet."}</p>}
        </div>
        <div className="ws-mailbox-actions">
          {c.error === microsoftSuspendedMessage ? <a className="ws-button ws-button-primary" href="https://outlook.live.com/mail/" target="_blank" rel="noopener noreferrer">{zh ? "验证账户" : "Verify account"}</a>
            : c.configured && (!c.connected || c.error) ? <button className="ws-button ws-button-primary" disabled={busy || query.loading} onClick={() => c.error && !c.needs_reconnect ? query.refresh() : void run(() => onConnect ? onConnect(c.provider) : connectMailbox(c.provider, !!c.granted_read && c.read_enabled, callbackURL))}>{c.error && !c.needs_reconnect ? (zh ? "重试连接" : "Retry connection") : c.needs_reconnect ? (zh ? "重新连接" : "Reconnect") : (zh ? "连接邮箱" : "Connect mailbox")}</button> : null}
          {!compact && (c.connected || c.email || c.error) && <button className={c.connected && !c.error ? "ws-button" : "ws-link"} aria-expanded={manage === c.provider} aria-controls={`${mailboxId}-${c.provider}`} onClick={() => { setManage(manage === c.provider ? null : c.provider); setDisconnect(null); }}>{c.connected && !c.error ? (zh ? "管理" : "Manage") : (zh ? "更多选项" : "More options")}</button>}
        </div>
      </div>
      <div id={`${mailboxId}-${c.provider}`} className="ws-mailbox-details" hidden={manage !== c.provider || compact}>
        {!compact && manage === c.provider && c.connected && query.data?.default_provider !== c.provider && <button className="ws-button" disabled={busy} onClick={() => void run(async () => { await api("/mailboxes", { method: "PATCH", body: JSON.stringify({ provider: c.provider }) }); setNotice(zh ? "已更新默认发件人。单封邮件仍可选择其他邮箱。" : "Default sender updated. You can still choose another mailbox for an individual email."); })}>{zh ? "设为默认发件人" : "Use as default sender"}</button>}
        {c.connected && !c.can_read && c.read_enabled && <><p>{zh ? "可选：按你的要求检索邮件，相关内容会交给 AI 处理，摘要可能保留在对话中。不会自动同步整个邮箱。" : "Optional: search mail for your requests. Relevant content is processed by AI, and summaries may remain in conversations. Your entire mailbox is not automatically synced."}</p><button className="ws-button" disabled={busy} onClick={() => void run(() => connectMailbox(c.provider, true, callbackURL))}>{zh ? "开启读取与 AI 分析" : "Enable reading and AI analysis"}</button></>}
        {(c.email || c.error) && <div><button className="ws-link" onClick={() => setDisconnect(disconnect === c.provider ? null : c.provider)}>{zh ? "断开邮箱…" : "Disconnect mailbox…"}</button>{disconnect === c.provider && <div className="ws-email-notice"><p>{zh ? "断开后，助理无法通过此邮箱发送或读取邮件。已保存的对话、推荐及发送记录会保留。" : "Disconnecting stops sending and reading through this mailbox. Saved conversations, recommendations and delivery records remain."}</p><button className="ws-button" disabled={busy} onClick={() => void run(async () => { await api(`/mailboxes?provider=${c.provider}`, { method: "DELETE" }); setDisconnect(null); setManage(null); })}>{zh ? "确认断开" : "Confirm disconnect"}</button><button className="ws-link" onClick={() => setDisconnect(null)}>{zh ? "取消" : "Cancel"}</button></div>}</div>}
      {manage === c.provider && c.error && c.error !== microsoftSuspendedMessage && !c.needs_reconnect && !compact && <button className="ws-link" disabled={busy} onClick={() => void run(() => connectMailbox(c.provider, !!c.granted_read && c.read_enabled, callbackURL))}>{zh ? "重新连接邮箱" : "Reconnect mailbox"}</button>}
      </div>
    </article>;})}
    {compact && <button className="ws-link" onClick={() => setShowOther(!showOther)}>{zh ? (showOther ? "收起其他邮箱" : "选择其他邮箱") : (showOther ? "Hide other mailboxes" : "Choose another mailbox")}</button>}
    {notice && <p role="status">{notice}</p>}
    <ErrorNotice error={error || query.error || (oauthError ? (zh ? "邮箱连接未完成，之前的内容仍保留。可以重试或继续工作。" : "Mailbox connection was not completed. Your work is preserved. Retry or continue working.") : "")} retry={query.error ? query.refresh : undefined} />
    <details className="ws-mailbox-help">
      <summary className="ws-link">{zh ? "了解邮箱权限与数据使用" : "About mailbox permissions and data use"}</summary>
      <p>{zh ? "连接后，在对话里告诉助理收件人和邮件内容，或从推荐材料中准备邮件。每封邮件发送前都需要你的确认。登录 Hirelix 不等于已连接邮箱。" : "Once connected, tell your assistant who to email and what to say, or prepare an email from a saved recommendation. You confirm each send. Signing in to Hirelix does not connect your mailbox."}</p>
      <p>{zh ? "连接首先申请发送权限。读取需要单独授权；相关内容会交给 AI 处理，摘要可能保留在对话中，不会自动同步整个邮箱。" : "Connecting requests sending permission first. Reading requires separate permission. Relevant content is processed by AI, and summaries may remain in conversations. Your entire mailbox is not automatically synced."}</p>
      <a className="ws-link" href="/privacy">{zh ? "邮箱数据使用说明" : "How mailbox data is used"}</a>
    </details>
    {compact && <p><a className="ws-link" href="/app/settings?section=email">{zh ? "管理邮箱与默认发件人" : "Manage email and default sender"}</a></p>}
  </section>;
}
