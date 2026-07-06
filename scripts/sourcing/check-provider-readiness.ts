import fs from "node:fs";
import path from "node:path";

import { loadLocalEnv } from "./env";
import { checkProviderReadiness } from "./providers";

type CliOptions = {
  network: boolean;
  json: boolean;
  outJsonPath: string | null;
  outMdPath: string | null;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    network: false,
    json: false,
    outJsonPath: null,
    outMdPath: null,
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
    if (arg.startsWith("--out-json=")) {
      options.outJsonPath = arg.slice("--out-json=".length);
      continue;
    }
    if (arg.startsWith("--out-md=")) {
      options.outMdPath = arg.slice("--out-md=".length);
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
  const report = buildReport(readiness, options);

  if (options.outJsonPath) {
    writeText(path.resolve(options.outJsonPath), `${JSON.stringify(report, null, 2)}\n`);
  }
  if (options.outMdPath) {
    writeText(path.resolve(options.outMdPath), renderMarkdown(report));
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
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

function buildReport(
  readiness: Awaited<ReturnType<typeof checkProviderReadiness>>,
  options: CliOptions,
) {
  const requiredFailures = readiness.filter((item) => item.required && !item.usable);
  const warnings = readiness.filter((item) => !item.required && !item.usable);
  return {
    generated_at: new Date().toISOString(),
    network_checked: options.network,
    summary: {
      total: readiness.length,
      ready: readiness.filter((item) => item.status === "ready").length,
      warning: readiness.filter((item) => item.status === "warning").length,
      missing: readiness.filter((item) => item.status === "missing").length,
      error: readiness.filter((item) => item.status === "error").length,
      required_failures: requiredFailures.length,
      optional_unusable: warnings.length,
      usable_for_no_bright_benchmark: requiredFailures.length === 0,
      bright_network_checked: options.network,
    },
    readiness,
    required_failures: requiredFailures,
    warnings,
  };
}

function renderMarkdown(report: ReturnType<typeof buildReport>) {
  const lines = [
    "# Sourcing Provider Readiness Report",
    "",
    "本报告只检查本地 provider 配置状态。未传 `--network` 时不会访问外部服务；传 `--network` 时 Bright 只读查询余额，不创建 snapshot。",
    "",
    "## Summary",
    "",
    `- Network checked：${report.network_checked ? "yes" : "no"}`,
    `- Providers：${report.summary.total}`,
    `- Ready：${report.summary.ready}`,
    `- Warning：${report.summary.warning}`,
    `- Missing：${report.summary.missing}`,
    `- Error：${report.summary.error}`,
    `- Required failures：${report.summary.required_failures}`,
    `- Optional unusable：${report.summary.optional_unusable}`,
    `- Usable for no-Bright benchmark：${report.summary.usable_for_no_bright_benchmark ? "yes" : "no"}`,
    "",
    "## Providers",
    "",
    "| Provider | Required | Usable | Status | Message |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const item of report.readiness) {
    lines.push(
      `| ${item.provider} | ${item.required ? "yes" : "no"} | ${item.usable ? "yes" : "no"} | ${item.status} | ${escapePipe(item.message)} |`,
    );
  }
  if (report.required_failures.length > 0) {
    lines.push(
      "",
      "## Required Failures",
      "",
      ...report.required_failures.map((item) => `- ${item.provider}: ${item.message}`),
    );
  }
  if (report.warnings.length > 0) {
    lines.push(
      "",
      "## Optional Warnings",
      "",
      ...report.warnings.map((item) => `- ${item.provider}: ${item.message}`),
    );
  }
  return `${lines.join("\n")}\n`;
}

function writeText(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function escapePipe(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
