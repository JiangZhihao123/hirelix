"use client";
import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Link as LinkIcon,
  Mail,
  Check,
  ExternalLink,
  Download,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useLanguage, useT } from "@/components/LanguageProvider";
import { AgentText } from "@/components/AgentText";
import { api, ErrorNotice, Field, useQuery } from "./client";
import { downloadDocument } from "./document-download";
import type { Deliverable } from "@/lib/workspace/types";
import type { SubmissionCv } from "@/lib/workspace/deliverables";
type Share = {
  id: string;
  path: string;
  version: number;
  expires_at: string;
  current_copy: boolean;
};
type Receipt = {
  id: string;
  status: string;
  recipient: string;
  deliverable_version: number;
  current_copy: boolean;
  error: string | null;
};
export function RecommendationDelivery({
  document,
  disabled,
  onChanged,
}: {
  document: Deliverable;
  disabled: boolean;
  onChanged: (value: Deliverable) => void;
}) {
  const t = useT();
  const { locale } = useLanguage();
  const zh = locale === "zh";
  const [mode, setMode] = useState<"link" | "gmail" | "copy">("link"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(""),
    [to, setTo] = useState(""),
    [includeLink, setIncludeLink] = useState(false),
    [showRecord, setShowRecord] = useState(false),
    [recipient, setRecipient] = useState(""),
    [channel, setChannel] = useState("email"),
    [occurred, setOccurred] = useState(() => {
      const d = new Date();
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    }),
    [note, setNote] = useState(""),
    [message, setMessage] = useState("");
  const sendKey = useRef<string | null>(null),
    recordKey = useRef<string | null>(null),
    rendered = useRef<HTMLDivElement>(null);
  const share = useQuery<{ share: Share | null }>(
      `/deliverables/${document.id}/share?version=${document.version}`,
    ),
    receipts = useQuery<{ receipts: Receipt[] }>(
      `/deliverables/${document.id}/email`,
    ),
    connection = useQuery<{ connected: boolean; email: string | null }>(
      "/gmail",
    );
  const source = document.source_snapshot as {
    files?: SubmissionCv[];
    people?: Array<{ id: string; name: string }>;
  };
  const active = share.data?.share;
  const url =
    active && typeof window !== "undefined"
      ? new URL(active.path, window.location.origin).href
      : "";
  const linkText = `${document.source_snapshot.language === "zh" ? "查看推荐与提交反馈" : "View recommendation and share feedback"}: ${url}`;
  const emailContent =
    document.content +
    (includeLink && active?.current_copy ? `\n\n${linkText}` : "");
  const inProgress = receipts.data?.receipts.some(
    (r) => r.status === "sending",
  );
  useEffect(() => {
    if (!inProgress) return;
    const timer = setInterval(receipts.refresh, 3000);
    return () => clearInterval(timer);
  }, [inProgress, receipts.refresh]);
  useEffect(() => {
    sendKey.current = null;
  }, [to, includeLink, active?.id, document.version]);
  useEffect(() => {
    recordKey.current = null;
  }, [recipient, channel, occurred, note, active?.id, document.version]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not complete this request",
      );
    } finally {
      setBusy(false);
    }
  }
  async function refreshDocument() {
    const value = await api<{ deliverable: Deliverable }>(
      `/deliverables/${document.id}`,
    );
    onChanged(value.deliverable);
    share.refresh();
    window.dispatchEvent(new Event("hirelix:work-changed"));
  }
  async function copy(value: string, label: string, rich = false) {
    await run(async () => {
      if (
        rich &&
        rendered.current &&
        typeof ClipboardItem !== "undefined" &&
        navigator.clipboard.write
      ) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([rendered.current.innerText], {
              type: "text/plain",
            }),
            "text/html": new Blob([rendered.current.innerHTML], {
              type: "text/html",
            }),
          }),
        ]);
      } else await navigator.clipboard.writeText(value);
      setCopied(label);
    });
  }
  async function send() {
    await run(async () => {
      sendKey.current ||= crypto.randomUUID();
      const result = await api<{ status: string }>(
        `/deliverables/${document.id}/email`,
        {
          method: "POST",
          body: JSON.stringify({
            expected_version: document.version,
            to,
            request_key: sendKey.current,
            share_id: includeLink ? active?.id : null,
          }),
        },
      );
      receipts.refresh();
      if (result.status === "sent") {
        setMessage(
          zh
            ? "邮件已发送，推荐记录已保存。"
            : "Email sent and recommendation recorded.",
        );
        await refreshDocument();
      } else
        setMessage(
          zh
            ? "请查看下方发送状态。结果未确认时，先检查 Gmail 已发送邮件。"
            : "Check delivery status below. For an uncertain result, check Gmail Sent first.",
        );
    });
  }
  async function record() {
    await run(async () => {
      recordKey.current ||= crypto.randomUUID();
      const result = await api<{ deliverable: Deliverable }>(
        `/deliverables/${document.id}/submitted`,
        {
          method: "POST",
          body: JSON.stringify({
            expected_version: document.version,
            request_key: recordKey.current,
            channel,
            recipient,
            share_id: channel === "link" ? active?.id : undefined,
            submitted_at: new Date(occurred).toISOString(),
            submission_note:
              note.trim() ||
              (zh ? `已向 ${recipient} 推荐` : `Recommended to ${recipient}`),
          }),
        },
      );
      onChanged(result.deliverable);
      setShowRecord(false);
      setMessage(zh ? "已记录实际推荐。" : "Actual delivery recorded.");
      share.refresh();
      window.dispatchEvent(new Event("hirelix:work-changed"));
    });
  }
  return (
    <section
      id="recommendation-delivery"
      className="ws-recommendation-delivery"
      aria-label={zh ? "交付推荐" : "Deliver recommendation"}
    >
      <header>
        <div>
          <h2>{zh ? "交付推荐" : "Deliver recommendation"}</h2>
          <p>
            {zh
              ? "选择适合客户的方式。同一份推荐链接也可以放进邮件。"
              : "Choose how to reach your client. The same recommendation link can also go in an email."}
          </p>
        </div>
        <Link
          className="ws-link"
          href={`/app/roles/${document.role_id}?tab=submissions`}
        >
          {zh ? "查看推荐与反馈" : "Recommendations & feedback"} ↗
        </Link>
      </header>
      <div className="ws-delivery">
        <div
          className="ws-delivery-tabs"
          role="tablist"
          aria-label={t("Delivery method")}
        >
          {(
            [
              ["link", zh ? "分享链接" : "Share link", LinkIcon],
              ["gmail", "Gmail", Mail],
              ["copy", zh ? "复制与下载" : "Copy & download", Copy],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              type="button"
              key={key}
              role="tab"
              aria-selected={mode === key}
              onClick={() => {
                setMode(key);
                setError("");
              }}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </div>
        <ErrorNotice error={error || share.error || receipts.error} />
        {message && (
          <p className="ws-notice" role="status">
            {message}
          </p>
        )}
        {disabled && (
          <p className="ws-notice">
            {zh
              ? "请先保存当前修改，再交付这一版本。"
              : "Save your current changes before delivering this version."}
          </p>
        )}
        {mode === "link" && (
          <section>
            <p>
              {zh
                ? "客户无需登录即可查看推荐材料、下载选定简历，并逐人留下反馈。生成链接不会记为已推荐。"
                : "Clients can view the recommendation, download selected CVs and give feedback per candidate without signing in. Creating a link does not record delivery."}
            </p>
            {active ? (
              <>
                <Field label={t("Share link")}>
                  <input readOnly value={url} />
                </Field>
                <div className="ws-actions">
                  <button
                    className="ws-button"
                    disabled={busy}
                    onClick={() => void copy(url, "link")}
                  >
                    <Copy size={14} />
                    {t(copied === "link" ? "Copied" : "Copy link")}
                  </button>
                  <a
                    className="ws-button"
                    href={active.path}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("Open client link")}
                    <ExternalLink size={14} />
                  </a>
                  <button
                    className="ws-link"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api(`/deliverables/${document.id}/share`, {
                          method: "DELETE",
                        });
                        share.refresh();
                        setIncludeLink(false);
                      })
                    }
                  >
                    {t("Revoke link")}
                  </button>
                  <small className="ws-muted">
                    {t("Link expires")}:{" "}
                    {new Date(active.expires_at).toLocaleDateString()}
                  </small>
                </div>
                {!active.current_copy && (
                  <div className="ws-notice">
                    <p>
                      {t(
                        "Your draft has changed. The existing link still shows the previously shared copy.",
                      )}
                    </p>
                    <button
                      className="ws-button"
                      disabled={busy || disabled}
                      onClick={() =>
                        void run(async () => {
                          await api(`/deliverables/${document.id}/share`, {
                            method: "POST",
                            body: JSON.stringify({
                              expected_version: document.version,
                            }),
                          });
                          share.refresh();
                        })
                      }
                    >
                      {t("Publish latest copy and replace old link")}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <button
                className="ws-button ws-button-primary"
                disabled={busy || disabled || share.loading}
                onClick={() =>
                  void run(async () => {
                    await api(`/deliverables/${document.id}/share`, {
                      method: "POST",
                      body: JSON.stringify({
                        expected_version: document.version,
                      }),
                    });
                    share.refresh();
                  })
                }
              >
                <LinkIcon size={15} />
                {t("Create client link")}
              </button>
            )}
          </section>
        )}
        {(mode === "gmail" || mode === "copy") && (
          <section>
            {mode === "gmail" ? (
              <>
                <p className="ws-muted">
                  {connection.data?.connected
                    ? `${zh ? "发件人" : "From"}: ${connection.data.email}`
                    : t("Gmail is not connected")}
                </p>
                {!connection.data?.connected && (
                  <Link
                    className="ws-link"
                    href={`/app?document=${document.id}&role=${document.role_id}&prompt=${encodeURIComponent(zh ? "帮我连接 Gmail 发信功能，不发送邮件。" : "Help me connect Gmail for sending. Do not send an email.")}`}
                  >
                    {t("Manage Gmail connection")} ↗
                  </Link>
                )}
                <Field label={zh ? "收件人" : "Recipient"}>
                  <input
                    type="email"
                    placeholder="hr@company.com"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    disabled={busy}
                  />
                </Field>
              </>
            ) : (
              <p>
                {zh
                  ? "复制到公司邮箱或其他邮件客户端。下载的推荐文件与候选人简历需自行添加为附件。"
                  : "Copy into your company email or another mail app. Add downloaded recommendation files and CVs as attachments yourself."}
              </p>
            )}
            <Field label={t("Email subject")}>
              <input readOnly value={document.title} />
            </Field>
            {mode === "copy" && (
              <button
                className="ws-button"
                disabled={disabled || busy}
                onClick={() => void copy(document.title, "subject")}
              >
                <Copy size={14} />
                {t(copied === "subject" ? "Subject copied" : "Copy subject")}
              </button>
            )}
            {active?.current_copy ? (
              <label className="ws-rec-checkbox">
                <input
                  type="checkbox"
                  checked={includeLink}
                  onChange={(e) => setIncludeLink(e.target.checked)}
                  disabled={busy}
                />
                {zh
                  ? "在正文附上推荐链接，方便客户逐人反馈"
                  : "Include the recommendation link for per-candidate feedback"}
              </label>
            ) : (
              <p className="ws-muted">
                {zh
                  ? "如需邮件附带链接，请先在“分享链接”中生成当前版本。"
                  : "To include a link, first publish the current version in Share link."}
              </p>
            )}
            <div className="ws-rec-email-preview" ref={rendered}>
              <AgentText content={emailContent} />
            </div>
            {mode === "gmail" ? (
              <>
                <button
                  className="ws-button ws-button-primary"
                  disabled={
                    disabled ||
                    busy ||
                    !!inProgress ||
                    !connection.data?.connected ||
                    !to.trim() ||
                    !!(includeLink && !active?.current_copy)
                  }
                  onClick={() => void send()}
                >
                  <Send size={15} />
                  {zh ? "确认发送这封邮件" : "Send this email"}
                </button>
                <p className="ws-muted">
                  {zh
                    ? "点击后，以上正文和下方选定简历将发送给该收件人。成功后自动记录推荐。"
                    : "Sends the body above and selected CVs below to this recipient. A successful send records the recommendation."}
                </p>
                {receipts.data?.receipts.map((r) => (
                  <p key={r.id} className="ws-muted">
                    {r.recipient} ·{" "}
                    {t(
                      r.status === "sent"
                        ? "Sent through Gmail"
                        : r.status === "sending"
                          ? "Sending through Gmail…"
                          : r.status === "failed"
                            ? "Sending failed"
                            : "Delivery unconfirmed",
                    )}
                    {r.error ? ` — ${t(r.error)}` : ""}
                  </p>
                ))}
                <Link
                  className="ws-link"
                  href={`/app/mail?document=${document.id}`}
                >
                  {t("Email activity")} ↗
                </Link>
              </>
            ) : (
              <div className="ws-actions">
                <button
                  className="ws-button"
                  disabled={disabled || busy}
                  onClick={() => void copy(emailContent, "body", true)}
                >
                  <Copy size={14} />
                  {t(copied === "body" ? "Body copied" : "Copy body")}
                </button>
                <button
                  className="ws-link"
                  disabled={disabled || busy}
                  onClick={() => void copy(rendered.current?.innerText || emailContent, "plain")}
                >
                  {zh
                    ? copied === "plain"
                      ? "已复制纯文本"
                      : "复制纯文本"
                    : copied === "plain"
                      ? "Plain text copied"
                      : "Copy plain text"}
                </button>
                {(["pdf", "docx"] as const).map((format) => (
                  <button
                    key={format}
                    className="ws-button"
                    disabled={disabled || busy}
                    onClick={() =>
                      void run(() => downloadDocument(document, format))
                    }
                  >
                    <Download size={14} />
                    {format.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
        <section className="ws-delivery-files">
          <h3>{t("Selected CV attachments")}</h3>
          {source.files?.length ? (
            source.files.map((file) => (
              <a
                key={file.id}
                href={`/api/workspace/files/${file.id}?download=1`}
                className="ws-link"
              >
                <Download size={14} />
                {
                  source.people?.find((p) => p.id === file.person_id)?.name
                } · {file.name}
              </a>
            ))
          ) : (
            <p className="ws-muted">
              {t(
                "No CV attachments selected. Only the recommendation text will be shared.",
              )}
            </p>
          )}
        </section>
        <section className="ws-rec-external">
          <div>
            <h3>
              {zh
                ? "已经通过其他渠道发给客户？"
                : "Already sent outside Hirelix?"}
            </h3>
            <p>
              {zh
                ? "记录实际发送，不会再次发送邮件。复制、下载和生成链接不会自动记作推荐。"
                : "Record the actual delivery without sending again. Copying, downloading and creating links do not count as delivery."}
            </p>
          </div>
          <button
            className="ws-button"
            disabled={disabled || busy}
            onClick={() => {
              setShowRecord(!showRecord);
              setChannel(mode === "link" && active ? "link" : "email");
            }}
          >
            <Check size={15} />
            {zh ? "记录实际推荐" : "Record actual delivery"}
          </button>
        </section>
        {showRecord && (
          <form
            className="ws-rec-record-form"
            onSubmit={(e) => {
              e.preventDefault();
              void record();
            }}
          >
            <div className="ws-rec-fields">
              <Field label={zh ? "收件人 / 联系人" : "Recipient / contact"}>
                <input
                  required
                  maxLength={320}
                  placeholder={
                    zh
                      ? "姓名或邮箱，不强制填写邮箱"
                      : "Name or email; email is optional"
                  }
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </Field>
              <Field label={zh ? "渠道" : "Channel"}>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  <option value="email">
                    {zh ? "外部邮箱" : "External email"}
                  </option>
                  {active && (
                    <option value="link">
                      {zh
                        ? `分享链接 · v${active.version}`
                        : `Share link · v${active.version}`}
                    </option>
                  )}
                  <option value="other">
                    {zh ? "其他渠道" : "Other channel"}
                  </option>
                </select>
              </Field>
              <Field label={zh ? "实际发送时间" : "Actual delivery time"}>
                <input
                  required
                  type="datetime-local"
                  value={occurred}
                  onChange={(e) => setOccurred(e.target.value)}
                />
              </Field>
            </div>
            <Field label={zh ? "备注（可选）" : "Note (optional)"}>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={10000}
              />
            </Field>
            <div className="ws-actions">
              <button
                className="ws-button ws-button-primary"
                disabled={disabled || busy || !!(channel === "link" && !active)}
              >
                {t(busy ? "Saving…" : "Save")}
              </button>
              <button
                type="button"
                className="ws-button"
                onClick={() => setShowRecord(false)}
              >
                {t("Cancel")}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
