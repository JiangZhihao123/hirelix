import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { CostLedgerEntry, RunManifest } from "./types";

export function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

export function readTextFile(filePath: string) {
  return fs.readFileSync(path.resolve(filePath), "utf8");
}

export function writeJson(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeText(filePath: string, value: string) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value);
}

export function appendJsonl(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`);
}

export function createRunId() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `sourcing-${stamp}-${randomUUID().slice(0, 8)}`;
}

export function createRunDir(baseDir: string, runId: string) {
  const dir = path.resolve(baseDir, runId);
  ensureDir(dir);
  return dir;
}

export function writeManifest(runDir: string, manifest: RunManifest) {
  writeJson(path.join(runDir, "manifest.json"), manifest);
}

export function appendLedger(runDir: string, entry: CostLedgerEntry) {
  appendJsonl(path.join(runDir, "cost-ledger.jsonl"), entry);
}
