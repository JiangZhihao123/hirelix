"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useT } from "@/components/LanguageProvider";
import { api, Dialog, ErrorNotice, Field, useQuery } from "./client";
import type { Job, Role, RoleCandidate, Schedule } from "@/lib/workspace/types";

export function ScheduledDrafts({ role, people, schedule, refresh }: { role: Role; people: RoleCandidate[]; schedule: Schedule | null; refresh: () => void }) {
  const t = useT();
  const [editing, setEditing] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const task = useQuery<{ job: Job }>(schedule?.last_job_id ? `/jobs/${schedule.last_job_id}` : null);
  const refreshTask = task.refresh;
  useEffect(() => {
    if (!schedule?.enabled) return;
    const timer = setInterval(() => { refresh(); refreshTask(); }, 15000);
    return () => clearInterval(timer);
  }, [schedule?.enabled, refresh, refreshTask]);
  async function pause() {
    if (!schedule) return;
    setBusy(true); setError("");
    try { await api(`/roles/${role.id}/schedule`, { method: "PUT", body: JSON.stringify({ ...schedule, enabled: !schedule.enabled }) }); refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save agreement"); }
    finally { setBusy(false); }
  }
  async function retry() {
    setBusy(true); setError("");
    try {
      await api(task.data?.job.status === "error" ? `/jobs/${task.data.job.id}` : `/roles/${role.id}/schedule`, { method: "POST" });
      refresh(); task.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not retry draft"); }
    finally { setBusy(false); }
  }
  const job = task.data?.job;
  return <section className="ws-record">
    <div className="ws-inspector-heading"><h3>{t("Scheduled search updates")}</h3><button className="ws-link" onClick={() => setEditing(true)}>{t(schedule ? "Edit agreement" : "Set an agreement")}</button></div>
    <p>{t("Prepare a draft for your review. Nothing is sent to a client. Each completed draft uses AI credits.")}</p>
    {schedule && <>
      <p>{schedule.enabled && role.status === "active" ? `${t("Next draft")}: ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: schedule.timezone }).format(new Date(schedule.next_run_at))} (${schedule.timezone})` : t("Paused. Scheduled drafts will not be prepared.")}</p>
      <button className="ws-link" disabled={busy} onClick={pause}>{t(schedule.enabled ? "Pause agreement" : "Resume agreement")}</button>
      <ErrorNotice error={schedule.error || job?.error || error || task.error} retry={schedule.error || job?.status === "error" ? retry : undefined} />
      {job && <p>{t(job.status === "done" ? "Draft prepared for review" : job.status === "error" ? "Draft needs attention" : job.progress)} {job.status === "done" && typeof job.result?.href === "string" ? <Link className="ws-link" href={job.result.href}>{t("Open draft")}</Link> : null}</p>}
    </>}
    {!schedule && <ErrorNotice error={error} />}
    {editing && <Dialog title={t("Search update agreement")} onClose={() => setEditing(false)}><ScheduleForm role={role} people={people} schedule={schedule} done={() => { setEditing(false); refresh(); }} /></Dialog>}
  </section>;
}
function ScheduleForm({ role, people, schedule, done }: { role: Role; people: RoleCandidate[]; schedule: Schedule | null; done: () => void }) {
  const t = useT();
  const [value, setValue] = useState({
    enabled: schedule?.enabled ?? true, timezone: schedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    weekday: schedule?.weekday ?? 5, local_time: schedule?.local_time ?? "09:00", interval_weeks: schedule?.interval_weeks ?? 1,
    language: schedule?.language ?? "en", person_ids: schedule?.person_ids ?? [], include_role_records: schedule?.include_role_records ?? false,
    include_candidate_records: schedule?.include_candidate_records ?? false, only_when_changed: schedule?.only_when_changed ?? true,
  });
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const patch = (key: string, next: unknown) => setValue((prior) => ({ ...prior, [key]: next }));
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api(`/roles/${role.id}/schedule`, { method: "PUT", body: JSON.stringify(value) }); done(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save agreement"); }
    finally { setBusy(false); }
  }
  return <form className="ws-form" onSubmit={save}>
    <Field label={t("Frequency")}><select value={value.interval_weeks} onChange={(e) => patch("interval_weeks", Number(e.target.value))}><option value={1}>{t("Every week")}</option><option value={2}>{t("Every two weeks")}</option></select></Field>
    <Field label={t("Weekday")}><select value={value.weekday} onChange={(e) => patch("weekday", Number(e.target.value))}>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <option key={day} value={index}>{t(day)}</option>)}</select></Field>
    <Field label={t("Local time")}><input type="time" required value={value.local_time} onChange={(e) => patch("local_time", e.target.value)} /></Field>
    <Field label={t("Timezone")}><input required value={value.timezone} placeholder="Europe/London" onChange={(e) => patch("timezone", e.target.value)} /></Field>
    <p>{t("Uses local clock time. During daylight-saving gaps the time moves forward; repeated times use standard time. The saved agreement shows the next actual draft time.")}</p>
    <Field label={t("Draft language")}><select value={value.language} onChange={(e) => patch("language", e.target.value)}><option value="en">{t("English")}</option><option value="zh">{t("Chinese")}</option></select></Field>
    <p>{t("Report the period since the previous scheduled draft, or the preceding one or two weeks for the first draft. Delayed runs catch up once. A failed draft can be retried without losing its original evidence.")}</p>
    <fieldset><legend>{t("Candidate profiles to include")}</legend>{people.map((link) => <label key={link.person_id} className="ws-checkbox"><input type="checkbox" checked={value.person_ids.includes(link.person_id)} onChange={(e) => patch("person_ids", e.target.checked ? [...value.person_ids, link.person_id] : value.person_ids.filter((id) => id !== link.person_id))} />{link.person?.name ?? link.person_id}</label>)}</fieldset>
    <label className="ws-checkbox"><input type="checkbox" checked={value.include_role_records} onChange={(e) => patch("include_role_records", e.target.checked)} />{t("Include dated role records, including future client feedback, in drafts")}</label>
    <label className="ws-checkbox"><input type="checkbox" checked={value.include_candidate_records} onChange={(e) => patch("include_candidate_records", e.target.checked)} />{t("Include dated private notes for the selected candidates, including future notes, in drafts")}</label>
    <p>{t("Unselected private notes, contact details and original files are excluded. Review every draft before sharing.")}</p>
    <label className="ws-checkbox"><input type="checkbox" checked={value.only_when_changed} onChange={(e) => patch("only_when_changed", e.target.checked)} />{t("Notify me only when the selected evidence changes")}</label>
    <label className="ws-checkbox"><input type="checkbox" checked={value.enabled} onChange={(e) => patch("enabled", e.target.checked)} />{t("Agreement enabled")}</label>
    <ErrorNotice error={error} /><button className="ws-button primary" disabled={busy}>{t(busy ? "Saving…" : "Save agreement")}</button>
  </form>;
}
