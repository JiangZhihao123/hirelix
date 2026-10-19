"use client";
import { useLanguage, useT } from "@/components/LanguageProvider";
import Link from "next/link";
import { ChevronRight, FilePenLine, BriefcaseBusiness } from "lucide-react";
import {
  useQuery,
  ErrorNotice,
  Loading,
  date,
  Dialog,
} from "@/components/workspace/client";
import {
  ListSearch,
  ListPagination,
  SortHeading,
  useListState,
  useListScroll,
} from "@/components/workspace/list-controls";
import type { Role } from "@/lib/workspace/types";
import type { RecommendationWorkspace } from "@/lib/workspace/recommendations-contract";
import {
  feedbackLabels,
  type feedbackResponses,
} from "@/lib/workspace/recommendation-feedback-contract";
export default function Submissions() {
  const t = useT();
  const { locale } = useLanguage();
  const zh = locale === "zh";
  const { params, update } = useListState();
  const listParams = new URLSearchParams(params.toString());
  for (const key of ["choose", "pickq", "pickstatus", "pickpage"]) listParams.delete(key);
  const href = `/app/submissions${listParams.size ? `?${listParams}` : ""}`;
  const search = params.get("q") || "",
    filter = params.get("filter") || "all",
    sort = params.get("sort") || "delivery",
    direction = params.get("direction") || "desc",
    page = Math.max(1, Number(params.get("page")) || 1);
  const choose = params.get("choose") === "1";
  const setChoose = (open: boolean) =>
    update({ choose: open ? "1" : null }, false);
  const query = useQuery<RecommendationWorkspace & { total: number }>(
    `/recommendations?${new URLSearchParams({ view: "list", q: search, filter, sort, direction, page: String(page) })}`,
  );
  const saveScroll = useListScroll(href, !query.loading);
  const onSort = (sort: string, direction: string) =>
    update({ sort, direction });
  const items = query.data?.roles || [];
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
          className="ws-button ws-list-create"
          onClick={() => setChoose(true)}
        >
          <FilePenLine size={17} />
          {t("Prepare recommendation")}
        </button>
      </header>
      <div className="ws-toolbar">
        <ListSearch
          value={search}
          onChange={(q) => update({ q })}
          placeholder={t("Search by candidate, client or role")}
        />
        <div className="ws-filters">
          <select
            aria-label={zh ? "推荐情况" : "Recommendation status"}
            value={filter}
            onChange={(e) => update({ filter: e.target.value })}
          >
            <option value="all">{zh ? "全部职位" : "All roles"}</option>
            <option value="recommended">
              {zh ? "已有发送记录" : "With recorded sends"}
            </option>
            <option value="preparing">
              {zh ? "尚无发送记录" : "No recorded sends"}
            </option>
          </select>
          <select
            aria-label={zh ? "排序字段" : "Sort by"}
            value={sort}
            onChange={(e) =>
              onSort(
                e.target.value,
                e.target.value === "title" ? "asc" : "desc",
              )
            }
          >
            {[
              ["delivery", zh ? "最近发送" : "Last recorded send"],
              ["feedback", zh ? "最近反馈" : "Latest feedback"],
              ["title", zh ? "职位名称" : "Role title"],
              ["count", zh ? "已记录发送人数" : "Recorded send count"],
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
          {(search || filter !== "all") && (
            <button
              className="ws-link"
              onClick={() => update({ q: null, filter: null })}
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
      {query.loading && !query.data ? (
        <Loading />
      ) : items.length ? (
        <div className="ws-role-grid ws-recommendation-grid">
          <div className="ws-role-table-head">
            <SortHeading field="title" {...{ sort, direction, onSort }}>
              {zh ? "职位 / 客户" : "Role / client"}
            </SortHeading>
            <SortHeading field="count" {...{ sort, direction, onSort }}>
              {zh ? "已记录发送" : "Recorded sends"}
            </SortHeading>
            <SortHeading field="feedback" {...{ sort, direction, onSort }}>
              {zh ? "最新反馈" : "Latest feedback"}
            </SortHeading>
            <SortHeading field="delivery" {...{ sort, direction, onSort }}>
              {zh ? "最近发送" : "Last recorded send"}
            </SortHeading>
          </div>
          {items.map((item) => {
            const feedback = item.feedback[0];
            const label = feedback?.details
              .response as (typeof feedbackResponses)[number];
            return (
              <Link
                key={item.role.id}
                className="ws-role-row"
                href={`/app/roles/${item.role.id}?tab=submissions&returnTo=${encodeURIComponent(href)}`}
                onClick={saveScroll}
              >
                <div>
                  <h2>{item.role.title}</h2>
                  <p>{item.role.client_name}</p>
                  <small className="ws-muted">
                    {item.materials.length}{" "}
                    {zh ? "份推荐材料" : item.materials.length === 1 ? "saved material" : "saved materials"}
                  </small>
                </div>
                <span>
                  {item.recommended_count} {zh ? "人" : item.recommended_count === 1 ? "person" : "people"}
                  {item.events.some(event => event.status === "published") && <small>{zh ? "有已发布链接" : "Active client link"}</small>}
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
              ? "尝试其他关键词或清除筛选条件。"
              : "Try another keyword or clear the filters."}
          </p>
          {search || filter !== "all" ? (
            <button
              className="ws-button"
              onClick={() => update({ q: null, filter: null })}
            >
              {t("Clear filters")}
            </button>
          ) : (
            <Link className="ws-button ws-list-create" href="/app/roles">
              {t("Roles & JDs")}
            </Link>
          )}
        </div>
      )}
      <ListPagination
        page={page}
        total={query.data?.total || 0}
        onPage={(page) => update({ page })}
      />
      {choose && (
        <Dialog
          title={zh ? "为哪个职位准备推荐？" : "Choose a role"}
          onClose={() => setChoose(false)}
        >
          <RecommendationRolePicker />
        </Dialog>
      )}
    </div>
  );
}

function RecommendationRolePicker() {
  const { locale } = useLanguage(),
    zh = locale === "zh";
  const { params, update } = useListState();
  const q = params.get("pickq") || "",
    status = params.get("pickstatus") || "active",
    page = Math.max(1, Number(params.get("pickpage")) || 1);
  const change = (values: Record<string, string | number | null>) =>
    update({ pickpage: null, ...values }, false);
  const query = useQuery<{ roles: Role[]; total: number }>(
    `/roles?${new URLSearchParams({ view: "list", q, status, page: String(page), sort: "updated", direction: "desc" })}`,
  );
  return (
    <div className="ws-picker-content">
      <ListSearch
        value={q}
        onChange={(pickq) => change({ pickq })}
        placeholder={zh ? "搜索职位名称或客户" : "Search roles or clients"}
      />
      <div className="ws-filters">
        <select
          aria-label={zh ? "选择职位状态" : "Choose role status"}
          value={status}
          onChange={(e) => change({ pickstatus: e.target.value })}
        >
          <option value="active">{zh ? "进行中" : "Active"}</option>
          <option value="all">{zh ? "全部职位" : "All roles"}</option>
        </select>
        <span className="ws-count">
          {query.data?.total ?? "—"} {zh ? "个职位" : "roles"}
        </span>
      </div>
      <ErrorNotice error={query.error} retry={query.refresh} />
      <div className="ws-rec-role-picker">
        {query.loading ? (
          <Loading />
        ) : (
          query.data?.roles.map((role) => (
            <Link
              className="ws-detail-link"
              key={role.id}
              href={`/app?role=${role.id}&prompt=${encodeURIComponent(zh ? "请帮我为这个职位准备候选人推荐材料。" : "Help me prepare candidate recommendations for this role.")}`}
            >
              <BriefcaseBusiness size={16} />
              <div>
                <strong>{role.title}</strong>
                <small>{role.client_name}</small>
              </div>
              <ChevronRight size={14} />
            </Link>
          ))
        )}
        {!query.loading && !query.data?.roles.length && (
          <p className="ws-empty">
            {zh
              ? "没有匹配职位，请调整关键词或选择全部职位。"
              : "No matching roles. Try another search or choose all roles."}
          </p>
        )}
      </div>
      <ListPagination
        page={page}
        total={query.data?.total || 0}
        onPage={(pickpage) => change({ pickpage })}
      />
    </div>
  );
}
