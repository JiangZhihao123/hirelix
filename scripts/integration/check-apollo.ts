import { config } from "dotenv";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { apolloLookup, checkApolloHealth } from "@/lib/hunter";
import { initializeGlobalOutboundProxy } from "@/lib/server-outbound-proxy";

function parseEnvFile(path: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    values[key] = valueParts.join("=").trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

function loadVercelProductionEnv() {
  const dir = mkdtempSync(join(tmpdir(), "hirelix-vercel-env-"));
  const path = join(dir, ".env.production.local");
  try {
    execFileSync("vercel", ["env", "pull", path, "--environment=production"], {
      stdio: "ignore",
    });
    for (const [key, value] of Object.entries(parseEnvFile(path))) {
      process.env[key] = value;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const useVercelProduction = process.argv.includes("--vercel-production");
const runPeopleMatch = process.argv.includes("--people-match");

if (useVercelProduction) {
  loadVercelProductionEnv();
} else {
  config({ path: ".env" });
  config({ path: ".env.local", override: true });
}
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

  if (runPeopleMatch) {
    const result = await apolloLookup(apiKey, {
      firstName: "Tim",
      lastName: "Zheng",
      linkedinUrl: "https://www.linkedin.com/in/tim-zheng/",
      domain: "apollo.io",
    });
    console.log(
      JSON.stringify(
        {
          peopleMatch: {
            emailFound: Boolean(result.email),
            source: result.source,
          },
        },
        null,
        2,
      ),
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
