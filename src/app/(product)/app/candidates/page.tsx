"use client";
import { FeedbackSource } from "@/components/workspace/feedback-source";
import { semanticExcerpt } from "@/lib/workspace/search-excerpt";

import { recordLocalDate } from "@/lib/workspace/record-dates";
import { ProfileText } from "@/components/workspace/profile-text";
import { SourceContent } from "@/components/workspace/source-content";

import { useLanguage, useT } from "@/components/LanguageProvider";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Plus,
  Pencil,
  ArrowLeft,
  ArrowUpRight,
  History as HistoryIcon,
} from "lucide-react";
import {
  api,
  date,
  ErrorNotice,
  initials,
  Loading,
  useQuery,
} from "@/components/workspace/client";
import {
  FilterInput,
  ListPagination,
  SortHeading,
  useListState,
  useListScroll,
} from "@/components/workspace/list-controls";
import { PersonForm, RecordForm } from "@/components/workspace/forms";
import { History } from "@/components/workspace/history";
import type {
  Job,
  Person,
  RoleCandidate,
  SourceRecord,
} from "@/lib/workspace/types";

type ListedPerson = Person & { last_contact: string | null };
type PeopleResult = {
  people: ListedPerson[];
  total: number;
  page: number;
  page_size: number;
};
type SemanticResult = {
  query?: string;
  matches: Array<{
    person: Person;
    person_id: string;
    record_id: string | null;
    content: string;
    source_href: string;
    last_contact?: string | null;
  }>;
  coverage: { total: number; indexed: number; pending: number; failed: number };
  scope: string;
};

type Details = {
  person: Person;
  records: SourceRecord[];
  roles: Array<
    RoleCandidate & {
      title: string;
      client_name: string;
      current_role_version: number;
    }
  >;
};
export default function Candidates() {
  const t = useT();
  const { locale } = useLanguage();
  const router = useRouter(),
    params = useSearchParams();
  const selected = params.get("person"),
    task = params.get("task"),
    highlight = params.get("record");
  const { update } = useListState();
  const filter = params.get("q") || "",
    mode = params.get("mode") || (task ? "semantic" : "fields"),
    location = params.get("location") || "",
    expertise = params.get("expertise") || "",
    page = Math.max(1, Number(params.get("page")) || 1),
    sort = params.get("sort") || "updated",
    direction = params.get("direction") || "desc";
  const [query, setQuery] = useState(filter),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => setQuery(filter), [filter]);
  const searchVersion = useRef(0);
  const changeSearch = (values: Record<string, string | number | null>) => {
    searchVersion.current += 1;
    update({ ...values, task: null });
  };
  const setMode = (mode: string) => changeSearch({ mode });
  const setPage = (page: number) => update({ page });
  const onSort = (sort: string, direction: string) =>
    update({ sort, direction });
  const people = useQuery<PeopleResult>(
    mode === "semantic"
      ? null
      : `/people?${new URLSearchParams({ q: filter, page: String(page), location, expertise, sort, direction })}`,
  );
  const facets = useQuery<{ locations: string[]; skills: string[] }>(
    "/people?view=filters",
  );
  const listParams = new URLSearchParams(params.toString());
  for (const key of ["person", "record", "tab"]) listParams.delete(key);
  const saveScroll = useListScroll(
    `/app/candidates?${listParams}`,
    !selected && !people.loading,
  );
  const job = useQuery<{ job: Job }>(task ? `/jobs/${task}` : null);
  useEffect(() => {
    if (!task || job.data?.job.status !== "done") return;
    const result = job.data.job.result as SemanticResult | null;
    if (result?.query) setQuery(result.query);
  }, [task, job.data]);
  useEffect(() => {
    if (
      !task ||
      !job.data ||
      !["queued", "running"].includes(job.data.job.status)
    )
      return;
    const timer = setInterval(job.refresh, 1500);
    return () => clearInterval(timer);
  }, [task, job.data, job.refresh]);
  function select(id: string | null, recordId?: string) {
    if (id && !selected) {
      saveScroll();
      window.scrollTo(0, 0);
    }
    const next = new URLSearchParams(params.toString());
    if (id) next.set("person", id);
    else next.delete("person");
    next.delete("record");
    if (id !== selected) next.delete("tab");
    if (recordId) {
      next.set("record", recordId);
      next.set("tab", "records");
    }
    if (id && id !== selected)
      window.history.pushState(null, "", `/app/candidates?${next}`);
    else window.history.replaceState(null, "", `/app/candidates?${next}`);
  }
  async function search(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (mode === "fields") {
      update({ q: query, task: null });
      return;
    }
    if (!query.trim()) return;
    const version = ++searchVersion.current;
    update({ task: null });
    setBusy(true);
    try {
      const result = await api<{ job: Job }>("/jobs", {
        method: "POST",
        body: JSON.stringify({
          kind: "retrieval",
          request_key: crypto.randomUUID(),
          payload: { query, location, expertise, limit: 30 },
        }),
      });
      if (version === searchVersion.current)
        update({ q: query, task: result.job.id, mode: "semantic" });
    } catch (error) {
      if (version === searchVersion.current)
        setError(
          error instanceof Error ? error.message : "Could not start search",
        );
    } finally {
      setBusy(false);
    }
  }
  const semantic =
    task && job.data?.job.status === "done"
      ? (job.data.job.result as SemanticResult | null)
      : null;
  const shown = semantic
    ? semantic.matches.map((match) => ({
        ...match.person,
        last_contact:
          people.data?.people.find((person) => person.id === match.person_id)
            ?.last_contact ??
          match.last_contact ??
          null,
      }))
    : people.data?.people || [];
  const displayCount = semantic
    ? semantic.matches.length
    : task
      ? null
      : people.data?.total;
  return (
    <div className="ws-page ws-candidates-page" data-detail={!!selected}>
      <header className="ws-page-header">
        <div>
          <h1>{t("Candidates & CVs")}</h1>
        </div>
        <Link
          className="ws-button ws-list-create"
          href={`/app?prompt=${encodeURIComponent(t("Help me organize these candidate files into my workspace."))}`}
        >
          <Plus size={15} />
          {t("Add candidate")}
        </Link>
      </header>
      <form className="ws-toolbar" onSubmit={search}>
        <div className="ws-search">
          <Search size={16} className="ws-muted" />
          <input
            id="candidate-search"
            aria-label={t("Search candidates")}
            placeholder={
              mode === "fields"
                ? t("Search people, companies or your notes")
                : t("Describe the experience or past conversation you remember")
            }
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (mode === "semantic") changeSearch({ q: event.target.value });
            }}
          />
          <button className="ws-link" disabled={busy}>
            {busy ? t("Starting…") : t("Search")}
          </button>
        </div>
        <div className="ws-filters">
          <select
            aria-label={t("Search method")}
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            <option value="fields">
              {locale === "zh" ? "关键词搜索" : "Keyword search"}
            </option>
            <option value="semantic">
              {locale === "zh" ? "描述经历找人" : "Search by experience"}
            </option>
          </select>
          <FilterInput
            label={t("Filter by location")}
            placeholder={t("Location")}
            list="candidate-locations"
            value={location}
            debounceMs={mode === "semantic" ? 0 : 300}
            onChange={(location) => changeSearch({ location })}
          />
          <FilterInput
            label={t("Filter by expertise")}
            placeholder={t("Expertise")}
            list="candidate-skills"
            value={expertise}
            debounceMs={mode === "semantic" ? 0 : 300}
            onChange={(expertise) => changeSearch({ expertise })}
          />
          <datalist id="candidate-locations">
            {facets.data?.locations.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          <datalist id="candidate-skills">
            {facets.data?.skills.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          {mode === "fields" && (
            <>
              <select
                aria-label={locale === "zh" ? "排序字段" : "Sort by"}
                value={sort}
                onChange={(e) =>
                  onSort(
                    e.target.value,
                    e.target.value === "name" ? "asc" : "desc",
                  )
                }
              >
                {[
                  ["updated", locale === "zh" ? "最近更新" : "Updated"],
                  ["created", locale === "zh" ? "最近添加" : "Added"],
                  ["name", locale === "zh" ? "姓名" : "Name"],
                  ["contact", locale === "zh" ? "最近联系" : "Last contact"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="ws-button"
                aria-label={
                  locale === "zh" ? "切换排序方向" : "Reverse sort order"
                }
                onClick={() =>
                  onSort(sort, direction === "asc" ? "desc" : "asc")
                }
              >
                {direction === "asc" ? "↑" : "↓"}
              </button>
            </>
          )}
          {(query || filter || location || expertise || task) && (
            <button
              type="button"
              className="ws-link"
              onClick={() => {
                setQuery("");
                changeSearch({
                  q: null,
                  location: null,
                  expertise: null,
                  task: null,
                  mode: null,
                });
              }}
            >
              {t("Clear filters")}
            </button>
          )}
          <span className="ws-count">
            {displayCount != null
              ? locale === "zh"
                ? `${displayCount} 位候选人`
                : `${displayCount} ${displayCount === 1 ? "candidate" : "candidates"}`
              : ""}
          </span>
        </div>
      </form>
      <ErrorNotice
        error={error || people.error || job.error}
        retry={people.refresh}
      />
      {task && job.data?.job.status === "error" && (
        <ErrorNotice
          error={job.data.job.error || "Search failed"}
          retry={() =>
            void api(`/jobs/${task}`, { method: "POST" })
              .then(job.refresh)
              .catch((error) => setError(error.message))
          }
        />
      )}
      {task &&
        (!job.data || ["queued", "running"].includes(job.data.job.status)) && (
          <Loading>
            {job.data?.job.progress
              ? t(job.data.job.progress)
              : t("Loading search…")}
          </Loading>
        )}
      {semantic && (
        <div className="ws-notice">
          {semantic.matches.length} {locale !== "zh" && semantic.matches.length === 1 ? "suggestion from" : t("suggestions from")}{" "}
          {semantic.coverage.indexed} {t("of")} {semantic.coverage.total}{" "}
          {t("indexed candidates.")}
          {semantic.coverage.pending > 0
            ? ` ${semantic.coverage.pending} candidates have updates being indexed.`
            : ""}{" "}
          {semantic.coverage.failed > 0
            ? `${semantic.coverage.failed} indexing tasks need attention.`
            : ""}{" "}
          {t(
            "Open a source to check why a person was found. Similarity does not establish fit for a role.",
          )}
        </div>
      )}
      <div className="ws-split" data-selected={!!selected}>
        <section className="ws-list" aria-label={t("Candidate list")}>
          <div className="ws-table-head">
            {mode === "semantic" ? (
              <span>{t("Name / role")}</span>
            ) : (
              <SortHeading field="name" {...{ sort, direction, onSort }}>
                {t("Name / role")}
              </SortHeading>
            )}
            <span className="ws-list-location">{t("Location")}</span>
            {mode === "semantic" ? (
              <span>{t("Last contact")}</span>
            ) : (
              <SortHeading field="contact" {...{ sort, direction, onSort }}>
                {t("Last contact")}
              </SortHeading>
            )}
          </div>
          {mode === "semantic" && !semantic ? (
            <div className="ws-empty">
              <p>
                {locale === "zh"
                  ? "输入经历描述并点击搜索。调整条件后请重新搜索。"
                  : "Describe experience and run Search. Search again after changing filters."}
              </p>
            </div>
          ) : people.loading && !semantic ? (
            <Loading>{t("Loading candidates…")}</Loading>
          ) : shown.length === 0 ? (
            <div className="ws-empty">
              <h2>
                {filter || location || expertise || semantic
                  ? t("No matching candidates")
                  : t("Start with the people you know.")}
              </h2>
              <p>
                {mode === "semantic"
                  ? locale === "zh" ? "试试更宽泛的经历描述，或清除地点和专业条件后重新搜索。" : "Try a broader experience description, or clear the location and expertise filters and search again."
                  : filter || location || expertise
                  ? t(
                      "Try another name, or search by meaning for experience and past conversations.",
                    )
                  : t(
                      "Give your assistant a CV, conversation notes or candidate details. It will organize and save the supported facts.",
                    )}
              </p>
              <div className="ws-actions">
                <button
                  className="ws-button"
                  onClick={() =>
                    router.push(
                      `/app?prompt=${encodeURIComponent(t("Save candidate details I provide in this conversation."))}`,
                    )
                  }
                >
                  {t("Add a candidate")}
                </button>
              </div>
            </div>
          ) : (
            shown.map((person) => {
              const match = semantic?.matches.find(
                (item) => item.person_id === person.id,
              );
              return (
                <div key={person.id}>
                  <button
                    className="ws-person-row"
                    onClick={() =>
                      select(person.id, match?.record_id || undefined)
                    }
                  >
                    <span className="ws-person-identity">
                      <span className="ws-avatar">{initials(person.name)}</span>
                      <div>
                        <strong>{person.name}</strong>
                        <small>
                          {person.headline || t("No current role recorded")}
                        </small>
                      </div>
                    </span>
                    <span className="ws-list-location ws-muted">
                      {person.location || "—"}
                    </span>
                    <span className="ws-muted">
                      {person.last_contact
                        ? date(person.last_contact)
                        : t("Not recorded")}
                    </span>
                  </button>
                  {match && (
                    <div className="ws-notice">
                      <p className="line-clamp-3">
                        {semanticExcerpt(match.content) || t("Open source")}
                      </p>
                      <button
                        className="ws-link mt-2"
                        onClick={() =>
                          select(person.id, match.record_id || undefined)
                        }
                      >
                        {t("Open source")} <ArrowUpRight size={13} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
          {!semantic && (
            <ListPagination
              page={page}
              total={people.data?.total || 0}
              onPage={setPage}
            />
          )}
        </section>
        {selected && (
          <aside className="ws-inspector" aria-label={t("Candidate details")}>
            <button
              className="ws-link mb-4 ws-split-back"
              onClick={() => select(null)}
            >
              <ArrowLeft size={14} />
              {t("Back to candidates")}
            </button>
            <CandidateDetails
              key={selected}
              id={selected}
              highlight={highlight}
              onOpenRecord={(recordId) => select(selected, recordId)}
              onClose={() => select(null)}
              onChanged={people.refresh}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
function CandidateDetails({
  id,
  highlight,
  onOpenRecord,
  onClose,
  onChanged,
}: {
  id: string;
  highlight: string | null;
  onOpenRecord: (recordId: string) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const details = useQuery<Details>(`/people/${id}`);
  const router = useRouter();
  const { locale } = useLanguage();
  function ask(prompt: string) {
    router.push(`/app?person=${id}&prompt=${encodeURIComponent(prompt)}`);
  }
  const params = useSearchParams();
  const requestedTab = params.get("tab");
  const highlightedRecord = details.data?.records.find(
    (item) => item.id === highlight,
  );
  const isSource = (item: SourceRecord) =>
    ["cv", "profile", "jd"].includes(item.kind);
  const tab = highlightedRecord
    ? isSource(highlightedRecord)
      ? "sources"
      : "records"
    : requestedTab &&
        ["overview", "records", "sources", "roles"].includes(requestedTab)
      ? requestedTab
      : "overview";
  function setTab(value: string) {
    const next = new URLSearchParams(params.toString());
    next.set("tab", value);
    next.delete("record");
    window.history.pushState(null, "", `/app/candidates?${next}`);
  }
  const [edit, setEdit] = useState(false),
    [record, setRecord] = useState<SourceRecord | "new" | null>(null),
    [history, setHistory] = useState<{
      kind: "person" | "record";
      id: string;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!highlight || details.loading) return;
    const element = document.getElementById(`record-${highlight}`);
    element?.scrollIntoView({ block: "nearest" });
  }, [highlight, details.loading, tab]);
  function refresh() {
    details.refresh();
    onChanged();
  }
  async function remove() {
    if (
      !details.data ||
      !window.confirm(
        t(
          "Delete this candidate and their source records? Existing client documents and conversations remain as historical work. This cannot be undone.",
        ),
      )
    )
      return;
    setBusy(true);
    try {
      await api(`/people/${id}`, {
        method: "DELETE",
        body: JSON.stringify({ expected_version: details.data.person.version }),
      });
      onChanged();
      onClose();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not delete candidate",
      );
    } finally {
      setBusy(false);
    }
  }
  if (details.loading) return <Loading>{t("Opening candidate…")}</Loading>;
  if (details.error || !details.data)
    return (
      <ErrorNotice
        error={details.error || "Candidate unavailable"}
        retry={details.refresh}
      />
    );
  const { person, records, roles } = details.data;
  const sources = records.filter(isSource);
  const communications = records.filter((item) => !isSource(item));
  const conversation = communications[0];
  const recordKinds = {
    cv: "CV / resume",
    jd: "Job description",
    profile: "Profile",
    event: "Event",
    note: "Note",
    call: "Call",
    email: "Email",
    feedback: "Feedback",
  };
  const recordTitle = (title: string) =>
    ["Candidate profile update", "Candidate profile source"].includes(title)
      ? t(title)
      : title;
  const visibleRecords = tab === "sources" ? sources : communications;
  return (
    <>
      <div className="ws-inspector-heading">
        <div>
          <h1>{person.name}</h1>
          <p>{person.headline || t("No current role recorded")}</p>
          <p>{person.location || t("Location not recorded")}</p>
        </div>
        <div className="ws-actions">
          <button className="ws-button" onClick={() => setEdit(true)}>
            <Pencil size={14} />
            {t("Edit")}
          </button>
          <Link
            className="ws-button ws-button-primary"
            href={`/app?person=${id}`}
          >
            {t("Ask your AI assistant")}
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
      <div
        className="ws-tabs"
        role="tablist"
        aria-label={t("Candidate sections")}
      >
        {[
          ["overview", "Overview"],
          ["records", "Communication records"],
          ["sources", "Resumes & sources"],
          ["roles", "Related roles"],
        ].map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <ErrorNotice error={error} />
      {tab === "overview" && (
        <>
          {person.profile?.summary && (
            <section className="ws-section">
              <h3>{t("Profile")}</h3>
              <ProfileText text={person.profile.summary} />
            </section>
          )}
          <section className="ws-section">
            <h3>{t("Latest record")}</h3>
            {conversation ? (
              <>
                <small>
                  {conversation.occurred_at
                    ? date(conversation.occurred_at)
                    : recordLocalDate(conversation, "UTC") || "—"}{" "}
                  · {t(recordKinds[conversation.kind])}
                </small>
                <ProfileText text={conversation.content} />
                <button
                  className="ws-link mt-3"
                  onClick={() => {
                    onOpenRecord(conversation.id);
                  }}
                >
                  {t("View original record")}
                </button>
              </>
            ) : (
              <p className="ws-muted">{t("No conversation recorded yet.")}</p>
            )}
          </section>
          {person.note && (
            <section className="ws-section">
              <h3>{t("Your private note")}</h3>
              <ProfileText text={person.note} />
            </section>
          )}
          {(person.skills || []).length > 0 && (
            <section className="ws-section">
              <h3>{t("Expertise")}</h3>
              <div className="ws-tags">
                {person.skills.map((skill, index) => (
                  <span className="ws-tag" key={`${skill}-${index}`}>
                    {skill}
                  </span>
                ))}
              </div>
            </section>
          )}
          {(person.profile?.experience || []).length > 0 && (
            <section className="ws-section">
              <h3>{t("Experience")}</h3>
              {person.profile.experience.map((item, index) => (
                <div className="ws-record" key={index}>
                  <h4>
                    {item.title} · {item.company}
                  </h4>
                  <small>{item.dates}</small>
                  {item.description && (
                    <details className="mt-2">
                      <summary className="ws-link cursor-pointer">{t("Experience details")}</summary>
                      <p className="whitespace-pre-line">{item.description}</p>
                    </details>
                  )}
                </div>
              ))}
            </section>
          )}
          <section className="ws-section">
            <h3>{t("Sources")}</h3>
            {sources.length ? (
              sources.map((source) => (
                <button
                  className="ws-detail-link text-left w-full"
                  key={source.id}
                  onClick={() => {
                    onOpenRecord(source.id);
                  }}
                >
                  <strong>{recordTitle(source.title)}</strong>
                  <small>
                    {t("Added")} {date(source.created_at)}
                  </small>
                </button>
              ))
            ) : (
              <p className="ws-muted">{t("No CV or profile source added.")}</p>
            )}
            {person.profile_url && (
              <a
                className="ws-link mt-3"
                href={person.profile_url}
                target="_blank"
                rel="noreferrer"
              >
                {t("Open profile")} <ArrowUpRight size={13} />
              </a>
            )}
          </section>
          {(person.email || person.phone) && (
            <section className="ws-section">
              <h3>{t("Contact")}</h3>
              {person.email && (
                <p>
                  <a className="ws-link" href={`mailto:${person.email}`}>
                    {person.email}
                  </a>
                </p>
              )}
              {person.phone && <p>{person.phone}</p>}
            </section>
          )}
          <div className="ws-actions mt-5">
            <button
              className="ws-button"
              onClick={() =>
                ask(
                  locale === "zh"
                    ? `记录与 ${person.name} 的沟通：\n`
                    : `Record my conversation with ${person.name}:\n`,
                )
              }
            >
              <Plus size={14} />
              {t("Add record")}
            </button>
            <button
              className="ws-link"
              onClick={() => setHistory({ kind: "person", id })}
            >
              <HistoryIcon size={14} />
              {t("History")}
            </button>
          </div>
        </>
      )}
      {(tab === "records" || tab === "sources") && (
        <section className="ws-candidate-records">
          <div className="ws-candidate-records-intro">
            <p>
              {t(
                tab === "sources"
                  ? "Original resumes and profile sources. Open a file to check the evidence."
                  : "Calls, messages, interview notes and feedback about this candidate.",
              )}
            </p>
            {tab === "records" && (
              <div className="ws-actions">
                <button
                  className="ws-button"
                  onClick={() =>
                    ask(
                      locale === "zh"
                        ? `记录与 ${person.name} 的沟通：\n`
                        : `Record my conversation with ${person.name}:\n`,
                    )
                  }
                >
                  <Plus size={14} />
                  {t("Add record")}
                </button>
              </div>
            )}
          </div>
          {visibleRecords.length ? (
            visibleRecords.map((item) => (
              <article
                key={item.id}
                id={`record-${item.id}`}
                data-highlight={item.id === highlight}
                className="ws-record"
              >
                <div className="ws-inline-meta">
                  <h4>{recordTitle(item.title)}</h4>
                  <span className="ws-tag">{t(recordKinds[item.kind])}</span>
                  <button
                    className="ws-icon ml-auto"
                    aria-label={`${t("Edit")} ${recordTitle(item.title)}`}
                    onClick={() => setRecord(item)}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    className="ws-icon"
                    aria-label={`${t("History")} · ${recordTitle(item.title)}`}
                    onClick={() => setHistory({ kind: "record", id: item.id })}
                  >
                    <HistoryIcon size={13} />
                  </button>
                </div>
                <small>
                  {tab === "records" && (
                    <>
                      {t("Happened")}{" "}
                      {item.occurred_at
                        ? date(item.occurred_at, true)
                        : recordLocalDate(item, "UTC") ||
                          t("Date not recorded")}{" "}
                      ·{" "}
                    </>
                  )}
                  {t("Added")} {date(item.created_at, true)}
                </small>
                <FeedbackSource record={item} />
                {tab === "sources" ? (
                  <details className="ws-source-extracted">
                    <summary>{t("View extracted text")}</summary>
                    <SourceContent content={item.content} />
                  </details>
                ) : (
                  <SourceContent content={item.content} />
                )}
                {item.source_url && (
                  <a
                    className="ws-link mt-3"
                    href={item.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("Original source")} <ArrowUpRight size={13} />
                  </a>
                )}
                {item.file_id && (
                  <div className="ws-actions mt-3">
                    <a
                      className="ws-link"
                      href={`/api/workspace/files/${item.file_id}?preview=1`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("Open original file")} <ArrowUpRight size={13} />
                    </a>
                    <a
                      className="ws-link"
                      href={`/api/workspace/files/${item.file_id}`}
                      download
                    >
                      {t("Download source file")}
                    </a>
                  </div>
                )}
              </article>
            ))
          ) : (
            <div className="ws-empty">
              <p>
                {t(
                  tab === "sources"
                    ? "No CV or profile source added."
                    : "No conversation recorded yet.",
                )}
              </p>
            </div>
          )}
        </section>
      )}
      {tab === "roles" && (
        <>
          <div className="ws-actions mt-5">
            <button
              className="ws-button"
              onClick={() =>
                ask(
                  locale === "zh"
                    ? "帮我把这位候选人关联到一个职位。"
                    : "Help me link this candidate to a role.",
                )
              }
            >
              <Plus size={14} />
              {t("Link to a role")}
            </button>
          </div>
          {roles.length ? (
            roles.map((role) => (
              <Link
                className="ws-detail-link"
                key={role.role_id}
                href={`/app/roles/${role.role_id}`}
              >
                <strong>{role.title}</strong>
                <small>{role.client_name}</small>
                <small>
                  {t("Sharing permission:")}{" "}
                  {role.permission === "unknown"
                    ? t("not confirmed")
                    : t(role.permission)}
                </small>
                {role.interest && <small>{role.interest}</small>}
              </Link>
            ))
          ) : (
            <div className="ws-empty">
              <p>
                {t(
                  "This candidate is not linked to a role yet. Their profile stays available between assignments.",
                )}
              </p>
            </div>
          )}
        </>
      )}
      <div className="ws-actions mt-8 border-t border-border pt-4">
        <a className="ws-link" href={`/api/workspace/people/${id}/export`}>
          {t("Export profile & records")}
        </a>
        <button className="ws-link ml-auto" disabled={busy} onClick={remove}>
          {t("Delete candidate")}
        </button>
      </div>
      {edit && (
        <PersonForm
          person={person}
          onClose={() => setEdit(false)}
          onSaved={() => {
            setEdit(false);
            refresh();
          }}
        />
      )}
      {record && (
        <RecordForm
          personId={id}
          record={record === "new" ? undefined : record}
          onClose={() => setRecord(null)}
          onSaved={() => {
            setRecord(null);
            refresh();
          }}
        />
      )}
      {history && <History {...history} onClose={() => setHistory(null)} />}
    </>
  );
}
