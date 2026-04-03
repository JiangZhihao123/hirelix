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
import { startGithubEnrichmentScheduler } from "../src/lib/github-enrichment-scheduler";
import { startSearchJobScheduler } from "../src/lib/search-job-scheduler";

process.title = "hirelix-scheduler";

initializeGlobalOutboundProxy();
startSearchJobScheduler();
startGithubEnrichmentScheduler();

// 保持进程存活（调度器的无限循环会保持进程运行，此行作为安全兜底）
process.stdin.resume();
