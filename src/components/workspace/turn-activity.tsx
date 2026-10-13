"use client";
import { Loader2 } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { AgentText } from "@/components/AgentText";
import { TurnParts } from "./turn-parts";
import { isTurnRunning, turnParts } from "@/lib/workspace/turn-progress";
import type { Job } from "@/lib/workspace/types";

export const meaningfulProgress = (progress: string) => ![
  "", "Queued", "Queued for retry", "Starting", "Resuming interrupted task", "Complete",
].includes(progress);

type TurnStatusProps = {
  job?: Pick<Job, "status" | "progress" | "error" | "result"> | null;
  disconnected?: boolean;
  receivingFiles?: boolean;
};

function TurnStatus({ job, disconnected, receivingFiles }: TurnStatusProps) {
  const t = useT();
  const running = !job || isTurnRunning(job);
  const hasContent = turnParts(job?.result).length > 0 || !!job?.result?.live_reply;
  if (!running || (hasContent && !receivingFiles && !disconnected)) return null;
  const status = receivingFiles ? "Uploading files…" : disconnected ? "Reconnecting…" : "Thinking…";
  return <span className="ws-turn-status" role="status"><Loader2 size={13} className="animate-spin" aria-hidden="true" /><span>{t(status)}</span></span>;
}

export function TurnActivity({job, disconnected, receivingFiles, embedded = false, onRetry, hideContent = false}: {
  job?: Pick<Job, "status" | "progress" | "error" | "result"> | null; disconnected?: boolean; receivingFiles?: boolean; embedded?: boolean; onRetry?: () => Promise<void>; hideContent?: boolean;
}) {
  const t = useT();
  const [retrying, setRetrying] = useState(false);
  const answer = typeof job?.result?.live_reply === "string" ? job.result.live_reply : "";
  const running = !job || isTurnRunning(job);
  const parts = turnParts(job?.result);
  const content = <>
    {!hideContent && !!parts.length && <TurnParts parts={parts} running={running} />}
    {!hideContent && !parts.length && answer && job?.status !== "cancelled" && <div className="ws-message-prose ws-live-reply"><AgentText content={answer} /></div>}
    <TurnStatus job={job} disconnected={disconnected} receivingFiles={receivingFiles} />
    {job?.status === "cancelled" && <p className="ws-message-status" role="status">{t("Stopped. You can send a new instruction.")}</p>}
    {job?.status === "error" && <div className="ws-turn-failure" role="alert">
      <p>{t("I couldn’t finish this request. Your message and any saved results are kept.")}</p>
      {job.error && <p className="ws-message-status">{t(job.error)}</p>}
      {onRetry && <button type="button" className="ws-button" disabled={retrying} onClick={async () => { setRetrying(true); try { await onRetry(); } finally { setRetrying(false); } }}>{t(retrying ? "Retrying…" : "Retry")}</button>}
      <small>{t("You can also send a new instruction below.")}</small>
    </div>}
  </>;
  return embedded ? content : <article className="ws-message ws-message-assistant ws-turn-activity" aria-label={t("Hirelix")} aria-busy={running}>
    <div className="ws-message-label"><span className="ws-message-avatar ws-message-avatar-assistant"><BrandMark small /></span><strong>{t("Hirelix")}</strong></div>
    {content}
  </article>;
}
