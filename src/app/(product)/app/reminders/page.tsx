"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CalendarClock, ArrowUpRight } from "lucide-react";
import { useLanguage, useT } from "@/components/LanguageProvider";
import { api, useQuery, ErrorNotice, Loading } from "@/components/workspace/client";
import type { ManagedReminder } from "@/lib/workspace/reminders";

function ReminderRow({item, refresh}: {item: ManagedReminder; refresh: () => void}) {
  const t = useT();
  const {locale} = useLanguage();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState("");
  const [error, setError] = useState("");
  const recurring = item.kind === "search_update";
  const date = (value: string) => new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-GB", {dateStyle: "medium", timeStyle: "short", timeZone: item.timezone}).format(new Date(value));
  async function update(reschedule = false) {
    if (reschedule && !time) return;
    setBusy(true); setError("");
    try {
      await api("/reminders", {method: "PATCH", body: JSON.stringify({id: item.id, expected_version: item.version, enabled: reschedule || !item.enabled, ...(reschedule ? {due_at: new Date(time).toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone} : {})})});
      setEditing(false); refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update reminder"); }
    finally { setBusy(false); }
  }
  const state = item.error ? "Needs attention" : item.completed_at ? "Reminder delivered" : recurring && item.role_status !== "active" ? "Role is inactive" : item.enabled ? recurring ? "Recurring" : "Upcoming" : "Paused";
  return <article className="ws-reminder-item">
    <div className="ws-reminder-item-heading">{recurring ? <CalendarClock size={18}/> : <Bell size={18}/>}<h2>{item.title}</h2><span className="ws-badge">{t(state)}</span></div>
    <p>{t(item.completed_at ? "Delivered at" : "Scheduled for")}: {date(item.completed_at || item.next_run_at)} · {item.timezone}</p>
    {recurring && <p className="ws-muted">{t(item.interval_weeks === 2 ? "Every two weeks" : "Weekly")} · {t(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][item.weekday])} {item.local_time.slice(0, 5)} · {t("Reports stay in the conversation; they are not emailed to clients.")}</p>}
    {!recurring && item.completed_at && <p className="ws-muted">{t("This one-time reminder is complete. It will not run again unless rescheduled.")}</p>}
    {recurring && item.last_status === "done" && <p className="ws-muted">{t("Last report completed")}{item.result_href && <Link className="ws-link" href={item.result_href}> · {t("Open report")}</Link>}</p>}
    <div className="ws-actions">
      {item.conversation_id && <Link className="ws-link" href={`/app?conversation=${item.conversation_id}`}>{t("Open delivery conversation")}<ArrowUpRight size={13}/></Link>}
      {recurring ? <Link className="ws-link" href={`/app/roles/${item.role_id}?tab=activity`}>{t("Manage recurring agreement")}</Link> : <>
        {!item.completed_at && <button type="button" className="ws-link" disabled={busy} onClick={() => void update()}>{t(item.enabled ? "Pause reminder" : "Resume reminder")}</button>}
        <button type="button" className="ws-link" onClick={() => { setEditing(!editing); setError(""); }}>{t("Change reminder time")}</button>
      </>}
    </div>
    {editing && <form className="ws-reminder-time-form" onSubmit={event => { event.preventDefault(); void update(true); }}><label>{t("New reminder time")} <small>({Intl.DateTimeFormat().resolvedOptions().timeZone})</small><input aria-label={t("New reminder time")} type="datetime-local" value={time} onChange={event => setTime(event.target.value)} required /></label><button className="ws-button" disabled={busy || !time}>{t("Save")}</button><button type="button" className="ws-link" onClick={() => setEditing(false)}>{t("Cancel")}</button></form>}
    <ErrorNotice error={error || item.error || ""}/>
  </article>;
}

export default function RemindersPage() {
  const t = useT();
  const {locale} = useLanguage();
  const [kind, setKind] = useState<"reminder" | "search_update">("reminder");
  const [page, setPage] = useState(1);
  const query = useQuery<{items: ManagedReminder[]; total: number; page_size: number}>(`/reminders?view=manage&kind=${kind}&page=${page}`);
  useEffect(() => { const timer = setInterval(query.refresh, 15000); return () => clearInterval(timer); }, [query.refresh]);
  const prompt = kind === "search_update"
    ? locale === "zh" ? "帮我安排定期的职位进展报告。我会提供对应职位、报告范围和交付时间。报告保留在对话中，不要发送给客户。" : "Help me arrange a recurring search-progress report. I'll provide the role, what to cover and when to deliver it. Keep reports in this conversation; do not email clients."
    : locale === "zh" ? "提醒我：" : "Remind me to ";
  return <div className="ws-page ws-reminders-page">
    <header className="ws-page-header"><div><h1>{t("Reminders & recurring reports")}</h1><p>{t("Your assistant's agreed follow-ups, delivery times and results.")}</p></div><Link className="ws-button" href={`/app?prompt=${encodeURIComponent(prompt)}`}>{t(kind === "search_update" ? "Arrange a recurring report" : "Ask for a reminder")}</Link></header>
    <div className="ws-reminder-explanation"><Bell size={18}/><p>{t("At the agreed time, a reminder appears in its original conversation and marks that conversation unread. Open the conversation to see it. One-time reminders then become completed; recurring reports continue on their schedule.")}</p></div>
    <nav className="ws-tabs" aria-label={t("Reminders")}><button aria-current={kind === "reminder" ? "page" : undefined} onClick={() => {setKind("reminder");setPage(1);}}>{t("One-time reminders")}</button><button aria-current={kind === "search_update" ? "page" : undefined} onClick={() => {setKind("search_update");setPage(1);}}>{t("Recurring reports")}</button></nav>
    <ErrorNotice error={query.error} retry={query.refresh}/>
    {query.loading && !query.data && <Loading/>}
    {query.data?.items.map(item => <ReminderRow key={item.id} item={item} refresh={query.refresh}/>)}
    {query.data && !query.data.items.length && <p className="ws-empty-inline">{t(kind === "reminder" ? "No reminders yet. Tell your assistant what to remind you about and when." : "No recurring reports yet. Agree on a role, scope and schedule with your assistant.")}</p>}
    {query.data && query.data.total > query.data.page_size && <div className="ws-actions"><button className="ws-button" disabled={page === 1} onClick={() => setPage(page - 1)}>{t("Previous")}</button><span>{page} / {Math.ceil(query.data.total / query.data.page_size)}</span><button className="ws-button" disabled={page * query.data.page_size >= query.data.total} onClick={() => setPage(page + 1)}>{t("Next")}</button></div>}
  </div>;
}
