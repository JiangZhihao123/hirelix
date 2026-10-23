/**
 * 独立调度器进程入口
 *
 * 在 VPS 上作为单独 systemd 服务运行，不依赖 Next.js 运行时。
 * Next.js 应用（Vercel）专注处理 HTTP 请求；本进程专注处理后台搜索任务。
 *
 * 环境变量由 systemd EnvironmentFile（/etc/hirelix.env）注入，本地开发
 * 时需手动传入或通过 .env.local 加载（见 scheduler:dev 脚本）。
 */

import { initializeGlobalOutboundProxy } from "../src/lib/server-outbound-proxy";
import { startWorkspaceWorker, stopWorkspaceWorker } from "../src/lib/workspace/worker";
import { startSearchJobScheduler, stopSearchJobScheduler } from "../src/lib/search-job-scheduler";
import { closeDb } from "../src/db/client";
import { closeTurnChannel } from "../src/lib/workspace/turn-channel";
import { flushPendingLlmUsageEvents } from "../src/lib/search/persistence";
import { getLogger } from "../src/lib/logger";

process.title = "hirelix-scheduler";

initializeGlobalOutboundProxy();
startSearchJobScheduler();
startWorkspaceWorker();

const logger = getLogger({ component: "scheduler_lifecycle" });
let stopping = false;
async function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "Scheduler draining active work");
  // Agent runtime is bounded to 15 minutes. Allow persistence/usage flushing
  // after that, then leave an explicit failed stop for normal lease recovery.
  const deadline = setTimeout(() => {
    logger.error({ timeout_ms: 18 * 60 * 1000 }, "Scheduler drain timed out; unfinished work will recover after lease expiry");
    process.exit(1);
  }, 18 * 60 * 1000);
  try {
    await Promise.all([stopWorkspaceWorker(), stopSearchJobScheduler()]);
    await flushPendingLlmUsageEvents();
    await closeTurnChannel();
    await closeDb();
    logger.info("Scheduler drained active work");
    clearTimeout(deadline);
    process.exit(0);
  } catch (error) {
    logger.error({ error_type: error instanceof Error ? error.name : "Unknown" }, "Scheduler drain failed");
    process.exit(1);
  }
}
process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));

// 保持进程存活（调度器的无限循环会保持进程运行，此行作为安全兜底）
process.stdin.resume();
