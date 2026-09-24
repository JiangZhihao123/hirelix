"use client";
import { useEffect, useState, type FormEvent } from "react";
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
  matches: Array<{
    person: Person;
    person_id: string;
    record_id: string | null;
    content: string;
    source_href: string;
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
  const router = useRouter(),
    params = useSearchParams();
  const selected = params.get("person"),
    task = params.get("task"),
    highlight = params.get("record");
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [mode, setMode] = useState("fields"),
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
    const next = new URLSearchParams(params.toString());
    if (id) next.set("person", id);
    else next.delete("person");
    next.delete("record");
    if (recordId) next.set("record", recordId);
    router.replace(`/app/candidates?${next}`, { scroll: false });
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
    ? semantic.matches.map((match) => ({ ...match.person, last_contact: null }))
    : people.data?.people || [];
  return (
    <div className="ws-page">
      <header className="ws-page-header">
        <div>
          <h1>Candidates</h1>
          <p>People, conversations and context, kept together.</p>
        </div>
        <div className="ws-actions">
          <Link
            className="ws-button"
            href="/app?prompt=Please%20help%20me%20import%20my%20candidates."
          >
            Import
          </Link>
          <button
            className="ws-button ws-button-primary"
            onClick={() => setAdding(true)}
          >
            <Plus size={15} />
            Add candidate
          </button>
        </div>
      </header>
      <form className="ws-toolbar" onSubmit={search}>
        <div className="ws-search">
          <Search size={16} className="ws-muted" />
          <input
            aria-label="Search candidates"
            placeholder={
              mode === "fields"
                ? "Search people, companies or your notes"
                : "Describe the experience or past conversation you remember"
            }
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button className="ws-link" disabled={busy}>
            {busy ? "Starting…" : "Search"}
          </button>
        </div>
        <div className="ws-filters">
          <select
            aria-label="Search method"
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            <option value="fields">Names & fields</option>
            <option value="semantic">By meaning</option>
          </select>
          <input
            aria-label="Filter by location"
            placeholder="Location"
            value={location}
            onChange={(event) => {
              setLocation(event.target.value);
              setPage(1);
            }}
          />
          <input
            aria-label="Filter by expertise"
            placeholder="Expertise"
            value={expertise}
            onChange={(event) => {
              setExpertise(event.target.value);
              setPage(1);
            }}
          />
          <span className="ws-count">
            {people.data
              ? `${people.data.total} ${people.data.total === 1 ? "candidate" : "candidates"}`
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
            {job.data?.job.progress || "Loading search…"} ·{" "}
            <Link className="ws-link" href="/app/tasks">
              View tasks
            </Link>
          </Loading>
        )}
      {semantic && (
        <div className="ws-notice">
          {semantic.matches.length} suggestions from {semantic.coverage.indexed}{" "}
          of {semantic.coverage.total} indexed candidates.
          {semantic.coverage.pending > 0
            ? ` ${semantic.coverage.pending} candidates have updates being indexed.`
            : ""}{" "}
          {semantic.coverage.failed > 0
            ? `${semantic.coverage.failed} indexing tasks need attention.`
            : ""}{" "}
          Open a source to check why a person was found. Similarity does not
          establish fit for a role.
        </div>
      )}
      <div className="ws-split" data-selected={!!selected}>
        <section className="ws-list" aria-label="Candidate list">
          <div className="ws-table-head">
            <span>Name / role</span>
            <span className="ws-list-location">Location</span>
            <span>Last contact</span>
          </div>
          {people.loading && !semantic ? (
            <Loading>Loading candidates…</Loading>
          ) : shown.length === 0 ? (
            <div className="ws-empty">
              <h2>
                {filter
                  ? "No matching candidates"
                  : "Start with the people you know."}
              </h2>
              <p>
                {filter
                  ? "Try another name, or search by meaning for experience and past conversations."
                  : "Add a person or import your existing records. Their notes and relationships stay with them across roles."}
              </p>
              <div className="ws-actions">
                <button className="ws-button" onClick={() => setAdding(true)}>
                  Add a candidate
                </button>
                <Link
                  className="ws-link"
                  href="/app?prompt=Please%20help%20me%20import%20my%20candidates."
                >
                  Import existing candidates <ArrowUpRight size={14} />
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
                    aria-pressed={selected === person.id}
                    onClick={() =>
                      select(person.id, match?.record_id || undefined)
                    }
                  >
                    <span className="ws-person-identity">
                      <span className="ws-avatar">{initials(person.name)}</span>
                      <div>
                        <strong>{person.name}</strong>
                        <small>
                          {person.headline || "No current role recorded"}
                        </small>
                      </div>
                    </span>
                    <span className="ws-list-location ws-muted">
                      {person.location || "—"}
                    </span>
                    <span className="ws-muted">
                      {person.last_contact
                        ? date(person.last_contact)
                        : "Not recorded"}
                    </span>
                  </button>
                  {match && (
                    <div className="ws-notice">
                      <p className="line-clamp-3">{match.content}</p>
                      <button
                        className="ws-link mt-2"
                        onClick={() =>
                          select(person.id, match.record_id || undefined)
                        }
                      >
                        Open source <ArrowUpRight size={13} />
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
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <span>
                Page {page} of {Math.ceil(people.data.total / 50)}
              </span>
              <button
                className="ws-icon"
                aria-label="Next page"
                disabled={page * 50 >= people.data.total}
                onClick={() => setPage((value) => value + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </section>
        <aside className="ws-inspector" aria-label="Candidate details">
          {selected ? (
            <CandidateDetails
              key={selected}
              id={selected}
              highlight={highlight}
              onClose={() => select(null)}
              onChanged={people.refresh}
            />
          ) : (
            <div className="ws-empty">
              <h2>A complete picture, over time.</h2>
              <p>
                Select a candidate to see their profile, original notes, and the
                roles you have discussed with them.
              </p>
            </div>
          )}
        </aside>
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
  onClose,
  onChanged,
}: {
  id: string;
  highlight: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
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
        "Delete this candidate and their source records? Existing client documents and conversations remain as historical work. This cannot be undone.",
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
  if (details.loading) return <Loading>Opening candidate…</Loading>;
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
      <button className="ws-link mb-4 ws-mobile-only" onClick={onClose}>
        <ArrowLeft size={14} />
        Back to candidates
      </button>
      <div className="ws-inspector-heading">
        <div>
          <h2>{person.name}</h2>
          <p>{person.headline || "No current role recorded"}</p>
          <p>{person.location || "Location not recorded"}</p>
        </div>
        <button className="ws-link" onClick={() => setEdit(true)}>
          <Pencil size={13} />
          Edit
        </button>
      </div>
      <div className="ws-tabs" role="tablist" aria-label="Candidate sections">
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
            {label}
          </button>
        ))}
      </div>
      <ErrorNotice error={error} />
      {tab === "overview" && (
        <>
          {person.profile?.summary && (
            <section className="ws-section">
              <h3>Profile</h3>
              <p>{person.profile.summary}</p>
            </section>
          )}
          <section className="ws-section">
            <h3>Latest conversation</h3>
            {conversation ? (
              <>
                <small>
                  {date(conversation.occurred_at)} ·{" "}
                  {conversation.kind === "call" ? "Call note" : "Email record"}
                </small>
                <p className="mt-2">{conversation.content}</p>
                <button
                  className="ws-link mt-3"
                  onClick={() => setTab("records")}
                >
                  View original record
                </button>
              </>
            ) : (
              <p className="ws-muted">No conversation recorded yet.</p>
            )}
          </section>
          {person.note && (
            <section className="ws-section">
              <h3>Your private note</h3>
              <p>{person.note}</p>
            </section>
          )}
          {(person.skills || []).length > 0 && (
            <section className="ws-section">
              <h3>Expertise</h3>
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
              <h3>Experience</h3>
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
            <h3>Sources</h3>
            {sources.length ? (
              sources.map((source) => (
                <button
                  className="ws-detail-link text-left w-full"
                  key={source.id}
                  onClick={() => setTab("records")}
                >
                  <strong>{source.title}</strong>
                  <small>Added {date(source.created_at)}</small>
                </button>
              ))
            ) : (
              <p className="ws-muted">No CV or profile source added.</p>
            )}
            {person.profile_url && (
              <a
                className="ws-link mt-3"
                href={person.profile_url}
                target="_blank"
                rel="noreferrer"
              >
                Open profile <ArrowUpRight size={13} />
              </a>
            )}
          </section>
          {(person.email || person.phone) && (
            <section className="ws-section">
              <h3>Contact</h3>
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
              Add record
            </button>
            <button
              className="ws-link"
              onClick={() => setHistory({ kind: "person", id })}
            >
              <HistoryIcon size={14} />
              History
            </button>
          </div>
          <Link
            className="ws-button ws-button-primary mt-4 w-full"
            href={`/app?person=${id}`}
          >
            Ask about {person.name.split(" ")[0]} <ArrowUpRight size={14} />
          </Link>
        </>
      )}
      {tab === "records" && (
        <>
          <div className="ws-actions mt-5 mb-3">
            <button className="ws-button" onClick={() => setRecord("new")}>
              <Plus size={14} />
              Add record
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
                  Happened {date(item.occurred_at, true)} · Added{" "}
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
                    Original source <ArrowUpRight size={13} />
                  </a>
                )}
                {item.file_id && (
                  <a
                    className="ws-link mt-3"
                    href={`/api/workspace/files/${item.file_id}`}
                  >
                    Download source file
                  </a>
                )}
              </article>
            ))
          ) : (
            <div className="ws-empty">
              <p>
                Keep call notes, messages and source material here. Each record
                keeps its original date.
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
              Link to a role
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
                  Sharing permission:{" "}
                  {role.permission === "unknown"
                    ? "not confirmed"
                    : role.permission}
                </small>
                {role.interest && <small>{role.interest}</small>}
              </Link>
            ))
          ) : (
            <div className="ws-empty">
              <p>
                This candidate is not linked to a role yet. Their profile stays
                available between assignments.
              </p>
            </div>
          )}
        </>
      )}
      <div className="ws-actions mt-8 border-t border-border pt-4">
        <a className="ws-link" href={`/api/workspace/people/${id}/export`}>
          Export profile & records
        </a>
        <button className="ws-link ml-auto" disabled={busy} onClick={remove}>
          Delete candidate
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
          title="Link candidate to a role"
          onClose={() => setLinking(false)}
        >
          <form className="ws-form" onSubmit={link}>
            <ErrorNotice error={error} />
            <Field label="Role">
              <select
                required
                value={roleId}
                onChange={(event) => setRoleId(event.target.value)}
              >
                <option value="">Choose a role</option>
                {allRoles.data?.roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.title} · {role.client_name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="ws-muted text-xs">
              Linking a person does not confirm interest or permission to share.
            </p>
            <div className="ws-form-footer">
              <button
                className="ws-button ws-button-primary"
                disabled={busy || !roleId}
              >
                {busy ? "Saving…" : "Link candidate"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
