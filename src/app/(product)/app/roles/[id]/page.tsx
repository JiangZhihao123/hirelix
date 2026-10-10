"use client";

import { useLanguage, useT } from "@/components/LanguageProvider";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Plus,
  Pencil,
  History as HistoryIcon,
  Pause,
  Play,
  Check,
} from "lucide-react";
import {
  api,
  date,
  Dialog,
  ErrorNotice,
  Loading,
  useQuery,
} from "@/components/workspace/client";
import { RoleForm, RecordForm } from "@/components/workspace/forms";
import { ScheduledDrafts } from "@/components/workspace/schedule";
import { History } from "@/components/workspace/history";
import { AgentText } from "@/components/AgentText";
import type {
  Deliverable,
  Job,
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
  assessment_job: Job | null;
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
  const t = useT();
  const { locale } = useLanguage();
  const { id } = use(params);
  const paramsQuery = useSearchParams();
  const router = useRouter();
  function ask(prompt: string, person?: string) { router.push(`/app?role=${id}${person ? `&person=${person}` : ""}&prompt=${encodeURIComponent(prompt)}`); }
  const query = useQuery<Detail>(`/roles/${id}`);
  const requestedTab = paramsQuery.get("tab");
  const tab = requestedTab && ["brief", "candidates", "activity", "submissions"].includes(requestedTab)
    ? requestedTab : paramsQuery.get("record") ? "activity" : "brief";
  function setTab(value: string) {
    const next = new URLSearchParams(paramsQuery.toString());
    next.set("tab", value);
    if (value !== "activity") next.delete("record");
    window.history.pushState(null, "", `/app/roles/${id}?${next}`);
  }
  const [edit, setEdit] = useState(false),
    [history, setHistory] = useState(false),
    [record, setRecord] = useState<SourceRecord | "new" | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [assessment, setAssessment] = useState<RoleCandidate | null>(null),
    [startedJobId, setJobId] = useState<string | null>(null);
  const jobId = startedJobId || query.data?.assessment_job?.id || null;
  const job = useQuery<{ job: Job }>(jobId ? `/jobs/${jobId}` : null);
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
  async function assess(personId: string) {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ job: Job }>("/jobs", {
        method: "POST",
        body: JSON.stringify({
          kind: "assessment",
          request_key: crypto.randomUUID(),
          payload: { role_id: id, person_id: personId, locale },
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
        <Loading>{t("Opening role…")}</Loading>
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
            {t("Roles")}
          </Link>
          <div className="ws-actions">
            <h1>{role.title}</h1>
            <span className="ws-status" data-status={role.status}>
              {t(role.status)}
            </span>
          </div>
          <p>
            {role.client_name || t("Client not recorded")}
            {role.client_contact?.location
              ? ` · ${role.client_contact.location}`
              : ""}
          </p>
        </div>
        <div className="ws-actions">
          <button className="ws-button" onClick={() => setEdit(true)}>
            <Pencil size={14} />
            {t("Edit role")}
          </button>
          <Link
            className="ws-button ws-button-primary"
            href={`/app?role=${id}`}
          >
            {t("Ask your AI assistant")}
          </Link>
        </div>
      </header>
      <div className="px-8">
        <div
          className="ws-tabs !mt-0"
          role="tablist"
          aria-label={t("Role sections")}
        >
          {[
            ["brief", "Brief"],
            ["candidates", `${t("Candidates")} (${people.length})`],
            ["activity", "Activity"],
            ["submissions", "Submissions"],
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
            {job.data?.job.progress ? t(job.data.job.progress) : t("Starting assessment…")}{" "}
          </Loading>
        )}
      {job.data?.job.result?.superseded === true && (
        <div className="ws-notice">
          {t("The role or candidate changed during the assessment. Review the changes and run it again.")}
        </div>
      )}
      <div className="ws-role-body">
        <section>
          {tab === "brief" && (
            <>
              <section className="ws-section">
                <div className="ws-inspector-heading">
                  <h3>{t("Current requirements")}</h3>
                  <button className="ws-link" onClick={() => setHistory(true)}>
                    <HistoryIcon size={13} />
                    {t("Version")} {role.version}
                  </button>
                </div>
                <p className="ws-muted text-sm mb-4">{t("Confirmed priorities and clarifications for this role. The original JD is kept separately below.")}</p>
                <div className="ws-brief-columns">
                  {(
                    [
                      ["priorities", "Confirmed priorities"],
                      ["flexible", "Flexible requirements"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key}>
                      <h4>{t(label)}</h4>
                      {role.brief[key]?.length ? (
                        <ul>
                          {role.brief[key]
                            .filter(Boolean)
                            .map((text, index) => (
                              <li key={index}>{text}</li>
                            ))}
                        </ul>
                      ) : (
                        <p className="ws-muted">{t("Not recorded yet.")}</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
              <section className="ws-section">
                <h3>{t("Original job description")}</h3>
                <p className="ws-muted text-sm mb-3">{t("Reference text. Later clarifications are shown in Current requirements above.")}</p>
                <p>{role.jd_text}</p>
              </section>
              {Object.values(role.client_contact || {}).some(Boolean) && (
                <section className="ws-section">
                  <h3>{t("Client & practical details")}</h3>
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
                <button className="ws-button" onClick={() => ask(locale === "zh" ? "帮我把候选人关联到这个职位。" : "Help me link a candidate to this role.")}>
                  <Plus size={14} />
                  {t("Add from candidates")}
                </button>
                <Link
                  className="ws-link"
                  href={`/app?role=${id}&prompt=${encodeURIComponent(locale === "zh" ? "我的候选人中，谁值得为这个职位进一步讨论？" : "Who from my candidates might be worth discussing for this role?")}`}
                >
                  {t("Ask about this role")} <ArrowUpRight size={13} />
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
                              t("Current role not recorded")}
                          </p>
                        </div>
                        <span className="ws-tag">
                          {link.permission === "unknown"
                            ? t("Sharing not confirmed")
                            : link.permission === "confirmed"
                              ? t("Sharing confirmed")
                              : t("Sharing declined")}
                        </span>
                      </div>
                      <p className="ws-muted text-[13px] mt-3 leading-7">
                        {link.interest ||
                          t("Interest in this role has not been recorded.")}
                      </p>
                      <div className="ws-actions mt-4">
                        <button
                          className="ws-link"
                          onClick={() => ask(locale === "zh" ? "帮我更新这位候选人对这个职位的意向或分享授权。" : "Help me update this candidate’s interest or sharing permission for this role.", link.person_id)}
                        >
                          {t("Interest & sharing")}
                        </button>
                        <Link
                          className="ws-link"
                          href={`/app?role=${id}&person=${link.person_id}&prompt=${encodeURIComponent(locale === "zh" ? `请给这个职位准备 ${link.person?.name || "这位候选人"} 的推荐稿，不要发送。` : `Prepare a recommendation for ${link.person?.name || "this candidate"} for this role. Do not send it.`)}`}
                        >
                          {t("Prepare submission")} <ArrowUpRight size={13} />
                        </Link>
                      </div>
                      <details className="ws-role-fit mt-4">
                        <summary>{t("Review fit for this role")}</summary>
                        {result.summary && (
                          <p className="text-[13px] leading-7 mt-3">
                            {result.summary}
                          </p>
                        )}
                        {result.summary && stale && (
                          <p className="ws-warning mt-3">
                            {t("The role or profile has changed since this review.")}
                          </p>
                        )}
                        <div className="ws-actions mt-3">
                          {result.summary && (
                            <button
                              className="ws-link"
                              onClick={() => setAssessment(link)}
                            >
                              {t("Read supporting evidence")}
                            </button>
                          )}
                          <button
                            className="ws-link"
                            disabled={busy}
                            onClick={() => assess(link.person_id)}
                          >
                            {result.summary
                              ? t("Update role review")
                              : t("Review role fit")}
                          </button>
                        </div>
                      </details>
                    </article>
                  );
                })
              ) : (
                <div className="ws-empty">
                  <h2>{t("Bring in the people worth considering.")}</h2>
                  <p>
                    {t("Link people from your candidate pool. Their interest, sharing permission and conversations are kept with this role.")}
                  </p>
                </div>
              )}
            </>
          )}
          {tab === "activity" && (
            <>
              <ScheduledDrafts role={role} schedule={query.data.schedule} refresh={query.refresh} />
              <div className="ws-actions mt-5 mb-3">
                <button className="ws-button" onClick={() => ask(locale === "zh" ? "帮我记录这个职位的新反馈。" : "Help me record new feedback for this role.")}>
                  <Plus size={14} />
                  {t("Add record")}
                </button>
                <Link className="ws-link" href={`/app?role=${id}&prompt=${encodeURIComponent(locale === "zh" ? "请给这个职位准备一份进展更新，不要发送。" : "Prepare a search update for this role. Do not send it.")}`}>
                  {t("Prepare search update")}
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
                      {t("Search update ·")}{" "}
                      {item.status === "draft"
                        ? t("Draft")
                        : `${t("Submitted")} ${date(item.submitted_at)}`}{" "}
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
                        {t(item.kind)} {t("· Happened")} {date(item.occurred_at, true)} {t("· Added")} {date(item.created_at, true)}
                      </small>
                    </div>
                    <button
                      className="ws-icon"
                      aria-label={`${t("Edit")} ${item.title}`}
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
                  href={`/app?role=${id}&prompt=${encodeURIComponent(locale === "zh" ? "请帮我为这个职位准备候选人推荐稿。" : "Help me prepare candidate recommendations for this role.")}`}
                >
                  <Plus size={14} />
                  {t("Prepare candidate submission")}
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
                        ? t("Draft")
                        : `${t("Submitted")} ${date(item.submitted_at)}`}{" "}
                      {t("· Updated")} {date(item.updated_at)}
                    </small>
                  </Link>
                ))
              ) : (
                <div className="ws-empty">
                  <h2>{t("No candidate submissions yet.")}</h2>
                  <p>
                    {t("Choose the people you want to introduce. Drafting and exporting are kept separate from recording an actual submission.")}
                  </p>
                </div>
              )}
            </>
          )}
        </section>
        <aside className="ws-role-context">
          <section className="ws-section">
            <h3>{t("Next to clarify")}</h3>
            {role.brief.unknowns?.filter(Boolean).length ? (
              <ul>
                {role.brief.unknowns.filter(Boolean).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="ws-muted">{t("No open questions recorded.")}</p>
            )}
          </section>
          <section className="ws-section">
            <h3>{t("Recent activity")}</h3>
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
                  <small>{item.occurred_at ? date(item.occurred_at) : locale === "zh" ? `记录于 ${date(item.created_at)} · 事件日期未记录` : `Recorded ${date(item.created_at)} · event date unknown`}</small>
                </button>
              ))}
            <button className="ws-link mt-3" onClick={() => ask(locale === "zh" ? "帮我记录这个职位的新反馈。" : "Help me record new feedback for this role.")}>
              <Plus size={13} />
              {t("Add record")}
            </button>
          </section>
          <section className="ws-section">
            <h3>{t("Client material")}</h3>
            <p>
              {locale === "zh"
                ? `已记录 ${submissions.filter((item) => item.status === "submitted").length} 次推荐`
                : `${submissions.filter((item) => item.status === "submitted").length} submissions recorded`}
            </p>
            <Link
              className="ws-link mt-3"
              href={`/app?role=${id}&prompt=${encodeURIComponent(locale === "zh" ? "请给这个职位准备一份进展更新，不要发送。" : "Prepare a search update for this role. Do not send it.")}`}
            >
              {t("Prepare a search update")} <ArrowUpRight size={13} />
            </Link>
          </section>
          <section className="ws-section">
            <h3>{t("Role status")}</h3>
            <p className="ws-muted">
              {role.status === "active"
                ? t("This role is active.")
                : role.status === "paused"
                  ? t("Paused. Scheduled drafts will not be prepared.")
                  : t("Closed. Your records and candidate relationships remain available.")}
            </p>
            <div className="ws-actions mt-3">
              {role.status === "active" ? (
                <button
                  className="ws-link"
                  disabled={busy}
                  onClick={() => changeStatus("paused")}
                >
                  <Pause size={13} />
                  {t("Pause")}
                </button>
              ) : (
                <button
                  className="ws-link"
                  disabled={busy}
                  onClick={() => changeStatus("active")}
                >
                  <Play size={13} />
                  {role.status === "closed" ? t("Reopen") : t("Resume")}
                </button>
              )}
              {role.status !== "closed" && (
                <button
                  className="ws-link"
                  disabled={busy}
                  onClick={() => changeStatus("closed")}
                >
                  <Check size={13} />
                  {t("Close role")}
                </button>
              )}
            </div>
          </section>
          <Link
            className="ws-button ws-button-primary w-full mt-4"
            href={`/app?role=${id}`}
          >
            {t("Ask about this role")} <ArrowUpRight size={14} />
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
      {assessment && (
        <Dialog
          title={`${assessment.person?.name} · ${t("Role assessment")}`}
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
                    ? t("Supporting experience")
                    : t("Gaps and uncertainties")}
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
                            {t("Candidate profile")}
                          </Link>
                        )}
                        {item.record_ids.map((id) => (
                          <Link
                            className="ws-link"
                            key={id}
                            href={`/app/candidates?person=${assessment.person_id}&record=${id}`}
                          >
                            {t("Source record")} <ArrowUpRight size={12} />
                          </Link>
                        ))}
                      </div>
                    </div>
                  ),
                )}
              </section>
            ))}
            <section className="ws-section">
              <h3>{t("Questions to follow up")}</h3>
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
    </div>
  );
}
