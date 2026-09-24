import { getLogger } from "@/lib/logger";
import { processJob, reclaimJobs, type JobHandler } from "./jobs";
import { indexCandidate, retrieveJob } from "./retrieval";
import type { JobKind } from "./types";

export const workspaceHandlers: Partial<Record<JobKind, JobHandler>> = {
  index: indexCandidate,
  retrieval: retrieveJob,
};
const logger = getLogger({ component: "private_workspace_worker" });
let started = false;
export function startWorkspaceWorker() {
  if (started || process.env.PRIVATE_WORKSPACE_WORKER_ENABLED === "false")
    return;
  started = true;
  const concurrency = Math.max(
    1,
    Math.min(4, Number(process.env.PRIVATE_WORKSPACE_WORKER_CONCURRENCY) || 2),
  );
  async function loop(workerIndex: number) {
    for (;;) {
      try {
        await reclaimJobs();
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
  for (let index = 0; index < concurrency; index++) void loop(index + 1);
  logger.info({ concurrency }, "Private workspace worker started");
}
