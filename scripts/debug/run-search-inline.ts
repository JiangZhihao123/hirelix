import { initializeGlobalOutboundProxy } from "@/lib/server-outbound-proxy";
import { processNextSearchJob } from "@/lib/search-jobs";

async function main() {
  initializeGlobalOutboundProxy();

  const searchId = process.argv[2];
  if (!searchId) {
    console.error("usage: run-search-inline.ts <search-id>");
    process.exit(1);
  }
  console.log(`[inline] processing search ${searchId}`);
  const result = await processNextSearchJob(searchId);
  console.log("[inline] done:", JSON.stringify(result));
}
main().catch((err) => {
  console.error("[inline] fatal:", err);
  process.exit(1);
});
