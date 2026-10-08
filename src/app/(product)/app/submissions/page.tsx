"use client";

import { useLanguage, useT } from "@/components/LanguageProvider";
import { useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import {
  useQuery,
  ErrorNotice,
  Loading,
  date,
} from "@/components/workspace/client";
import type { Deliverable } from "@/lib/workspace/types";
export default function Submissions() {
  const t = useT();
  const { locale } = useLanguage();
  const query = useQuery<{
    deliverables: Array<
      Deliverable & { role_title: string; client_name: string }
    >;
  }>("/deliverables");
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState("");
  const items =
    query.data?.deliverables.filter(
      (d) =>
        (filter === "all" || d.status === filter) &&
        `${d.title} ${d.role_title} ${d.client_name}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) || [];
  return (
    <div className="ws-page">
      <header className="ws-page-header">
        <div>
          <h1>{t("Candidate submissions")}</h1>

        </div>
        <Link
          className="ws-button ws-button-primary"
          href={`/app?prompt=${encodeURIComponent(locale === "zh" ? "请帮我准备一份候选人推荐稿。" : "Help me prepare a candidate recommendation.")}`}
        >
          <Plus size={14} />
          {t("Prepare submission")}
        </Link>
      </header>
      <div className="ws-toolbar">
        <div className="ws-search"><Search size={16} /><input
          aria-label={t("Find a submission")}
          placeholder={t("Search by candidate, client or role")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        /></div>
        <div className="ws-filters">
          <select aria-label={t("Status")} value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">{t("All")}</option><option value="draft">{t("Drafts")}</option><option value="submitted">{t("Submitted")}</option>
          </select>
          <span className="ws-count">{!query.loading && (locale === "zh" ? `${items.length} 份推荐` : `${items.length} submissions`)}</span>
        </div>
      </div>
      <ErrorNotice error={query.error} retry={query.refresh} />
      {query.loading && !query.data ? (
        <Loading />
      ) : items.length ? (
        <div className="ws-role-grid ws-submissions-grid">
          <div className="ws-role-table-head" aria-hidden="true"><span>{t("Candidate submissions")}</span><span>{t("Status")}</span><span>{t("Candidates")}</span><span>{t("Updated")}</span></div>
          {items.map((d) => (
            <Link
              key={d.id}
              className="ws-role-row"
              href={`/app/submissions/${d.id}`}
            >
              <div>
                <h2>{d.title}</h2>
                <p>
                  {d.client_name} · {d.role_title}
                </p>
              </div>
              <span className="ws-status">
                {d.status === "draft" ? t("Draft") : t("Submitted")}
              </span>
              <span className="ws-role-count text-xs ws-muted">
                {locale === "zh" ? `${d.person_ids.length} 位候选人` : `${d.person_ids.length} candidates`}
              </span>
              <span className="ws-role-count text-xs ws-muted">
                {date(d.submitted_at || d.updated_at)}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="ws-empty">
          <h2>
            {search || filter !== "all"
              ? t("No submissions match this view.")
              : t("A clear introduction for every candidate.")}
          </h2>
          <p>
            {search || filter !== "all" ? t("Try a different search or clear your filters.") : t("Tell your assistant which candidate and client role the recommendation is for. Review the prepared draft here or continue refining it in the conversation.")}
          </p>
          <div className="ws-actions">
            {search || filter !== "all" ? <button className="ws-button" onClick={() => { setSearch(""); setFilter("all"); }}>{t("Clear filters")}</button> : <Link className="ws-button" href={`/app?prompt=${encodeURIComponent(locale === "zh" ? "请帮我准备一份候选人推荐稿。" : "Help me prepare a candidate recommendation.")}`}>{t("Prepare candidate submission")}</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
