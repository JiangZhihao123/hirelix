import path from "node:path";

import { loadLocalEnv } from "./env";
import { checkProviderReadiness } from "./providers";

type CliOptions = {
  network: boolean;
  json: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    network: false,
    json: false,
  };
  for (const arg of argv) {
    if (arg === "--network") {
      options.network = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function main() {
  loadLocalEnv(path.resolve(process.cwd()));
  const options = parseArgs(process.argv.slice(2));
  const readiness = await checkProviderReadiness({ checkNetwork: options.network });

  if (options.json) {
    console.log(JSON.stringify({ readiness }, null, 2));
    return;
  }

  for (const item of readiness) {
    const marker = item.usable ? "OK" : item.required ? "FAIL" : "WARN";
    console.log(`[${marker}] ${item.provider}: ${item.message}`);
    if (item.details) {
      console.log(`      ${JSON.stringify(item.details)}`);
    }
  }

  const requiredFailures = readiness.filter((item) => item.required && !item.usable);
  if (requiredFailures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
