"use client";
import { useLanguage, useT } from "@/components/LanguageProvider";
import Link from "next/link";
import { Plus } from "lucide-react";
import {
  date,
  ErrorNotice,
  Loading,
  useQuery,
} from "@/components/workspace/client";
import {
  ListSearch,
  ListPagination,
  SortHeading,
  useListState,
  useListScroll,
} from "@/components/workspace/list-controls";
import type { Role } from "@/lib/workspace/types";
export default function Roles() {
  const t = useT(),
    { locale } = useLanguage(),
    zh = locale === "zh";
  const { params, update, href } = useListState();
  const q = params.get("q") || "",
    status = params.get("status") || "all",
    sort = params.get("sort") || "updated",
    direction = params.get("direction") || "desc",
    page = Math.max(1, Number(params.get("page")) || 1);
  const query = useQuery<{
    roles: Array<Role & { candidate_count: number; submission_count: number }>;
    total: number;
  }>(
    `/roles?${new URLSearchParams({ view: "list", q, status, sort, direction, page: String(page) })}`,
  );
  const saveScroll = useListScroll(href, !query.loading);
  const roles = query.data?.roles || [];
  const onSort = (sort: string, direction: string) =>
    update({ sort, direction });
  const add = `/app?prompt=${encodeURIComponent(t("Save a role from the JD and client context I provide."))}`;
  return (
    <div className="ws-page">
      <header className="ws-page-header">
        <h1>{t("Roles & JDs")}</h1>
        <Link className="ws-button ws-list-create" href={add}>
          <Plus size={15} />
          {t("Add role")}
        </Link>
      </header>
      <div className="ws-toolbar">
        <ListSearch
          value={q}
          onChange={(q) => update({ q })}
          placeholder={t("Search by role or client")}
        />
        <div className="ws-filters">
          <select
            aria-label={t("Role status")}
            value={status}
            onChange={(e) => update({ status: e.target.value })}
          >
            {["all", "active", "paused", "closed"].map((s) => (
              <option key={s} value={s}>
                {s === "all" ? t("All roles") : t(s)}
              </option>
            ))}
          </select>
          <select
            aria-label={zh ? "排序字段" : "Sort by"}
            value={sort}
            onChange={(e) =>
              onSort(
                e.target.value,
                ["title", "client"].includes(e.target.value) ? "asc" : "desc",
              )
            }
          >
            {[
              ["updated", zh ? "最近更新" : "Updated"],
              ["created", zh ? "最近添加" : "Added"],
              ["title", zh ? "职位名称" : "Role title"],
              ["client", zh ? "客户名称" : "Client"],
              ["candidates", zh ? "候选人数" : "Candidate count"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <button
            className="ws-button"
            aria-label={zh ? "切换排序方向" : "Reverse sort order"}
            onClick={() => onSort(sort, direction === "asc" ? "desc" : "asc")}
          >
            {direction === "asc" ? "↑" : "↓"}
          </button>
          {(q || status !== "all") && (
            <button
              className="ws-link"
              onClick={() => update({ q: null, status: null })}
            >
              {t("Clear filters")}
            </button>
          )}
          <span className="ws-count">
            {query.data?.total ?? "—"} {zh ? "个职位" : "roles"}
          </span>
        </div>
      </div>
      <ErrorNotice error={query.error} retry={query.refresh} />
      {query.loading ? (
        <Loading />
      ) : roles.length ? (
        <div className="ws-role-grid">
          <div className="ws-role-table-head">
            <SortHeading field="title" {...{ sort, direction, onSort }}>
              {t("Role")}
            </SortHeading>
            <SortHeading field="candidates" {...{ sort, direction, onSort }}>
              {t("Candidates")}
            </SortHeading>
            <SortHeading field="updated" {...{ sort, direction, onSort }}>
              {t("Updated")}
            </SortHeading>
            <span>{t("Status")}</span>
          </div>
          {roles.map((role) => (
            <Link
              className="ws-role-row"
              key={role.id}
              href={`/app/roles/${role.id}?returnTo=${encodeURIComponent(href)}`}
              onClick={saveScroll}
            >
              <div>
                <h2>{role.title}</h2>
                <p>{role.client_name || t("Client not yet recorded")}</p>
              </div>
              <div className="ws-role-count">
                <p>
                  {role.candidate_count} {zh ? "位候选人" : role.candidate_count === 1 ? "candidate" : "candidates"}
                </p>
                <p>
                  {role.submission_count}{" "}
                  {zh ? "次发送记录" : role.submission_count === 1 ? "send recorded" : "sends recorded"}
                </p>
              </div>
              <div className="ws-role-count">
                <p>{date(role.updated_at)}</p>
              </div>
              <div>
                <span className="ws-status" data-status={role.status}>
                  {t(role.status)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="ws-empty">
          <h2>
            {q || status !== "all"
              ? t("No matching roles")
              : t("Start with a client’s JD.")}
          </h2>
          <p>{t("Try a different search or clear your filters.")}</p>
          {q || status !== "all" ? (
            <button
              className="ws-button"
              onClick={() => update({ q: null, status: null, page: 1 })}
            >
              {t("Clear filters")}
            </button>
          ) : (
            <Link className="ws-button ws-list-create" href={add}>
              {t("Add role")}
            </Link>
          )}
        </div>
      )}
      <ListPagination
        page={page}
        total={query.data?.total || 0}
        onPage={(page) => update({ page })}
      />
    </div>
  );
}
