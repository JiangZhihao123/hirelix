"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import {
  api,
  useQuery,
  ErrorNotice,
  date,
} from "@/components/workspace/client";
import type { ProductFeedback } from "@/lib/product-feedback-contract";
export default function FeedbackPage() {
  const { locale } = useLanguage();
  const zh = locale === "zh";
  const selected = useSearchParams().get("report");
  const [before, setBefore] = useState<string | null>(null);
  const reports = useQuery<{ items: ProductFeedback[] }>(
    `/feedback${selected ? `?report=${encodeURIComponent(selected)}` : before ? `?before=${encodeURIComponent(before)}` : ""}`,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  return (
    <div className="ws-page ws-feedback-page">
      <header className="ws-page-header">
        <div>
          <h1>{zh ? "用户反馈" : "User feedback"}</h1>
          <p>
            {zh
              ? "内部处理列表。回复用户后，再标记为已回复。"
              : "Internal inbox. Reply to the user before marking a report as replied."}
          </p>
        </div>
        <button className="ws-button" onClick={reports.refresh}>
          {zh ? "刷新" : "Refresh"}
        </button>
      </header>
      {selected && (
        <p>
          <Link className="ws-link" href="/app/feedback">
            {zh ? "所有反馈" : "All feedback"}
          </Link>
        </p>
      )}
      <ErrorNotice error={reports.error || error} retry={reports.refresh} />
      {reports.loading && <p>{zh ? "正在加载…" : "Loading…"}</p>}
      <div className="ws-feedback-reports">
        {reports.data?.items.map((item) => (
          <article key={item.id} id={item.id} className="ws-feedback-report">
            <header>
              <div>
                <strong>{item.email}</strong>
                <p className="ws-muted">
                  {date(item.created_at, true)} ·{" "}
                  {zh
                    ? {
                        problem: "遇到问题",
                        suggestion: "功能建议",
                        other: "其他",
                      }[item.category] || item.category
                    : item.category}{" "}
                  · {item.id.slice(0, 8)}
                </p>
              </div>
              <select
                aria-label={`${zh ? "处理状态" : "Status"} ${item.id.slice(0, 8)}`}
                value={item.status}
                disabled={busy === item.id}
                onChange={async (e) => {
                  setBusy(item.id);
                  setError("");
                  try {
                    await api("/feedback", {
                      method: "PATCH",
                      body: JSON.stringify({
                        id: item.id,
                        status: e.target.value,
                      }),
                    });
                    reports.refresh();
                  } catch {
                    setError(
                      zh
                        ? "状态未保存，请重试。"
                        : "Status was not saved. Please retry.",
                    );
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                <option value="new">{zh ? "待处理" : "New"}</option>
                <option value="in_progress">
                  {zh ? "处理中" : "In progress"}
                </option>
                <option value="replied">{zh ? "已回复" : "Replied"}</option>
              </select>
            </header>
            <pre>{item.message}</pre>
            <p className="ws-muted">
              {item.page_path} · {item.app_version.slice(0, 12)}
            </p>
            <div className="ws-actions">
              <a
                className="ws-link"
                href={`mailto:${encodeURIComponent(item.email)}?subject=${encodeURIComponent(`Re: Hirelix feedback ${item.id.slice(0, 8)}`)}`}
              >
                {zh ? "邮件回复" : "Reply by email"}
              </a>
              {item.has_screenshot && (
                <a
                  className="ws-link"
                  href={`/api/workspace/feedback/${item.id}/screenshot`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {zh ? "查看截图" : "View screenshot"} ↗
                </a>
              )}
            </div>
            <p className="ws-muted">
              {zh ? "支持邮箱通知" : "Support email notification"}：
              {item.notification_status === "sent"
                ? zh
                  ? "邮件服务已接受"
                  : "Accepted by email service"
                : item.notification_status === "failed"
                  ? zh
                    ? "未确认送达，请直接处理此反馈"
                    : "Unconfirmed — handle this report here"
                  : zh
                    ? "等待发送或重试"
                    : "Pending or retrying"}
            </p>
          </article>
        ))}
      </div>
      {reports.data?.items.length === 0 && (
        <p>{zh ? "暂无反馈" : "No feedback yet"}</p>
      )}
      <div className="ws-actions">
        {before && (
          <button className="ws-button" onClick={() => setBefore(null)}>
            {zh ? "返回最新" : "Back to latest"}
          </button>
        )}
        {reports.data?.items.length === 50 && (
          <button
            className="ws-button"
            onClick={() => setBefore(reports.data!.items.at(-1)!.id)}
          >
            {zh ? "更早的反馈" : "Older feedback"}
          </button>
        )}
      </div>
    </div>
  );
}
