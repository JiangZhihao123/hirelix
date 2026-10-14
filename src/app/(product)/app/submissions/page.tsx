"use client";
import { useLanguage, useT } from "@/components/LanguageProvider";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  FilePenLine,
  Search,
  BriefcaseBusiness,
} from "lucide-react";
import {
  useQuery,
  ErrorNotice,
  Loading,
  date,
  Dialog,
} from "@/components/workspace/client";
import type { RecommendationWorkspace } from "@/lib/workspace/recommendations-contract";
import {
  feedbackLabels,
  type feedbackResponses,
} from "@/lib/workspace/recommendation-feedback-contract";
export default function Submissions() {
  const t = useT();
  const { locale } = useLanguage();
  const zh = locale === "zh";
  const query = useQuery<RecommendationWorkspace>("/recommendations");
  const [search, setSearch] = useState(""),
    [choose, setChoose] = useState(false),
    [filter, setFilter] = useState("all");
  const items = (query.data?.roles || []).filter(
    (r) =>
      `${r.role.title} ${r.role.client_name} ${r.people.map((p) => p.name).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter !== "recommended" || r.recommended_count > 0) &&
      (filter !== "preparing" || !r.recommended_count),
  );
  return (
    <div className="ws-page">
      <header className="ws-page-header">
        <div>
          <h1>{t("Recommendations")}</h1>
          <p className="ws-muted">
            {zh
              ? "围绕职位，查看推荐人选、客户反馈与每次交付。"
              : "Candidates, client feedback and deliveries, organized by role."}
          </p>
        </div>
        <button
          className="ws-button ws-button-primary ws-page-create"
          onClick={() => setChoose(true)}
        >
          <FilePenLine size={17} />
          {t("Prepare submission")}
          <ArrowUpRight size={15} />
        </button>
      </header>
      <div className="ws-toolbar">
        <div className="ws-search">
          <Search size={16} />
          <input
            aria-label={t("Search by candidate, client or role")}
            placeholder={t("Search by candidate, client or role")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="ws-filters">
          <select
            aria-label={t("Status")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">{zh ? "全部职位" : "All roles"}</option>
            <option value="recommended">
              {zh ? "已有推荐" : "With recommendations"}
            </option>
            <option value="preparing">
              {zh ? "尚未推荐" : "Not yet recommended"}
            </option>
          </select>
          <span className="ws-count">
            {items.length} {zh ? "个职位" : "roles"}
          </span>
        </div>
      </div>
      <ErrorNotice error={query.error} retry={query.refresh} />
      {query.loading && !query.data ? (
        <Loading />
      ) : items.length ? (
        <div className="ws-role-grid ws-recommendation-grid">
          <div className="ws-role-table-head">
            <span>{zh ? "职位 / 客户" : "Role / client"}</span>
            <span>{zh ? "已推荐人选" : "Recommended"}</span>
            <span>{zh ? "最新反馈" : "Latest feedback"}</span>
            <span>{zh ? "最近推荐" : "Last delivery"}</span>
          </div>
          {items.map((item) => {
            const feedback = item.feedback[0];
            const label = feedback?.details
              .response as (typeof feedbackResponses)[number];
            return (
              <Link
                key={item.role.id}
                className="ws-role-row"
                href={`/app/roles/${item.role.id}?tab=submissions`}
              >
                <div>
                  <h2>{item.role.title}</h2>
                  <p>{item.role.client_name}</p>
                  <small className="ws-muted">
                    {item.materials.length}{" "}
                    {zh ? "份推荐材料" : "saved materials"}
                  </small>
                </div>
                <span>
                  {item.recommended_count} {zh ? "人" : "people"}
                </span>
                <div className="ws-rec-feedback">
                  {feedback ? (
                    <>
                      <span>
                        {
                          item.people.find((p) => p.id === feedback.person_id)
                            ?.name
                        }{" "}
                        ·{" "}
                        {label && feedbackLabels[label]
                          ? t(feedbackLabels[label])
                          : feedback.title}
                      </span>
                      <small>
                        {date(feedback.occurred_at || feedback.created_at)}
                      </small>
                    </>
                  ) : (
                    <span className="ws-muted">
                      {zh ? "暂无反馈" : "No feedback yet"}
                    </span>
                  )}
                </div>
                <span className="ws-muted">
                  {item.last_delivery ? date(item.last_delivery) : "—"}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="ws-empty">
          <h2>{zh ? "没有符合条件的职位" : "No matching roles"}</h2>
          <p>
            {zh
              ? "先添加职位，再让助理为这个职位准备推荐人选。"
              : "Add a role, then ask your assistant to prepare its recommendations."}
          </p>
          <Link className="ws-button" href="/app/roles">
            {t("Roles & JDs")}
            <ArrowUpRight size={14} />
          </Link>
        </div>
      )}
      {choose && (
        <Dialog
          title={zh ? "为哪个职位准备推荐？" : "Choose a role"}
          onClose={() => setChoose(false)}
        >
          <div className="ws-rec-role-picker">
            {query.data?.roles.map(({ role }) => (
              <Link
                className="ws-detail-link"
                key={role.id}
                href={`/app?role=${role.id}&prompt=${encodeURIComponent(zh ? "请帮我为这个职位准备候选人推荐材料。" : "Help me prepare candidate recommendations for this role.")}`}
              >
                <BriefcaseBusiness size={18} />
                <div>
                  <strong>{role.title}</strong>
                  <small>{role.client_name}</small>
                </div>
                <ArrowUpRight size={15} />
              </Link>
            ))}
            {!query.data?.roles.length && (
              <Link className="ws-link" href="/app/roles">
                {zh ? "先添加职位" : "Add a role first"}
              </Link>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
