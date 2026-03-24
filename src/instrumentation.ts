export async function register() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { initializeGlobalOutboundProxy } = await import("@/lib/server-outbound-proxy");
  initializeGlobalOutboundProxy();

  const { startSearchJobScheduler } = await import("@/lib/search-job-scheduler");
  startSearchJobScheduler();
}
