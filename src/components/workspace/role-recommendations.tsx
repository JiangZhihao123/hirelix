"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  FilePenLine,
  MessageSquare,
  Send,
  Users,
  FileText,
} from "lucide-react";
import { useLanguage, useT } from "@/components/LanguageProvider";
import { FeedbackSource } from "./feedback-source";
import { AgentText } from "@/components/AgentText";
import {
  api,
  date,
  Dialog,
  ErrorNotice,
  Field,
  Loading,
  useQuery,
} from "./client";
import {
  wasDelivered,
  type RecommendationEvent,
  type RecommendationWorkspace,
} from "@/lib/workspace/recommendations-contract";
import {
  feedbackLabels,
  feedbackResponses,
} from "@/lib/workspace/recommendation-feedback-contract";
import type { SourceRecord } from "@/lib/workspace/types";
function EventRow({ event }: { event: RecommendationEvent }) {
  const { locale } = useLanguage();
  const zh = locale === "zh";
  const channel =
    event.channel === "gmail"
      ? "Gmail"
      : event.channel === "email"
        ? zh
          ? "外部邮箱"
          : "External email"
        : event.channel === "link"
          ? zh
            ? "分享链接"
            : "Share link"
          : zh
            ? "其他渠道"
            : "Other channel";
  const status: Record<string, string> = zh
    ? {
        sent: "已发送",
        recorded: "已记录实际推荐",
        published: "链接已生成 · 未确认外发",
        revoked: "链接已撤销",
        expired: "链接已过期",
        sending: "发送中",
        failed: "发送失败",
        unknown: "发送结果待确认",
      }
    : {
        sent: "Sent",
        recorded: "Delivery recorded",
        published: "Link created · delivery unconfirmed",
        revoked: "Link revoked",
        expired: "Link expired",
        sending: "Sending",
        failed: "Failed",
        unknown: "Delivery unconfirmed",
      };
  return (
    <details className="ws-rec-event">
      <summary>
        <span>
          <strong>
            {channel} ·{" "}
            {event.recipient || status[event.status] || event.status}
          </strong>
          <small>
            {date(event.at, true)} · {event.snapshot.title} · v{event.version}
          </small>
        </span>
        <span className="ws-status">
          {status[event.status] || event.status}
        </span>
      </summary>
      <div className="ws-rec-event-body">
        <p className="ws-muted">
          {event.snapshot.people?.map((p) => p.name).join("、")}
        </p>
        {event.note && <p>{event.note}</p>}
        {event.status === "unknown" && (
          <p>
            {zh
              ? "请先检查 Gmail 已发送邮件，确认结果后再决定是否重发。"
              : "Check Gmail Sent before deciding to retry."}
          </p>
        )}
        <AgentText content={event.snapshot.content} />
        {event.snapshot.files?.map((file) => (
          <a
            key={file.id}
            href={`/api/workspace/files/${file.id}`}
            className="ws-link"
          >
            {file.name} ↗
          </a>
        ))}
        <Link
          className="ws-link"
          href={`/app/submissions/${event.document_id}`}
        >
          {zh ? "打开推荐材料" : "Open material"} ↗
        </Link>
      </div>
    </details>
  );
}
function FeedbackRow({ record }: { record: SourceRecord }) {
  const t = useT();
  const response = record.details
    .response as (typeof feedbackResponses)[number];
  return (
    <article className="ws-rec-feedback-entry">
      <strong>
        {feedbackLabels[response] ? t(feedbackLabels[response]) : record.title}
      </strong>
      <small>
        {date(record.occurred_at || record.created_at, true)}

      </small>
      <FeedbackSource record={record} />
      <p>{record.content}</p>
    </article>
  );
}
export function RoleRecommendations({ roleId }: { roleId: string }) {
  const { locale } = useLanguage();
  const zh = locale === "zh";
  const t = useT();
  const query = useQuery<RecommendationWorkspace>(
    `/recommendations?role=${roleId}`,
  );
  const [tab, setTab] = useState("people"),
    [person, setPerson] = useState<string | null>(null),
    [response, setResponse] =
      useState<(typeof feedbackResponses)[number]>("comment"),
    [content, setContent] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const data = query.data?.roles[0];
  async function saveFeedback() {
    setBusy(true);
    setError("");
    try {
      await api("/records", {
        method: "POST",
        body: JSON.stringify({
          person_id: person,
          role_id: roleId,
          kind: "feedback",
          title: t(feedbackLabels[response]),
          content,
          details: { response, source: "recruiter" },
        }),
      });
      setPerson(null);
      setContent("");
      query.refresh();
      window.dispatchEvent(new Event("hirelix:work-changed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save feedback");
    } finally {
      setBusy(false);
    }
  }
  const publishedPeople = new Set(data?.events.filter(event => event.status === "published").flatMap(event => event.person_ids)).size;
  const ask = `/app?role=${roleId}&prompt=${encodeURIComponent(zh ? "请帮我为这个职位准备候选人推荐材料。" : "Help me prepare candidate recommendations for this role.")}`;
  return (
    <div className="ws-role-recommendations">
      <header>
        <div>
          <h2>{zh ? "这个职位的推荐" : "Recommendations for this role"}</h2>
          <p className="ws-muted">
            {data
              ? zh
                ? `已记录发送 ${data.recommended_count} 人 · 有效链接包含 ${publishedPeople} 人 · ${data.materials.length} 份材料`
                : `${data.recommended_count} with recorded sends · ${publishedPeople} in active links · ${data.materials.length} ${data.materials.length === 1 ? "saved material" : "saved materials"}`
              : ""}
          </p>
        </div>
        <div className="ws-actions">
          <Link
            className="ws-link"
            href={`/app?role=${roleId}&prompt=${encodeURIComponent(zh ? "汇总这个职位各位候选人的推荐和客户反馈，建议下一步。先分析，不修改或发送。" : "Review this role’s recommendations and client feedback. Suggest next steps without changing records or sending.")}`}
          >
            {zh ? "让助理分析反馈" : "Review feedback with AI"}
            <ArrowUpRight size={14} />
          </Link>
          <Link className="ws-button ws-button-primary" href={ask}>
            <FilePenLine size={16} />
            {t("Prepare recommendation")}
          </Link>
        </div>
      </header>
      <div
        className="ws-rec-tabs"
        role="tablist"
        aria-label={zh ? "推荐视图" : "Recommendation views"}
      >
        {[
          ["people", zh ? "推荐人选" : "Candidates", Users],
          ["deliveries", zh ? "交付记录" : "Delivery history", Send],
          ["materials", zh ? "推荐材料" : "Materials", FileText],
        ].map(([key, label, Icon]) => {
          const ViewIcon = Icon as typeof Users;
          return (
            <button
              key={String(key)}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(String(key))}
            >
              <ViewIcon size={15} />
              {String(label)}
            </button>
          );
        })}
      </div>
      <ErrorNotice error={query.error} retry={query.refresh} />
      {query.loading && !data && <Loading />}
      {data &&
        tab === "people" &&
        (data.people.length ? (
          <div>
            {data.people.map((p) => {
              const events = data.events.filter(
                (e) => e.person_ids.includes(p.id) && wasDelivered(e),
              );
              const feedback = data.feedback.filter(
                (f) => f.person_id === p.id,
              );
              const docs = data.materials.filter((d) =>
                d.person_ids.includes(p.id),
              );
              const latest = feedback[0];
              const label = latest?.details
                .response as (typeof feedbackResponses)[number];
              return (
                <details className="ws-rec-person" key={p.id}>
                  <summary>
                    <span className="ws-rec-avatar">{p.name.slice(0, 1)}</span>
                    <span className="ws-rec-person-name">
                      <strong>{p.name}</strong>
                      <small>{p.headline}</small>
                    </span>
                    <span className="ws-rec-person-status">
                      {latest
                        ? feedbackLabels[label]
                          ? t(feedbackLabels[label])
                          : latest.title
                        : events.length
                          ? zh
                            ? "等待反馈"
                            : "Awaiting feedback"
                          : zh
                            ? "准备中 · 尚未推荐"
                            : "Preparing · not recommended"}
                    </span>
                    <span className="ws-muted">
                      {events.length ? date(events[0].at) : "—"}
                    </span>
                  </summary>
                  <div className="ws-rec-person-body">
                    <div className="ws-actions">
                      <Link
                        className="ws-link"
                        href={`/app/candidates?person=${p.id}`}
                      >
                        {zh ? "候选人档案" : "Candidate profile"} ↗
                      </Link>
                      <button
                        className="ws-button"
                        onClick={() => {
                          setPerson(p.id);
                          setError("");
                        }}
                      >
                        <MessageSquare size={14} />
                        {zh ? "记录客户反馈" : "Record client feedback"}
                      </button>
                      <Link
                        className="ws-link"
                        href={`/app?role=${roleId}&person=${p.id}`}
                      >
                        {zh ? "与助理讨论" : "Discuss with AI"} ↗
                      </Link>
                    </div>
                    {feedback.map((f) => (
                      <FeedbackRow key={f.id} record={f} />
                    ))}
                    {events.map((e) => (
                      <EventRow key={e.id} event={e} />
                    ))}
                    <div className="ws-rec-material-links">
                      {docs.map((d) => (
                        <Link
                          key={d.id}
                          className="ws-link"
                          href={`/app/submissions/${d.id}`}
                        >
                          <FileText size={14} />
                          {d.title} ↗
                        </Link>
                      ))}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <div className="ws-empty">
            <h3>{zh ? "还没有推荐人选" : "No recommendations yet"}</h3>
            <p>
              {zh
                ? "让助理从这个职位的候选人中准备推荐材料，之后每个人的推荐与反馈都会留在这里。"
                : "Ask your assistant to prepare material from this role’s candidates. Their delivery history and feedback will appear here."}
            </p>
            <Link
              className="ws-link"
              href={`/app/roles/${roleId}?tab=candidates`}
            >
              {zh ? "查看职位候选人" : "View role candidates"} ↗
            </Link>
          </div>
        ))}
      {data &&
        tab === "deliveries" &&
        (data.events.length ? (
          data.events.map((e) => <EventRow key={e.id} event={e} />)
        ) : (
          <div className="ws-empty">
            {zh
              ? "还没有交付记录。生成材料不会被记作已推荐。"
              : "No delivery history. Preparing material does not count as a recommendation."}
          </div>
        ))}
      {data &&
        tab === "materials" &&
        (data.materials.length ? (
          data.materials.map((d) => (
            <Link
              className="ws-rec-material"
              key={d.id}
              href={`/app/submissions/${d.id}`}
            >
              <FileText size={22} />
              <span>
                <strong>{d.title}</strong>
                <small>
                  {data.people
                    .filter((p) => d.person_ids.includes(p.id))
                    .map((p) => p.name)
                    .join("、")}{" "}
                  · {date(d.updated_at)}
                </small>
              </span>
              <span className="ws-status">
                {d.status === "submitted"
                  ? zh
                    ? "已交付版本"
                    : "Delivered copy"
                  : zh
                    ? "可编辑材料"
                    : "Editable material"}
              </span>
              <ArrowUpRight size={16} />
            </Link>
          ))
        ) : (
          <div className="ws-empty">
            {zh ? "还没有推荐材料" : "No saved materials"}
          </div>
        ))}
      {person && (
        <Dialog
          title={
            zh
              ? `记录 ${data?.people.find((p) => p.id === person)?.name} 的客户反馈`
              : "Record client feedback"
          }
          onClose={() => setPerson(null)}
        >
          <form
            className="ws-form"
            onSubmit={(e) => {
              e.preventDefault();
              void saveFeedback();
            }}
          >
            <Field label={zh ? "客户意见" : "Client response"}>
              <select
                value={response}
                onChange={(e) => setResponse(e.target.value as typeof response)}
              >
                {feedbackResponses.map((r) => (
                  <option key={r} value={r}>
                    {t(feedbackLabels[r])}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={zh ? "反馈内容与来源" : "Feedback and source"}>
              <textarea
                required
                rows={5}
                maxLength={4000}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </Field>
            <p className="ws-muted">
              {zh
                ? "保存到这位候选人与当前职位；不代表已安排面试。"
                : "Saved for this candidate and role; it does not schedule an interview."}
            </p>
            <ErrorNotice error={error} />
            <button className="ws-button ws-button-primary" disabled={busy}>
              {t(busy ? "Saving…" : "Save")}
            </button>
          </form>
        </Dialog>
      )}
    </div>
  );
}
