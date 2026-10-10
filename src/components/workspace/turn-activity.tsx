"use client";
import { Check, ChevronDown, Loader2, Square, CircleAlert } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { BrandMark } from "@/components/BrandMark";
import { AgentText } from "@/components/AgentText";
import { isTurnRunning, turnActivity, type TurnActivityEntry } from "@/lib/workspace/turn-progress";
import type { Job } from "@/lib/workspace/types";

export const meaningfulProgress = (progress: string) => ![
  "", "Queued", "Queued for retry", "Starting", "Resuming interrupted task", "Complete",
].includes(progress);

export function TurnHistory({ entries, running = false, status }: { entries: TurnActivityEntry[]; running?: boolean; status?: Job["status"] }) {
  const t = useT();
  const visible = entries.filter(entry => meaningfulProgress(entry.label));
  if (!visible.length) return null;
  return <details className="ws-turn-details">
    <summary><ChevronDown size={13} />{t("View activity")}</summary>
    <ol>{visible.map((entry, index) => <li key={`${entry.at}:${index}`}>
      {index === visible.length - 1 && status === "cancelled" ? <Square size={12} />
        : index === visible.length - 1 && status === "error" ? <CircleAlert size={12} />
        : running && index === visible.length - 1 ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
      <span>{t(entry.label)}</span>
    </li>)}</ol>
  </details>;
}

export function TurnActivity({job, disconnected, receivingFiles}: {
  job?: Job | null; disconnected?: boolean; receivingFiles?: boolean;
}) {
  const t = useT();
  const answer = typeof job?.result?.live_reply === "string" ? job.result.live_reply : "";
  const running = !job || isTurnRunning(job);
  const status = receivingFiles ? "Uploading files…" : disconnected ? "Reconnecting…" : answer ? "Replying…"
    : job?.progress && meaningfulProgress(job.progress) ? job.progress : "Thinking…";
  return <article className="ws-message ws-message-assistant ws-turn-activity" aria-label={t("Hirelix")} aria-busy={running}>
    <div className="ws-message-label"><span className="ws-message-avatar ws-message-avatar-assistant"><BrandMark small /></span><strong>{t("Hirelix")}</strong></div>
    {answer && <div className="ws-message-prose ws-live-reply"><AgentText content={answer} /></div>}
    {running && <div className="ws-turn-status" role="status"><Loader2 size={13} className="animate-spin"/><span>{t(status)}</span></div>}
    {job?.status === "cancelled" && <p className="ws-message-status" role="status">{t("Stopped. You can send a new instruction.")}</p>}
    {job?.status === "error" && answer && <p className="ws-message-status">{t("Incomplete response")}</p>}
    <TurnHistory entries={turnActivity(job?.result || null)} running={running} status={job?.status} />
  </article>;
}
