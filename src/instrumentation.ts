export async function register() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { startSearchJobScheduler } = await import("@/lib/search-job-scheduler");
  startSearchJobScheduler();
}
