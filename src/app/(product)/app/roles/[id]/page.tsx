"use client";
import { use, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Plus,
  Pencil,
  History as HistoryIcon,
  Pause,
  Play,
  Check,
  Loader2,
} from "lucide-react";
import {
  api,
  date,
  Dialog,
  ErrorNotice,
  Field,
  Loading,
  useQuery,
} from "@/components/workspace/client";
import { RoleForm, RecordForm } from "@/components/workspace/forms";
import { History } from "@/components/workspace/history";
import { AgentText } from "@/components/AgentText";
import type {
  Deliverable,
  Job,
  Person,
  Role,
  RoleCandidate,
  Schedule,
  SourceRecord,
} from "@/lib/workspace/types";

type Detail = {
  role: Role;
  people: RoleCandidate[];
  records: SourceRecord[];
  deliverables: Deliverable[];
  schedule: Schedule | null;
};
type Assessment = {
  decision: string;
  summary: string;
  strengths: Array<{
    text: string;
    record_ids: string[];
    from_profile: boolean;
  }>;
  gaps: Array<{ text: string; record_ids: string[]; from_profile: boolean }>;
  questions: string[];
  unconfirmed: string[];
  scope: string;
  person_version: number;
};
export default function RolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const paramsQuery = useSearchParams();
  const query = useQuery<Detail>(`/roles/${id}`),
    pool = useQuery<{ people: Person[] }>("/people");
  const [tab, setTab] = useState(paramsQuery.get("tab") || "brief"),
    [edit, setEdit] = useState(false),
    [history, setHistory] = useState(false),
    [record, setRecord] = useState<SourceRecord | "new" | null>(null),
    [linking, setLinking] = useState(false),
    [personId, setPersonId] = useState(""),
    [personFilter, setPersonFilter] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [assessment, setAssessment] = useState<RoleCandidate | null>(null),
    [permission, setPermission] = useState<RoleCandidate | null>(null),
    [jobId, setJobId] = useState<string | null>(null);
  const job = useQuery<{ job: Job }>(jobId ? `/jobs/${jobId}` : null),
    filteredPool = useQuery<{ people: Person[] }>(
      personFilter ? `/people?q=${encodeURIComponent(personFilter)}` : null,
    );
  const refreshRole = query.refresh;
  useEffect(() => {
    if (!jobId || !job.data) return;
    if (["queued", "running"].includes(job.data.job.status)) {
      const timer = setInterval(job.refresh, 1500);
      return () => clearInterval(timer);
    }
    if (job.data.job.status === "done") refreshRole();
  }, [jobId, job.data, job.refresh, refreshRole]);
  async function changeStatus(status: Role["status"]) {
    if (!query.data) return;
    setBusy(true);
    setError("");
    try {
      await api(`/roles/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...query.data.role,
          status,
          expected_version: query.data.role.version,
        }),
      });
      query.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not change role status",
      );
    } finally {
      setBusy(false);
    }
  }
  async function link(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/roles/${id}/people`, {
        method: "POST",
        body: JSON.stringify({ person_id: personId }),
      });
      setLinking(false);
      query.refresh();
      setTab("candidates");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not link candidate",
      );
    } finally {
      setBusy(false);
    }
  }
  async function assess(personId: string) {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ job: Job }>("/jobs", {
        method: "POST",
        body: JSON.stringify({
          kind: "assessment",
          request_key: crypto.randomUUID(),
          payload: { role_id: id, person_id: personId },
        }),
      });
      setJobId(result.job.id);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not start assessment",
      );
    } finally {
      setBusy(false);
    }
  }
  if (query.loading && !query.data)
    return (
      <div className="ws-page">
        <Loading>Opening role…</Loading>
      </div>
    );
  if (!query.data)
    return (
      <div className="ws-page">
        <ErrorNotice error={query.error} retry={query.refresh} />
      </div>
    );
  const { role, people, records, deliverables } = query.data,
    submissions = deliverables.filter((item) => item.kind === "submission");
  return (
    <div className="ws-page">
      <header className="ws-page-header">
        <div>
          <Link className="ws-link mb-4" href="/app/roles">
            <ArrowLeft size={13} />
            Roles
          </Link>
          <div className="ws-actions">
            <h1>{role.title}</h1>
            <span className="ws-status" data-status={role.status}>
              {role.status}
            </span>
          </div>
          <p>
            {role.client_name || "Client not recorded"}
            {role.client_contact?.location
              ? ` · ${role.client_contact.location}`
              : ""}
          </p>
        </div>
        <div className="ws-actions">
          <button className="ws-button" onClick={() => setEdit(true)}>
            <Pencil size={14} />
            Edit role
          </button>
          <Link
            className="ws-button ws-button-primary"
            href={`/app/roles/${id}/updates/new`}
          >
            Prepare search update
          </Link>
        </div>
      </header>
      <div className="px-8">
        <div
          className="ws-tabs !mt-0"
          role="tablist"
          aria-label="Role sections"
        >
          {[
            ["brief", "Brief"],
            ["candidates", `Candidates (${people.length})`],
            ["activity", "Activity"],
            ["submissions", "Submissions"],
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
      </div>
      <ErrorNotice
        error={error || query.error || job.error}
        retry={query.refresh}
      />
      {jobId && job.data?.job.status === "error" && (
        <ErrorNotice
          error={job.data.job.error || "Assessment failed"}
          retry={() =>
            void api(`/jobs/${jobId}`, { method: "POST" })
              .then(job.refresh)
              .catch((error) => setError(error.message))
          }
        />
      )}
      {jobId &&
        (!job.data || ["queued", "running"].includes(job.data.job.status)) && (
          <Loading>
            {job.data?.job.progress || "Starting assessment…"}{" "}
            <Link className="ws-link" href="/app/tasks">
              View tasks
            </Link>
          </Loading>
        )}
      {job.data?.job.result?.superseded === true && (
        <div className="ws-notice">
          The role or candidate changed during the assessment. Review the
          changes and run it again.
        </div>
      )}
      <div className="ws-role-body">
        <section>
          {tab === "brief" && (
            <>
              <section className="ws-section">
                <div className="ws-inspector-heading">
                  <h3>Working requirements</h3>
                  <button className="ws-link" onClick={() => setHistory(true)}>
                    <HistoryIcon size={13} />
                    Version {role.version}
                  </button>
                </div>
                <div className="ws-brief-columns">
                  {(
                    [
                      ["priorities", "Confirmed priorities"],
                      ["flexible", "Flexible requirements"],
                      ["unknowns", "Still to clarify"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key}>
                      <h4>{label}</h4>
                      {role.brief[key]?.length ? (
                        <ul>
                          {role.brief[key]
                            .filter(Boolean)
                            .map((text, index) => (
                              <li key={index}>{text}</li>
                            ))}
                        </ul>
                      ) : (
                        <p className="ws-muted">Not recorded yet.</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
              <section className="ws-section">
                <h3>Job description</h3>
                <p>{role.jd_text}</p>
              </section>
              {Object.values(role.client_contact || {}).some(Boolean) && (
                <section className="ws-section">
                  <h3>Client & practical details</h3>
                  {Object.entries(role.client_contact)
                    .filter(([, value]) => value)
                    .map(([key, value]) => (
                      <p key={key}>
                        <span className="ws-muted">
                          {key[0].toUpperCase() + key.slice(1)}:{" "}
                        </span>
                        {value}
                      </p>
                    ))}
                </section>
              )}
            </>
          )}
          {tab === "candidates" && (
            <>
              <div className="ws-actions mt-5 mb-3">
                <button className="ws-button" onClick={() => setLinking(true)}>
                  <Plus size={14} />
                  Add from candidates
                </button>
                <Link
                  className="ws-link"
                  href={`/app?role=${id}&prompt=${encodeURIComponent("Who from my candidates might be worth discussing for this role?")}`}
                >
                  Ask my assistant <ArrowUpRight size={13} />
                </Link>
              </div>
              {people.length ? (
                people.map((link) => {
                  const result = link.assessment as Assessment;
                  const stale =
                    link.assessed_role_version !== role.version ||
                    result.person_version !== link.person?.version;
                  return (
                    <article className="ws-role-candidate" key={link.person_id}>
                      <div className="ws-inspector-heading">
                        <div>
                          <Link
                            className="ws-link !text-base !font-medium"
                            href={`/app/candidates?person=${link.person_id}`}
                          >
                            {link.person?.name}
                          </Link>
                          <p className="ws-muted text-xs mt-1">
                            {link.person?.headline ||
                              "Current role not recorded"}
                          </p>
                        </div>
                        <span className="ws-tag">
                          {link.permission === "unknown"
                            ? "Sharing not confirmed"
                            : link.permission === "confirmed"
                              ? "Sharing confirmed"
                              : "Sharing declined"}
                        </span>
                      </div>
                      <p className="ws-muted text-[13px] mt-3 leading-7">
                        {link.interest ||
                          "Interest in this role has not been recorded."}
                      </p>
                      <div className="ws-actions mt-4">
                        <button
                          className="ws-link"
                          onClick={() => setPermission(link)}
                        >
                          Interest & sharing
                        </button>
                        <Link
                          className="ws-link"
                          href={`/app/submissions/new?role=${id}&people=${link.person_id}`}
                        >
                          Prepare submission <ArrowUpRight size={13} />
                        </Link>
                      </div>
                      <details className="ws-role-fit mt-4">
                        <summary>Review fit for this role</summary>
                        {result.summary && (
                          <p className="text-[13px] leading-7 mt-3">
                            {result.summary}
                          </p>
                        )}
                        {result.summary && stale && (
                          <p className="ws-warning mt-3">
                            The role or profile has changed since this review.
                          </p>
                        )}
                        <div className="ws-actions mt-3">
                          {result.summary && (
                            <button
                              className="ws-link"
                              onClick={() => setAssessment(link)}
                            >
                              Read supporting evidence
                            </button>
                          )}
                          <button
                            className="ws-link"
                            disabled={busy}
                            onClick={() => assess(link.person_id)}
                          >
                            {result.summary
                              ? "Update role review"
                              : "Review role fit"}
                          </button>
                        </div>
                      </details>
                    </article>
                  );
                })
              ) : (
                <div className="ws-empty">
                  <h2>Bring in the people worth considering.</h2>
                  <p>
                    Link people from your candidate pool. Their interest,
                    sharing permission and conversations are kept with this
                    role.
                  </p>
                </div>
              )}
            </>
          )}
          {tab === "activity" && (
            <>
              <div className="ws-actions mt-5 mb-3">
                <button className="ws-button" onClick={() => setRecord("new")}>
                  <Plus size={14} />
                  Add record
                </button>
                <Link className="ws-link" href={`/app/roles/${id}/updates/new`}>
                  Prepare search update
                </Link>
              </div>
              {deliverables
                .filter((item) => item.kind === "search_update")
                .map((item) => (
                  <Link
                    key={item.id}
                    className="ws-detail-link"
                    href={`/app/roles/${id}/updates/${item.id}`}
                  >
                    <strong>{item.title}</strong>
                    <small>
                      Search update ·{" "}
                      {item.status === "draft"
                        ? "Draft"
                        : `Submitted ${date(item.submitted_at)}`}{" "}
                      · {date(item.period_start)} – {date(item.period_end)}
                    </small>
                  </Link>
                ))}
              {records.map((item) => (
                <article
                  className="ws-record"
                  key={item.id}
                  id={item.id}
                  data-highlight={paramsQuery.get("record") === item.id}
                >
                  <div className="ws-inspector-heading">
                    <div>
                      <h4>{item.title}</h4>
                      <small>
                        {item.kind} · Happened {date(item.occurred_at, true)} ·
                        Added {date(item.created_at, true)}
                      </small>
                    </div>
                    <button
                      className="ws-icon"
                      aria-label={`Edit ${item.title}`}
                      onClick={() => setRecord(item)}
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
                  <p>{item.content}</p>
                </article>
              ))}
            </>
          )}
          {tab === "submissions" && (
            <>
              <div className="ws-actions mt-5">
                <Link
                  className="ws-button"
                  href={`/app/submissions/new?role=${id}`}
                >
                  <Plus size={14} />
                  Prepare candidate submission
                </Link>
              </div>
              {submissions.length ? (
                submissions.map((item) => (
                  <Link
                    className="ws-detail-link"
                    key={item.id}
                    href={`/app/submissions/${item.id}`}
                  >
                    <strong>{item.title}</strong>
                    <small>
                      {item.status === "draft"
                        ? "Draft"
                        : `Submitted ${date(item.submitted_at)}`}{" "}
                      · Updated {date(item.updated_at)}
                    </small>
                  </Link>
                ))
              ) : (
                <div className="ws-empty">
                  <h2>No candidate submissions yet.</h2>
                  <p>
                    Choose the people you want to introduce. Drafting and
                    exporting are kept separate from recording an actual
                    submission.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
        <aside className="ws-role-context">
          <section className="ws-section">
            <h3>Next to clarify</h3>
            {role.brief.unknowns?.filter(Boolean).length ? (
              <ul>
                {role.brief.unknowns.filter(Boolean).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="ws-muted">No open questions recorded.</p>
            )}
          </section>
          <section className="ws-section">
            <h3>Recent activity</h3>
            {records
              .filter((item) => item.kind !== "jd")
              .slice(0, 3)
              .map((item) => (
                <button
                  className="ws-detail-link text-left w-full"
                  key={item.id}
                  onClick={() => setTab("activity")}
                >
                  <strong>{item.title}</strong>
                  <small>{item.occurred_at ? date(item.occurred_at) : `Recorded ${date(item.created_at)} · event date unknown`}</small>
                </button>
              ))}
            <button className="ws-link mt-3" onClick={() => setRecord("new")}>
              <Plus size={13} />
              Add record
            </button>
          </section>
          <section className="ws-section">
            <h3>Client material</h3>
            <p>
              {submissions.filter((item) => item.status === "submitted").length}{" "}
              submissions recorded
            </p>
            <Link
              className="ws-link mt-3"
              href={`/app/roles/${id}/updates/new`}
            >
              Prepare a search update <ArrowUpRight size={13} />
            </Link>
          </section>
          <section className="ws-section">
            <h3>Role status</h3>
            <p className="ws-muted">
              {role.status === "active"
                ? "This role is active."
                : role.status === "paused"
                  ? "Paused. Scheduled drafts will not be prepared."
                  : "Closed. Your records and candidate relationships remain available."}
            </p>
            <div className="ws-actions mt-3">
              {role.status === "active" ? (
                <button
                  className="ws-link"
                  disabled={busy}
                  onClick={() => changeStatus("paused")}
                >
                  <Pause size={13} />
                  Pause
                </button>
              ) : (
                <button
                  className="ws-link"
                  disabled={busy}
                  onClick={() => changeStatus("active")}
                >
                  <Play size={13} />
                  {role.status === "closed" ? "Reopen" : "Resume"}
                </button>
              )}
              {role.status !== "closed" && (
                <button
                  className="ws-link"
                  disabled={busy}
                  onClick={() => changeStatus("closed")}
                >
                  <Check size={13} />
                  Close role
                </button>
              )}
            </div>
          </section>
          <Link
            className="ws-button ws-button-primary w-full mt-4"
            href={`/app?role=${id}`}
          >
            Ask about this role <ArrowUpRight size={14} />
          </Link>
        </aside>
      </div>
      {edit && (
        <RoleForm
          role={role}
          onClose={() => setEdit(false)}
          onSaved={() => {
            setEdit(false);
            query.refresh();
          }}
        />
      )}
      {history && (
        <History kind="role" id={id} onClose={() => setHistory(false)} />
      )}
      {record && (
        <RecordForm
          roleId={id}
          record={record === "new" ? undefined : record}
          onClose={() => setRecord(null)}
          onSaved={() => {
            setRecord(null);
            query.refresh();
          }}
        />
      )}
      {linking && (
        <Dialog
          title="Add a candidate to this role"
          onClose={() => setLinking(false)}
        >
          <form className="ws-form" onSubmit={link}>
            <ErrorNotice error={error} />
            <Field label="Find a candidate">
              <input
                autoFocus
                placeholder="Search your candidate pool"
                value={personFilter}
                onChange={(event) => setPersonFilter(event.target.value)}
              />
            </Field>
            <Field label="Candidate">
              <select
                required
                value={personId}
                onChange={(event) => setPersonId(event.target.value)}
              >
                <option value="">Choose a candidate</option>
                {(personFilter
                  ? filteredPool.data?.people
                  : pool.data?.people
                )?.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} · {person.headline}
                  </option>
                ))}
              </select>
            </Field>
            <div className="ws-form-footer">
              <button
                className="ws-button ws-button-primary"
                disabled={!personId || busy}
              >
                {busy ? "Saving…" : "Add candidate"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {assessment && (
        <Dialog
          title={`${assessment.person?.name} · Role assessment`}
          onClose={() => setAssessment(null)}
          wide
        >
          <div className="ws-form">
            <AgentText
              content={(assessment.assessment as Assessment).summary}
            />
            {(["strengths", "gaps"] as const).map((key) => (
              <section className="ws-section" key={key}>
                <h3>
                  {key === "strengths"
                    ? "Supporting experience"
                    : "Gaps and uncertainties"}
                </h3>
                {((assessment.assessment as Assessment)[key] || []).map(
                  (item, index) => (
                    <div className="ws-record" key={index}>
                      <p>{item.text}</p>
                      <div className="ws-actions mt-2">
                        {item.from_profile && (
                          <Link
                            className="ws-link"
                            href={`/app/candidates?person=${assessment.person_id}`}
                          >
                            Candidate profile
                          </Link>
                        )}
                        {item.record_ids.map((id) => (
                          <Link
                            className="ws-link"
                            key={id}
                            href={`/app/candidates?person=${assessment.person_id}&record=${id}`}
                          >
                            Source record <ArrowUpRight size={12} />
                          </Link>
                        ))}
                      </div>
                    </div>
                  ),
                )}
              </section>
            ))}
            <section className="ws-section">
              <h3>Questions to follow up</h3>
              {(assessment.assessment as Assessment).questions?.map(
                (item, index) => (
                  <p key={index}>{item}</p>
                ),
              )}
            </section>
            <p className="ws-muted text-xs">
              {(assessment.assessment as Assessment).scope}
            </p>
          </div>
        </Dialog>
      )}
      {permission && (
        <PermissionForm
          link={permission}
          roleId={id}
          onClose={() => setPermission(null)}
          onSaved={() => {
            setPermission(null);
            query.refresh();
          }}
        />
      )}
    </div>
  );
}
function PermissionForm({
  link,
  roleId,
  onClose,
  onSaved,
}: {
  link: RoleCandidate;
  roleId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const sources = useQuery<{ records: SourceRecord[] }>(
    `/people/${link.person_id}`,
  );
  const [permission, setPermission] = useState(link.permission),
    [recordId, setRecordId] = useState(link.permission_record_id || ""),
    [interest, setInterest] = useState(link.interest),
    [notes, setNotes] = useState(link.notes),
    [adding, setAdding] = useState(false),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api(`/roles/${roleId}/people`, {
        method: "PATCH",
        body: JSON.stringify({
          person_id: link.person_id,
          permission,
          permission_record_id: recordId || null,
          interest,
          notes,
          expected_version: link.version,
        }),
      });
      onSaved();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save relationship",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Dialog
        title={`Interest & sharing · ${link.person?.name}`}
        onClose={onClose}
      >
        <form className="ws-form" onSubmit={save}>
          <ErrorNotice error={error} />
          <Field label="Permission to share for this role">
            <select
              value={permission}
              onChange={(event) =>
                setPermission(event.target.value as RoleCandidate["permission"])
              }
            >
              <option value="unknown">Not confirmed</option>
              <option value="confirmed">Confirmed</option>
              <option value="declined">Declined</option>
            </select>
          </Field>
          <Field label="Supporting conversation or record">
            <select
              required={permission !== "unknown"}
              value={recordId}
              onChange={(event) => setRecordId(event.target.value)}
            >
              <option value="">Choose a record</option>
              {sources.data?.records
                .filter((record) => record.role_id === roleId)
                .map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.title} · {date(record.occurred_at)}
                  </option>
                ))}
            </select>
          </Field>
          <button
            type="button"
            className="ws-link"
            onClick={() => setAdding(true)}
          >
            <Plus size={13} />
            Add a record for this candidate and role
          </button>
          <Field label="Interest in this role">
            <textarea
              value={interest}
              maxLength={5000}
              onChange={(event) => setInterest(event.target.value)}
            />
          </Field>
          <Field label="Your notes for this role">
            <textarea
              value={notes}
              maxLength={20000}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          <div className="ws-form-footer">
            <button className="ws-button ws-button-primary" disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" />}Save
              relationship
            </button>
          </div>
        </form>
      </Dialog>
      {adding && (
        <RecordForm
          personId={link.person_id}
          roleId={roleId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            sources.refresh();
          }}
        />
      )}
    </>
  );
}
