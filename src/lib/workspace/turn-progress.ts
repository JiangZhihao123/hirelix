import type { Job } from "./types";

export type TurnActivityEntry = { label: string; at: string };
export type TurnSnapshot = Pick<Job, "id" | "status" | "progress" | "error" | "updated_at"> & {
  result: { live_reply?: string; message_id?: string; activity: TurnActivityEntry[] };
};

export function turnActivity(result: Record<string, unknown> | null): TurnActivityEntry[] {
  return Array.isArray(result?.activity) ? result.activity.filter((entry): entry is TurnActivityEntry =>
    !!entry && typeof entry === "object" && typeof entry.label === "string" && typeof entry.at === "string",
  ).slice(-40) : [];
}

// The browser receives display data only, never job inputs, lease credentials,
// provider payloads or the internal action plan.
export function turnSnapshot(job: Pick<Job, "id" | "status" | "progress" | "error" | "updated_at" | "result">): TurnSnapshot {
  return {
    id: job.id, status: job.status, progress: job.progress, error: job.error, updated_at: job.updated_at,
    result: {
      live_reply: typeof job.result?.live_reply === "string" ? job.result.live_reply : "",
      ...(typeof job.result?.message_id === "string" ? { message_id: job.result.message_id } : {}),
      activity: turnActivity(job.result),
    },
  };
}

export function isTurnRunning(job?: Pick<Job, "status"> | null) {
  return !!job && (job.status === "queued" || job.status === "running");
}
