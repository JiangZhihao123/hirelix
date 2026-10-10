"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage, useT } from "@/components/LanguageProvider";
import { api, ErrorNotice, useQuery } from "./client";
import type { Job, Role, Schedule } from "@/lib/workspace/types";

export function ScheduledDrafts({ role, schedule, refresh }: { role: Role; schedule: Schedule | null; refresh: () => void }) {
  const t = useT();
  const { locale } = useLanguage();
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
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
    <div className="ws-inspector-heading"><h3>{t("Scheduled search updates")}</h3><Link className="ws-link" href={`/app?role=${role.id}&prompt=${encodeURIComponent(locale === "zh" ? (schedule ? "帮我调整这个职位的定期进展更新约定。" : "帮我安排这个职位的定期进展更新。") : (schedule ? "Help me adjust the recurring update agreement for this role." : "Help me arrange recurring updates for this role."))}`}>{t(schedule ? "Edit agreement" : "Set an agreement")}</Link></div>
    <p>{t("Prepare recurring updates in your conversation. Nothing is sent to a client. Each completed update uses AI credits.")}</p>
    {schedule && <>
      <p>{schedule.enabled && role.status === "active" ? `${t("Next draft")}: ${new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: schedule.timezone }).format(new Date(schedule.next_run_at))} (${schedule.timezone})` : t("Paused. Scheduled drafts will not be prepared.")}</p>
      <button className="ws-link" disabled={busy} onClick={pause}>{t(schedule.enabled ? "Pause agreement" : "Resume agreement")}</button>
      <ErrorNotice error={schedule.error || job?.error || error || task.error} retry={schedule.error || job?.status === "error" ? retry : undefined} />
      {job && <p>{t(job.status === "done" ? "Update prepared" : job.status === "error" ? "Draft needs attention" : job.progress)} {job.status === "done" && typeof job.result?.href === "string" ? <Link className="ws-link" href={job.result.href}>{t("Open draft")}</Link> : null}</p>}
    </>}
    {!schedule && <ErrorNotice error={error} />}
  </section>;
}