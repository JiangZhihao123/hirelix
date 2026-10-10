import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { workspaceApi } from "@/lib/workspace/http";
import { owned, rows } from "@/lib/workspace/database";
import { idSchema, type Job } from "@/lib/workspace/types";
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
        try {
          while (!cancelled && !req.signal.aborted && Date.now() - started < 55000) {
            const snapshot = turnSnapshot(job), data = JSON.stringify(snapshot);
            if (data !== previous) {
              controller.enqueue(encoder.encode(`event: snapshot\ndata: ${data}\n\n`));
              previous = data;
            } else if (Date.now() - lastKeepalive >= 10000) {
              controller.enqueue(encoder.encode(": keepalive\n\n"));
              lastKeepalive = Date.now();
            }
            if (!isTurnRunning(job)) break;
            await new Promise(resolve => setTimeout(resolve, 200));
            if (cancelled || req.signal.aborted) break;
            const [next] = await rows<Job>(sql`SELECT id,status,progress,error,result,updated_at FROM hirelix_private_jobs WHERE user_id=${user.id}::uuid AND id=${id}::uuid`);
            if (!next) break;
            job = next;
          }
          if (!cancelled) controller.close();
        } catch {
          if (!cancelled && !req.signal.aborted) controller.error(new Error("Turn connection interrupted"));
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
