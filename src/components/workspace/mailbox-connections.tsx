"use client";
import { useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { authClient } from "@/lib/auth-client";
import { mailboxScopes, type MailboxProvider, type MailboxConnection } from "@/lib/workspace/mailbox-contract";
import { api, useQuery, ErrorNotice } from "./client";

export async function connectMailbox(provider: MailboxProvider, read: boolean, callbackURL: string) {
  const callback=new URL(callbackURL,window.location.origin);
  if (callback.origin!==window.location.origin) throw new Error("Return to Hirelix after connecting your mailbox.");
  const scopes=[mailboxScopes[provider].send,...(read ? [mailboxScopes[provider].read] : []),...(provider === "microsoft" ? ["User.Read","offline_access"] : [])];
  const result=await authClient.linkSocial({provider,scopes,disableRedirect:true,callbackURL:callback.href,errorCallbackURL:callback.href});
  if (result.error || !result.data?.url) throw new Error(result.error?.message || "Could not connect this mailbox.");
  const url=new URL(result.data.url);url.searchParams.set("prompt","consent");window.location.assign(url.href);
}
export function MailboxConnections({callbackURL="/app/settings",oauthError}:{callbackURL?:string;oauthError?:string|null}) {
  const {locale}=useLanguage(),zh=locale==="zh";
  const query=useQuery<{connections:MailboxConnection[]}>("/mailboxes");
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function run(action:()=>Promise<unknown>) {setBusy(true);setError("");try {await action();query.refresh();}catch(e){setError(e instanceof Error?e.message:"Could not update mailbox");}finally{setBusy(false);}}
  return <section className="ws-email-card" aria-label={zh?"邮箱连接":"Email connections"}>
    <strong>{zh?"邮箱连接":"Email connections"}</strong>
    <p>{zh?"支持个人邮箱和由 Google Workspace / Microsoft 365 托管的企业邮箱。":"Personal mailboxes and business email hosted by Google Workspace or Microsoft 365."}</p>
    <p>{zh?"开启读取后，助理会按你的要求检索邮件并将相关内容交给 AI 处理；相关摘要可能保存在对话中。不会自动同步整个邮箱。":"When you enable reading, the assistant can search mail for your requests and send relevant content to AI providers. Summaries may remain in your conversation. Your entire mailbox is not automatically synced."} <a href="/privacy" target="_blank" rel="noreferrer">{zh?"数据使用说明":"Data use details"}</a></p>
    {query.loading && <p>{zh?"正在检查连接…":"Checking connections…"}</p>}
    {query.data?.connections.map(c=><div key={c.provider} className="ws-email-notice">
      <strong>{c.provider==="google"?"Gmail / Google Workspace":"Outlook / Microsoft 365"}</strong>
      <p>{c.email || (zh?"尚未连接":"Not connected")} · {c.connected?(zh?"可发送":"Sending enabled"):(zh?"未授权发送":"Sending not authorized")} · {c.can_read?(zh?"可读取":"Reading enabled"):(zh?"未授权读取":"Reading not authorized")}</p>
      {!c.configured ? <p>{zh?"接入配置尚未完成。":"Provider setup is not complete yet."}</p> : <>
        <button className="ws-button" disabled={busy} onClick={()=>void run(()=>connectMailbox(c.provider,c.can_read,callbackURL))}>{zh?"连接 / 更新发送授权":"Connect / renew sending"}</button>
        {c.read_enabled ? <button className="ws-button" disabled={busy} onClick={()=>void run(()=>connectMailbox(c.provider,true,callbackURL))}>{zh?"授权读取与 AI 分析":"Allow reading and AI analysis"}</button>:<p>{zh?"读取功能正在准备，尚未开放。":"Mailbox reading is being prepared and is not available yet."}</p>}
        {(c.email || c.error) && <button className="ws-button" disabled={busy} onClick={()=>void run(()=>api(`/mailboxes?provider=${c.provider}`,{method:"DELETE"}))}>{zh?"断开邮箱":"Disconnect mailbox"}</button>}
      </>}
      {c.error && <ErrorNotice error={c.error}/>}
    </div>)}
    <ErrorNotice error={error || query.error || (oauthError ? (zh ? "邮箱连接未完成。授权可能已过期或被另一个登录操作替换，请重新点击连接，并在同一个浏览器中完成授权。" : "Mailbox connection was not completed. Authorization may have expired or been replaced by another sign-in. Connect again and finish in the same browser.") : "")}/>
  </section>;
}
