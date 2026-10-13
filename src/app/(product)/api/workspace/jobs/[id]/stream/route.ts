import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { workspaceApi } from "@/lib/workspace/http";
import { owned, rows } from "@/lib/workspace/database";
import { idSchema, type Job } from "@/lib/workspace/types";
import { subscribeTurn, type LiveTurn } from "@/lib/workspace/turn-channel";
import { isTurnRunning, turnSnapshot } from "@/lib/workspace/turn-progress";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return workspaceApi(req, async user => {
    const id = idSchema.parse((await context.params).id);
    const initial = await owned<Job>(user.id, "job", id);
    const encoder = new TextEncoder();
    let cancelled = false;
    const stream = new ReadableStream({
      async start(controller) {
        const started = Date.now();
        let previous = "", job = initial, lastKeepalive = started;
        let live: LiveTurn | undefined;
        let unsubscribe: (() => Promise<void>) | undefined;
        const emit = () => {
          if (cancelled || req.signal.aborted) return;
          const snapshot = turnSnapshot(job);
          if (isTurnRunning(job) && live?.attempt === job.attempts && live.epoch === job.result?.stream_epoch && live.sequence > Number(job.result?.stream_sequence || 0)) {
            snapshot.result.stream_sequence = live.sequence;
            snapshot.result.live_reply = live.live_reply;
            snapshot.result.parts = live.parts;
            snapshot.result.phase = live.phase;
          }
          const data = JSON.stringify(snapshot);
          if (data !== previous) {
            controller.enqueue(encoder.encode(`event: snapshot\ndata: ${data}\n\n`));
            previous = data;
          }
        };
        try {
          // Listen before refreshing the checkpoint so a connection race cannot
          // lose content between the initial read and subscription.
          unsubscribe = await subscribeTurn(id, state => {
            if (state.attempt === job.attempts && job.status !== "queued" && state.epoch !== job.result?.stream_epoch) return;
            if (state.attempt < job.attempts || (live && live.epoch === state.epoch && (state.attempt < live.attempt || (state.attempt === live.attempt && state.sequence <= live.sequence)))) return;
            live = state;
            emit();
          });
          while (!cancelled && !req.signal.aborted && Date.now() - started < 55000) {
            const [next] = await rows<Job>(sql`SELECT id,status,progress,error,result,updated_at,attempts FROM hirelix_private_jobs WHERE user_id=${user.id}::uuid AND id=${id}::uuid`);
            if (!next) break;
            job = next;
            emit();
            if (Date.now() - lastKeepalive >= 10000) {
              controller.enqueue(encoder.encode(": keepalive\n\n"));
              lastKeepalive = Date.now();
            }
            if (!isTurnRunning(job)) break;
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (cancelled || req.signal.aborted) break;
          }
          if (!cancelled) controller.close();
        } catch {
          if (!cancelled && !req.signal.aborted) controller.error(new Error("Turn connection interrupted"));
        } finally {
          cancelled = true;
          await unsubscribe?.();
        }
      },
      cancel() { cancelled = true; },
    });
    return new Response(stream, { headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      "X-Accel-Buffering": "no",
    } });
  });
}
