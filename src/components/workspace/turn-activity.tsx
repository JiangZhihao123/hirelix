"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { AgentText } from "@/components/AgentText";
import type { Job } from "@/lib/workspace/types";
import { api } from "./client";

export const meaningfulProgress = (progress: string) => ![
  "", "Queued", "Queued for retry", "Starting", "Preparing your reply",
  "Reading your conversation and workspace", "Resuming interrupted task", "Complete",
].includes(progress);

export function TurnActivity({job, onComplete, onStop}: {
  job?: Job | null; onComplete: () => void; onStop: () => void;
}) {
  const t = useT();
  const [latest, setLatest] = useState<Job | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const active = latest?.id === job?.id ? latest : job;
  const jobId = job?.id, jobStatus = job?.status;
  useEffect(() => {
    if (!jobId || !jobStatus || !["queued", "running"].includes(jobStatus)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const {job: update} = await api<{job: Job}>(`/jobs/${jobId}`, {signal: controller.signal});
        if (controller.signal.aborted) return;
        setLatest(update); setDisconnected(false);
        if (!["queued", "running"].includes(update.status)) { onComplete(); return; }
      } catch { if (controller.signal.aborted) return; setDisconnected(true); }
      timer = setTimeout(poll, 750);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [jobId, jobStatus, onComplete]);
  const pending = !active || ["queued", "running"].includes(active.status);
  if (!pending) return null;
  const answer = active?.status === "running" && typeof active.result?.live_reply === "string" ? active.result.live_reply : "";
  return <div className="ws-turn-activity">
    {answer && <div className="ws-message-prose ws-live-reply"><AgentText content={answer}/></div>}
    <div className="ws-turn-status" role="status"><Loader2 size={13} className="animate-spin"/><span>{t(disconnected ? "Reconnecting…" : answer ? "Replying…" : active?.progress && meaningfulProgress(active.progress) ? "Working…" : "Thinking…")}</span>
      {job && <button type="button" className="ws-link" onClick={onStop}>{t("Stop")}</button>}
    </div>
    {active?.progress && meaningfulProgress(active.progress) && <details className="ws-turn-details"><summary>{t("View activity")}</summary><p>{t(active.progress)}</p></details>}
  </div>;
}
