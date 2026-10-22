"use client";

import { useEffect, useRef, useState } from "react";
import { DocumentDownloads } from "./document-download";
import { DocumentAttachments } from "./document-attachments";
import { Check, Clock3, FileText, Loader2, ArrowUpRight } from "lucide-react";
import { AgentText } from "@/components/AgentText";
import { useLanguage, useT } from "@/components/LanguageProvider";
import { api, ErrorNotice, useQuery } from "./client";
import { RevisionPanel } from "./revision";
import type { Deliverable, Job, Schedule } from "@/lib/workspace/types";
import type { AssistantWorkReceipt, AssistantScheduleReceipt } from "@/lib/workspace/assistant-work";

export function ConversationRevision({ revision, onApplied }: { revision: { document_id: string; job_id: string }; onApplied: () => void }) {
  const query = useQuery<{ deliverable: Deliverable }>(`/deliverables/${revision.document_id}`);
  return query.data ? <RevisionPanel document={query.data.deliverable} disabled={query.data.deliverable.status !== "draft"} jobId={revision.job_id} embedded onApplied={() => { query.refresh(); onApplied(); window.dispatchEvent(new Event("hirelix:document-changed")); }} /> : <ErrorNotice error={query.error} retry={query.refresh} />;
}

export function AssistantWork({ receipt, onReady, onRevise, onOpen, exportedDocumentId }: { exportedDocumentId?: string; receipt: AssistantWorkReceipt; onReady: () => void; onRevise: (document: Deliverable) => void; onOpen?: (document: Deliverable) => void }) {
  const t = useT();
  const query = useQuery<{ job: Job }>(`/jobs/${receipt.job_id}`);
  const job = query.data?.job;
  const documentId = typeof job?.result?.deliverable_id === "string" ? job.result.deliverable_id : null;
  const document = useQuery<{ deliverable: Deliverable }>(documentId && documentId !== exportedDocumentId ? `/deliverables/${documentId}` : null);
  const ready = useRef<string | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const refresh = query.refresh;
  const refreshDocument = document.refresh;
  useEffect(() => { const changed = () => { refresh(); refreshDocument(); }; window.addEventListener("hirelix:work-changed", changed); return () => window.removeEventListener("hirelix:work-changed", changed); }, [refresh, refreshDocument]);
  useEffect(() => { window.addEventListener("hirelix:document-changed", refreshDocument); return () => window.removeEventListener("hirelix:document-changed", refreshDocument); }, [refreshDocument]);
  useEffect(() => {
    if (job && ["queued", "running"].includes(job.status)) {
      const timer = setInterval(refresh, 2500);
      return () => clearInterval(timer);
    }
  }, [job?.status, job, refresh]);
  useEffect(() => { if (documentId && ready.current !== documentId) { ready.current = documentId; onReady(); } }, [documentId, onReady]);
  async function stop() {
    setBusy(true); setError("");
    try { await api(`/jobs/${receipt.job_id}`, { method: "DELETE" }); query.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not stop work"); }
    finally { setBusy(false); }
  }
  async function retry() {
    setBusy(true); setError("");
    try { await api(`/jobs/${receipt.job_id}`, { method: "POST" }); query.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not retry draft"); }
    finally { setBusy(false); }
  }
  const draft = document.data?.deliverable;
  if (documentId && documentId === exportedDocumentId) return null;
  const failed = !!(error || query.error || document.error || job?.status === "error");
  const state = failed ? "Needs attention" : !job ? "Loading saved work…" : job.status === "done" ? "Saved" : job.status === "cancelled" ? "Stopped" : job.status === "queued" ? "Queued" : "Preparing…";
  const loading = !failed && (query.loading || document.loading || job?.status === "queued" || job?.status === "running");
  return <section className="ws-assistant-delivery" aria-label={t("Prepared work")}>
    <header><span className="ws-delivery-icon">{loading ? <Loader2 size={17} className="animate-spin" /> : !failed && job?.status === "done" ? <Check size={17} /> : <FileText size={17} />}</span><div><strong>{draft?.title || receipt.title}</strong><small>{t(draft?.source_snapshot.audience === "internal" ? "Internal document" : receipt.kind === "submission" ? "Candidate recommendation" : "Search update")}</small></div><span className="ws-delivery-state">{t(state)}</span></header>
    <ErrorNotice error={error || query.error || job?.error || document.error} retry={job?.status === "error" && !busy ? retry : query.error ? query.refresh : document.error ? document.refresh : undefined} />
    {job && ["queued", "running"].includes(job.status) && <button className="ws-button" disabled={busy} onClick={stop}>{t("Stop")}</button>}
    {draft && <>
      <details><summary>{t("Preview content")}</summary><div className="ws-delivery-content"><AgentText content={draft.content} /></div></details>
      <footer>
        <button className="ws-link" onClick={() => onOpen ? onOpen(draft) : window.location.assign(draft.kind === "search_update" ? `/app/roles/${draft.role_id}/updates/${draft.id}` : `/app/submissions/${draft.id}`)}>{t("Open document")}<ArrowUpRight size={13} /></button>
        <small>{t(draft.status === "submitted" ? "Marked as submitted" : "Nothing has been sent")}</small>
      </footer>
      <details className="ws-delivery-options"><summary>{t("Edit, export and attachments")}</summary>
        <div className="ws-delivery-option-actions"><button className="ws-button" onClick={() => onRevise(draft)}>{t("Ask for a revision")}</button><DocumentDownloads document={draft} onRefresh={document.refresh} /></div>
        <DocumentAttachments document={draft} />
      </details>
    </>}
    {job?.status === "done" && !draft && !document.error && <p>{t("Opening your draft…")}</p>}
  </section>;
}

export function AssistantAgreement({ receipt }: { receipt: AssistantScheduleReceipt }) {
  const t = useT();
  const { locale } = useLanguage();
  const query = useQuery<{ schedule: Schedule | null }>(`/roles/${receipt.role_id}/schedule`);
  const schedule = query.data?.schedule;
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const refresh = query.refresh;
  useEffect(() => { const timer = setInterval(refresh, 15000); return () => clearInterval(timer); }, [refresh]);
  async function toggle() {
    if (!schedule) return;
    setBusy(true); setError("");
    try { await api(`/roles/${receipt.role_id}/schedule`, { method: "PUT", body: JSON.stringify({ ...schedule, expected_version: schedule.version, enabled: !schedule.enabled }) }); query.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save agreement"); }
    finally { setBusy(false); }
  }
  async function retry() {
    setBusy(true); setError("");
    try { await api(`/roles/${receipt.role_id}/schedule`, { method: "POST" }); query.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not retry draft"); }
    finally { setBusy(false); }
  }
  return <section className="ws-assistant-agreement"><Clock3 size={18} /><div><strong>{t("Search update agreement")}</strong><p>{receipt.title}</p>{schedule && <><small>{schedule.enabled ? `${t("Next update")}: ${new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: schedule.timezone }).format(new Date(schedule.next_run_at))} · ${schedule.timezone}` : t("Agreement paused")}</small><small>{t("Role requirements")} · {schedule.person_ids.length} {t("candidate profiles")}{schedule.include_role_records ? ` · ${t("Role records included")}` : ""}{schedule.include_candidate_records ? ` · ${t("Candidate notes included")}` : ""}{!schedule.include_role_records && !schedule.include_candidate_records ? ` · ${t("No private notes")}` : ""}</small></>}<ErrorNotice error={error || query.error || schedule?.error || ""} retry={query.error ? query.refresh : schedule?.error && !busy ? retry : undefined} /></div>{schedule && <button className="ws-link" disabled={busy} onClick={toggle}>{t(schedule.enabled ? "Pause agreement" : "Resume agreement")}</button>}</section>;
}
