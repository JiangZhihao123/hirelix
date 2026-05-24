import { config } from "dotenv";

import { checkApolloHealth } from "@/lib/hunter";
import { initializeGlobalOutboundProxy } from "@/lib/server-outbound-proxy";

config({ path: ".env" });
config({ path: ".env.local", override: true });
initializeGlobalOutboundProxy();

const apiKey = process.env.APOLLO_API_KEY;

async function main() {
  if (!apiKey) {
    throw new Error("APOLLO_API_KEY is not configured");
  }

  const health = await checkApolloHealth(apiKey);
  console.log(
    JSON.stringify(
      {
        health,
        usable: health.healthy && health.isLoggedIn,
      },
      null,
      2,
    ),
  );

  if (!health.healthy || !health.isLoggedIn) {
    throw new Error("Apollo API key is not authenticated. Create or regenerate an API key with People Enrichment access.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
