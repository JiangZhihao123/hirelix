export async function register() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { initializeGlobalOutboundProxy } = await import("@/lib/server-outbound-proxy");
  initializeGlobalOutboundProxy();

  // 调度器已拆分为独立进程（scheduler/），Next.js 应用本身不再启动调度器。
  // 本地开发如需同时运行调度器，请另起终端执行 npm run scheduler:dev
}
