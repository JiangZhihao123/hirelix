import type { Job } from "./types";
import { agentPauseReason, type AgentPauseReason } from "./agent-stop";
import type { MailboxResultView } from "./mailbox-contract";

export type TurnPhase = "thinking" | "responding" | "tools" | "complete";

export type TurnPart =
  | { type: "text"; text: string }
  | { type: "tool"; id: string; tool?: string; mail?: MailboxResultView; mail_error?: {status: number; message: string}; list?: {returned: number; total?: number; has_more: boolean; items: Array<{title: string; detail?: string; href?: string}>}; inventory?: {roles?: number; candidates?: number; preferences?: number; reminders?: number}; warning?: string; target?: string; href?: string; label: string; status: "running" | "done" | "error" | "interrupted"; query?: string; sources?: Array<{title: string; href: string}> };

export function turnParts(result: Record<string, unknown> | null | undefined): TurnPart[] {
  const parts = result?.parts ?? result?.previous_parts;
  return Array.isArray(parts) ? parts.filter((part): part is TurnPart =>
    !!part && typeof part === "object" &&
    ((part.type === "text" && typeof part.text === "string") ||
      (part.type === "tool" && typeof part.id === "string" && typeof part.label === "string" &&
        ["running", "done", "error", "interrupted"].includes(part.status))),
  ) : [];
}

export type TurnActivityEntry = { label: string; at: string };
export type TurnSnapshot = Pick<Job, "id" | "status" | "progress" | "error" | "updated_at"> & {
  attempts?: number;
  result: { phase?: TurnPhase; pause_reason?: AgentPauseReason; stream_epoch?: string; stream_sequence?: number; parts?: TurnPart[]; live_reply?: string; message_id?: string; receipt_message_id?: string; receipt_count: number; activity: TurnActivityEntry[] };
};

export function turnActivity(result: Record<string, unknown> | null): TurnActivityEntry[] {
  return Array.isArray(result?.activity) ? result.activity.filter((entry): entry is TurnActivityEntry =>
    !!entry && typeof entry === "object" && typeof entry.label === "string" && typeof entry.at === "string",
  ).slice(-40) : [];
}

// The browser receives display data only, never job inputs, lease credentials,
// provider payloads or the internal action plan.
export function turnSnapshot(job: Pick<Job, "id" | "status" | "progress" | "error" | "updated_at" | "result"> & Partial<Pick<Job, "attempts">>): TurnSnapshot {
  return {
    attempts: job.attempts,
    id: job.id, status: job.status, progress: job.progress, error: job.error, updated_at: job.updated_at,
    result: {
      pause_reason: agentPauseReason(job.result?.pause_reason),
      phase: ["thinking", "responding", "tools", "complete"].includes(String(job.result?.phase)) ? job.result?.phase as TurnPhase : undefined,
      stream_epoch: typeof job.result?.stream_epoch === "string" ? job.result.stream_epoch : undefined,
      stream_sequence: Number(job.result?.stream_sequence || 0),
      parts: turnParts(job.result),
      live_reply: typeof job.result?.live_reply === "string" ? job.result.live_reply : "",
      ...(typeof job.result?.message_id === "string" ? { message_id: job.result.message_id } : {}),
      receipt_message_id: typeof job.result?.receipt_message_id === "string" ? job.result.receipt_message_id : undefined,
      receipt_count: Object.keys((job.result?.tool_receipts ?? {}) as Record<string, unknown>).length,
      activity: turnActivity(job.result),
    },
  };
}

export function isTurnRunning(job?: Pick<Job, "status"> | null) {
  return !!job && (job.status === "queued" || job.status === "running");
}

/** A delivered question supersedes earlier failed attempts to present that question. */
export function visibleTurnParts(parts: TurnPart[]): TurnPart[] {
  const questionDelivered = parts.some(part => part.type === "tool" && part.tool === "ask_user" && part.status === "done");
  return parts.filter(part => {
    if (part.type !== "tool") return true;
    if (part.tool === "read_skill" && part.status !== "error") return false;
    if (part.tool === "ask_user" && (part.status !== "error" || questionDelivered)) return false;
    return true;
  });
}

// Only reconcile an exact transport seam, never rewrite generated prose.
export function continuationSuffix(prefix: string, continuation: string): string {
  for (let size = Math.min(prefix.length, continuation.length); size >= 4; size--) {
    if (prefix.endsWith(continuation.slice(0, size))) return continuation.slice(size);
  }
  return continuation;
}
