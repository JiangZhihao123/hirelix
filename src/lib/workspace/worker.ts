import { notifyProductFeedback } from "@/lib/product-feedback";
import { getLogger } from "@/lib/logger";
import { processJob, reclaimJobs, type JobHandler } from "./jobs";
import { prepareRecordBatch } from "./record-batches";
import { assessCandidate } from "./assessment";
import { indexRole } from "./role-retrieval";
import { indexCandidate, retrieveJob } from "./retrieval";
import type { JobKind } from "./types";
import { assistantReply } from "./conversations";
import { deliverReminders } from "./reminders";
import { queueScheduledDrafts } from "./schedules";
import { recoverFileWorkspaces } from "./file-execution";

export const workspaceHandlers: Partial<Record<JobKind, JobHandler>> = {
  chat: assistantReply,
  import: prepareRecordBatch,
  assessment: assessCandidate,
  index: (job, progress) => job.payload.role_id ? indexRole(job, progress) : indexCandidate(job, progress),
  retrieval: retrieveJob,
};
const logger = getLogger({ component: "private_workspace_worker" });
let started = false;
let stopping = false;
let workers: Promise<void>[] = [];
let scheduleTimer: ReturnType<typeof setInterval> | undefined;
let scheduling: Promise<void> | undefined;
let recoveryTimer: ReturnType<typeof setInterval> | undefined;
let recovering: Promise<void> | undefined;
export function startWorkspaceWorker() {
  if (started || process.env.PRIVATE_WORKSPACE_WORKER_ENABLED === "false")
    return;
  started = true;
  stopping = false;
  const concurrency = Math.max(
    1,
    Math.min(4, Number(process.env.PRIVATE_WORKSPACE_WORKER_CONCURRENCY) || 2),
  );
  async function loop(workerIndex: number) {
    while (!stopping) {
      try {
        await reclaimJobs();
        if (stopping) break;
        if (!(await processJob(workspaceHandlers)))
          await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        // Do not put provider payloads, private sources or SQL parameters into shared logs.
        logger.error(
          {
            workerIndex,
            error_type: error instanceof Error ? error.name : "Unknown",
          },
          "Private workspace worker failed",
        );
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }
  workers = Array.from({ length: concurrency }, (_, index) => loop(index + 1));
  const scheduleTick = () => {
    if (scheduling || stopping) return;
    scheduling = (async () => {
      try {
        await deliverReminders();
        if (!stopping) await queueScheduledDrafts();
        if (!stopping) await notifyProductFeedback();
      }
      catch (error) { logger.error({ error_type: error instanceof Error ? error.name : "Unknown" }, "Scheduled draft queue failed"); }
      finally { scheduling = undefined; }
    })();
  };
  scheduleTick();
  scheduleTimer = setInterval(scheduleTick, 15000);
  const recoveryTick = () => {
    if (recovering || stopping) return;
    recovering = (async () => {
      try {
        const result = await recoverFileWorkspaces();
        if (result.removed) logger.info(result, "Recovered abandoned file workspace resources");
      } catch (error) {
        logger.error({ error_type: error instanceof Error ? error.name : "Unknown" }, "File workspace recovery failed; temporary resources may remain");
      } finally { recovering = undefined; }
    })();
  };
  recoveryTick();
  recoveryTimer = setInterval(recoveryTick, 5 * 60 * 1000);
  logger.info({ concurrency }, "Private workspace worker started");
}

export async function stopWorkspaceWorker() {
  stopping = true;
  clearInterval(scheduleTimer);
  clearInterval(recoveryTimer);
  // Active jobs retain their heartbeats until their real result is committed.
  await Promise.all([...workers, scheduling, recovering]);
  started = false;
}
