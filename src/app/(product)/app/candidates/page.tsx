"use client";

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
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  api,
  date,
  Dialog,
  ErrorNotice,
  Field,
  initials,
  Loading,
  useQuery,
} from "@/components/workspace/client";
import { PersonForm, RecordForm } from "@/components/workspace/forms";
import { History } from "@/components/workspace/history";
import type {
  Job,
  Person,
  Role,
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
function semanticExcerpt(content: string) {
  const source = content.slice(content.indexOf("\n") + 1);
  try {
    const value = JSON.parse(source) as Record<string, unknown>;
    const detail = value.content;
    if (typeof detail === "string") {
      try {
        const fields = JSON.parse(detail) as Record<string, unknown>;
        const readable = Object.entries(fields)
          .filter(([, item]) => typeof item === "string" && item.trim())
          .map(([key, item]) => `${key}: ${item}`)
          .join(" · ");
        return readable || detail;
      } catch {
        return detail;
      }
    }
    return [value.name, value.headline, value.location, value.note, value.profile]
      .concat(Array.isArray(value.skills) ? value.skills : [])
      .filter((item) => typeof item === "string" && item.trim())
      .join(" · ");
  } catch {
    return "";
  }
}
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
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [mode, setMode] = useState(task ? "semantic" : "fields"),
    [location, setLocation] = useState(""),
    [expertise, setExpertise] = useState(""),
    [page, setPage] = useState(1),
    [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const people = useQuery<PeopleResult>(
    `/people?${new URLSearchParams({ q: filter, page: String(page), location, expertise })}`,
  );
  const job = useQuery<{ job: Job }>(task ? `/jobs/${task}` : null);
  useEffect(() => {
    if (!task || job.data?.job.status !== "done") return;
    const result = job.data.job.result as SemanticResult | null;
    setMode("semantic");
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
  const listScroll = useRef(0);
  useEffect(() => {
    window.scrollTo({ top: selected ? 0 : listScroll.current, behavior: "instant" });
  }, [selected]);
  function select(id: string | null, recordId?: string) {
    if (id && !selected) listScroll.current = window.scrollY;
    const next = new URLSearchParams(params.toString());
    if (id) next.set("person", id);
    else next.delete("person");
    next.delete("record");
    if (recordId) next.set("record", recordId);
    if (id && id !== selected) window.history.pushState(null, "", `/app/candidates?${next}`);
    else window.history.replaceState(null, "", `/app/candidates?${next}`);
  }
  async function search(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPage(1);
    if (mode === "fields") {
      setFilter(query);
      const next = new URLSearchParams(params.toString());
      next.delete("task");
      router.replace(`/app/candidates?${next}`, { scroll: false });
      return;
    }
    if (!query.trim()) return;
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
      router.replace(`/app/candidates?task=${result.job.id}`, {
        scroll: false,
      });
    } catch (error) {
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
            ?.last_contact ?? match.last_contact ?? null,
      }))
    : people.data?.people || [];
  const displayCount = semantic ? semantic.matches.length : task ? null : people.data?.total;
  return (
    <div className="ws-page ws-candidates-page" data-detail={!!selected}>
      <header className="ws-page-header">
        <div>
          <h1>{t("Candidates")}</h1>

        </div>
        <div className="ws-actions">
          <Link
            className="ws-button"
            href="/app/candidates/import"
          >
            {t("Import")}
          </Link>
          <button
            className="ws-button ws-button-primary"
            onClick={() => setAdding(true)}
          >
            <Plus size={15} />
            {t("Add candidate")}
          </button>
        </div>
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
            onChange={(event) => setQuery(event.target.value)}
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
            <option value="fields">{t("Names & fields")}</option>
            <option value="semantic">{t("By meaning")}</option>
          </select>
          <input
            aria-label={t("Filter by location")}
            placeholder={t("Location")}
            value={location}
            onChange={(event) => {
              setLocation(event.target.value);
              setPage(1);
            }}
          />
          <input
            aria-label={t("Filter by expertise")}
            placeholder={t("Expertise")}
            value={expertise}
            onChange={(event) => {
              setExpertise(event.target.value);
              setPage(1);
            }}
          />
          {(query || filter || location || expertise || task) && <button type="button" className="ws-link" onClick={() => {
            setQuery(""); setFilter(""); setLocation(""); setExpertise(""); setPage(1); setMode("fields");
            router.replace("/app/candidates", { scroll: false });
          }}>{t("Clear filters")}</button>}
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
            {job.data?.job.progress ? t(job.data.job.progress) : t("Loading search…")} ·{" "}
            <Link className="ws-link" href="/app/tasks">
              {t("View tasks")}
            </Link>
          </Loading>
        )}
      {semantic && (
        <div className="ws-notice">
          {semantic.matches.length} {t("suggestions from")} {semantic.coverage.indexed}{" "}
          {t("of")} {semantic.coverage.total} {t("indexed candidates.")}
          {semantic.coverage.pending > 0
            ? ` ${semantic.coverage.pending} candidates have updates being indexed.`
            : ""}{" "}
          {semantic.coverage.failed > 0
            ? `${semantic.coverage.failed} indexing tasks need attention.`
            : ""}{" "}
          {t("Open a source to check why a person was found. Similarity does not establish fit for a role.")}
        </div>
      )}
      <div className="ws-split" data-selected={!!selected}>
        <section className="ws-list" aria-label={t("Candidate list")}>
          <div className="ws-table-head">
            <span>{t("Name / role")}</span>
            <span className="ws-list-location">{t("Location")}</span>
            <span>{t("Last contact")}</span>
          </div>
          {people.loading && !semantic ? (
            <Loading>{t("Loading candidates…")}</Loading>
          ) : shown.length === 0 ? (
            <div className="ws-empty">
              <h2>
                {filter || location || expertise || semantic
                  ? t("No matching candidates")
                  : t("Start with the people you know.")}
              </h2>
              <p>
                {filter || location || expertise || semantic
                  ? t("Try another name, or search by meaning for experience and past conversations.")
                  : t("Add a person or import your existing records. Their notes and relationships stay with them across roles.")}
              </p>
              <div className="ws-actions">
                <button className="ws-button" onClick={() => setAdding(true)}>
                  {t("Add a candidate")}
                </button>
                <Link
                  className="ws-link"
                  href="/app/candidates/import"
                >
                  {t("Import existing candidates")} <ArrowUpRight size={14} />
                </Link>
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
                      <p className="line-clamp-3">{semanticExcerpt(match.content) || t("Open source")}</p>
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
          {!semantic && people.data && people.data.total > 50 && (
            <div className="ws-pagination">
              <button
                className="ws-icon"
                aria-label={t("Previous page")}
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <span>
                {t("Page")} {page} {t("of")} {Math.ceil(people.data.total / 50)}
              </span>
              <button
                className="ws-icon"
                aria-label={t("Next page")}
                disabled={page * 50 >= people.data.total}
                onClick={() => setPage((value) => value + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </section>
        {selected && <aside className="ws-inspector" aria-label={t("Candidate details")}>
            <button className="ws-link mb-4 ws-split-back" onClick={() => select(null)}><ArrowLeft size={14} />{t("Back to candidates")}</button>
            <CandidateDetails
              key={selected}
              id={selected}
              highlight={highlight}
              onOpenRecord={(recordId) => select(selected, recordId)}
              onClose={() => select(null)}
              onChanged={people.refresh}
            />
        </aside>}
      </div>
      {adding && (
        <PersonForm
          onClose={() => setAdding(false)}
          onSaved={(person) => {
            setAdding(false);
            people.refresh();
            select(person.id);
          }}
        />
      )}
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
  const details = useQuery<Details>(`/people/${id}`),
    allRoles = useQuery<{ roles: Role[] }>("/roles");
  const [tab, setTab] = useState(highlight ? "records" : "overview"),
    [edit, setEdit] = useState(false),
    [record, setRecord] = useState<SourceRecord | "new" | null>(null),
    [history, setHistory] = useState<{
      kind: "person" | "record";
      id: string;
    } | null>(null),
    [linking, setLinking] = useState(false),
    [roleId, setRoleId] = useState(""),
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
  async function link(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/roles/${roleId}/people`, {
        method: "POST",
        body: JSON.stringify({ person_id: id }),
      });
      setLinking(false);
      refresh();
      setTab("roles");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not link candidate",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !details.data ||
      !window.confirm(
        t("Delete this candidate and their source records? Existing client documents and conversations remain as historical work. This cannot be undone."),
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
  const conversation = records.find((item) =>
    ["call", "email"].includes(item.kind),
  );
  const sources = records.filter((item) =>
    ["cv", "profile"].includes(item.kind),
  );
  return (
    <>
      <div className="ws-inspector-heading">
        <div>
          <h1>{person.name}</h1>
          <p>{person.headline || t("No current role recorded")}</p>
          <p>{person.location || t("Location not recorded")}</p>
        </div>
        <div className="ws-actions">
          <button className="ws-button" onClick={() => setEdit(true)}><Pencil size={14} />{t("Edit")}</button>
          <Link className="ws-button ws-button-primary" href={`/app?person=${id}`}>{t("Ask AI assistant")}<ArrowUpRight size={14} /></Link>
        </div>
      </div>
      <div className="ws-tabs" role="tablist" aria-label={t("Candidate sections")}>
        {[
          ["overview", "Overview"],
          ["records", "Conversations & sources"],
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
              <p>{person.profile.summary}</p>
            </section>
          )}
          <section className="ws-section">
            <h3>{t("Latest conversation")}</h3>
            {conversation ? (
              <>
                <small>
                  {date(conversation.occurred_at)} ·{" "}
                  {conversation.kind === "call" ? t("Call note") : t("Email record")}
                </small>
                <p className="mt-2">{conversation.content}</p>
                <button
                  className="ws-link mt-3"
                  onClick={() => {
                    setTab("records");
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
              <p>{person.note}</p>
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
                  <p>{item.description}</p>
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
                    setTab("records");
                    onOpenRecord(source.id);
                  }}
                >
                  <strong>{source.title}</strong>
                  <small>{t("Added")} {date(source.created_at)}</small>
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
            <button className="ws-button" onClick={() => setRecord("new")}>
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
      {tab === "records" && (
        <>
          <div className="ws-actions mt-5 mb-3">
            <button className="ws-button" onClick={() => setRecord("new")}>
              <Plus size={14} />
              {t("Add record")}
            </button>
          </div>
          {records.length ? (
            records.map((item) => (
              <article
                key={item.id}
                id={`record-${item.id}`}
                data-highlight={item.id === highlight}
                className="ws-record"
              >
                <div className="ws-inline-meta">
                  <h4>{item.title}</h4>
                  <span className="ws-tag">{item.kind}</span>
                  <button
                    className="ws-icon ml-auto"
                    aria-label={`Edit ${item.title}`}
                    onClick={() => setRecord(item)}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    className="ws-icon"
                    aria-label={`History of ${item.title}`}
                    onClick={() => setHistory({ kind: "record", id: item.id })}
                  >
                    <HistoryIcon size={13} />
                  </button>
                </div>
                <small>
                  {t("Happened")} {date(item.occurred_at, true)} {t("· Added")}{" "}
                  {date(item.created_at, true)}
                </small>
                <p>{item.content}</p>
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
                  <a
                    className="ws-link mt-3"
                    href={`/api/workspace/files/${item.file_id}`}
                  >
                    {t("Download source file")}
                  </a>
                )}
              </article>
            ))
          ) : (
            <div className="ws-empty">
              <p>
                {t("Keep call notes, messages and source material here. Each record keeps its original date.")}
              </p>
            </div>
          )}
        </>
      )}
      {tab === "roles" && (
        <>
          <div className="ws-actions mt-5">
            <button className="ws-button" onClick={() => setLinking(true)}>
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
                {t("This candidate is not linked to a role yet. Their profile stays available between assignments.")}
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
      {linking && (
        <Dialog
          title={t("Link candidate to a role")}
          onClose={() => setLinking(false)}
        >
          <form className="ws-form" onSubmit={link}>
            <ErrorNotice error={error} />
            <Field label={t("Role")}>
              <select
                required
                value={roleId}
                onChange={(event) => setRoleId(event.target.value)}
              >
                <option value="">{t("Choose a role")}</option>
                {allRoles.data?.roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.title} · {role.client_name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="ws-muted text-xs">
              {t("Linking a person does not confirm interest or permission to share.")}
            </p>
            <div className="ws-form-footer">
              <button
                className="ws-button ws-button-primary"
                disabled={busy || !roleId}
              >
                {busy ? t("Saving…") : t("Link candidate")}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
