import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import { json, rows } from "./database";
import { publishTurn, subscribeTurnStop, type LiveTurn } from "./turn-channel";
import type { TurnPart } from "./turn-progress";
import type { Job } from "./types";
import { getLogger } from "@/lib/logger";

export function liveReplyWriter(job: Job, onStop?: () => void) {
  let latest: LiveTurn | undefined;
  const versions = new Map<number, Array<Exclude<TurnPart, {type: "text"}> | {type: "text"; length: number}>>();
  let cancellationSequence: number | undefined;
  let sequence = 0, saved = 0, sent = 0;
  let saving: Promise<void> | undefined, publishing: Promise<void> | undefined;
  let failure: unknown;
  let closed = false, stopped = false;
  function seal(sequence?: number) {
    cancellationSequence = sequence;
    if (sequence === 0) latest = {epoch: String(job.result?.stream_epoch || ""), attempt: job.attempts, sequence: 0, live_reply: "", parts: []};
    else if (sequence !== undefined && latest && versions.has(sequence)) {
      const current = latest;
      latest = {...current, sequence, live_reply: "", parts: versions.get(sequence)!.map((part, index) => {
        if (part.type !== "text") return part;
        const text = current.parts[index];
        return {type: "text" as const, text: text?.type === "text" ? text.text.slice(0, part.length) : ""};
      })};
    }
  }
  const subscription = subscribeTurnStop(job.id, job.lease_token!, sequence => {
    stopped = true;
    seal(sequence);
    onStop?.();
  });
  // Attach rejection handling immediately; callers await ready before generation.
  void subscription.catch(error => { failure = error; });
  const logger = getLogger({component: "live_reply"});
  function save() {
    if (saving || !latest || saved >= latest.sequence || closed || failure) return saving;
    const state = latest;
    saving = (async () => {
      const updated = await rows(sql`UPDATE hirelix_private_jobs SET result=coalesce(result,'{}'::jsonb) || ${json({live_reply: state.live_reply, parts: state.parts, stream_sequence: state.sequence})},updated_at=now()
        WHERE id=${job.id}::uuid AND user_id=${job.user_id}::uuid AND status='running'
        AND lease_token=${job.lease_token}::uuid AND lease_until>now() RETURNING id`);
      if (!updated.length) throw new Error("Reply checkpoint lost its execution lease");
      saved = state.sequence;
    })().catch(error => { failure = error; }).finally(() => { saving = undefined; });
    return saving;
  }
  function publish() {
    if (publishing || !latest || sent >= latest.sequence || closed || stopped) return publishing;
    const state = latest;
    publishing = publishTurn(job.id, state).then(() => { sent = state.sequence; }).catch(error => {
      // The SSE reconnect/snapshot path still recovers persisted output. Do not
      // falsely finish a reply when its persistence fails, unlike a lost viewer.
      logger.warn({job_id: job.id, error_type: error instanceof Error ? error.name : "Unknown", error_code: (error as {code?: string})?.code}, "Live turn notification failed");
    }).finally(() => { publishing = undefined; });
    return publishing;
  }
  // Independent, bounded lanes: slow writes never hold up model consumption or
  // notifications; slow viewers coalesce to the latest complete display state.
  const pushTimer = setInterval(() => void publish(), 50);
  const saveTimer = setInterval(() => void save(), 1000);
  const write = (text: string, parts: TurnPart[] = [], force = false) => {
    if (closed || stopped) return;
    if (failure) throw failure;
    latest = {epoch: String(job.result?.stream_epoch || ""), attempt: job.attempts, sequence: ++sequence, live_reply: text, parts: structuredClone(parts)};
    // Compact offsets cover both notification and checkpoint versions, without
    // retaining a full copy of the growing text for each token.
    versions.set(latest.sequence, latest.parts.map(part => part.type === "text" ? {type: "text", length: part.text.length} : part));
    if (sequence === 1 || force) void publish();
    if (force) void save();
  };
  write.ready = subscription.then(() => undefined);
  write.flush = async () => {
    await saving;
    if (failure) throw failure;
    await save();
    if (failure) throw failure;
    await publishing;
    await publish();
  };
  write.close = async () => {
    clearInterval(pushTimer); clearInterval(saveTimer);
    await saving;
    await save();
    closed = true;
    await publishing;
    await (await subscription)();
    if (failure && cancellationSequence === undefined) {
      const [cancelled] = await rows<{sequence: number | null}>(sql`SELECT (result->>'cancelled_sequence')::bigint AS sequence
        FROM hirelix_private_jobs WHERE id=${job.id}::uuid AND user_id=${job.user_id}::uuid
          AND status='cancelled' AND result->>'cancelled_lease_token'=${job.lease_token}`);
      if (cancelled?.sequence != null) seal(Number(cancelled.sequence));
    }
    if (!latest || (cancellationSequence === undefined && saved >= latest.sequence)) return;
    const state = latest;
    // Cancellation revokes the execution lease immediately. Only that cancelled
    // lease may seal its last displayed text; it cannot run tools or revive work.
    // A retry has a different lease and must never receive this late checkpoint.
    await db.transaction(async tx => {
      const [cancelled] = await rows<{result: Record<string, unknown>}>(sql`
        UPDATE hirelix_private_jobs SET result=result || ${json({parts: state.parts, stream_sequence: state.sequence})},updated_at=now()
        WHERE id=${job.id}::uuid AND user_id=${job.user_id}::uuid AND status='cancelled'
          AND result->>'cancelled_lease_token'=${job.lease_token}
          AND (coalesce((result->>'stream_sequence')::int,0)<${state.sequence} OR result ? 'cancelled_sequence')
        RETURNING result`, tx);
      const messageId = cancelled?.result.message_id;
      if (typeof messageId === "string") await tx.execute(sql`
        UPDATE hirelix_agent_messages SET metadata=metadata || ${json({parts: state.parts})}
        WHERE id=${messageId}::uuid AND user_id=${job.user_id}::uuid
          AND conversation_id=${String(job.payload.conversation_id)}::uuid AND metadata->>'turn_status'='cancelled'`);
    });
  };

  return write;
}
