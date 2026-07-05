import fs from "node:fs";
import path from "node:path";

export function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

export function loadLocalEnv(cwd = process.cwd()) {
  loadEnvFile(path.resolve(cwd, ".env.local"));
  loadEnvFile(path.resolve(cwd, ".env"));
}

export function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

export function hasEnv(name: string) {
  return Boolean(readEnv(name));
}

export function maskSecret(value: string | null) {
  if (!value) return null;
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function parseBoolean(value: string | undefined, fallback = false) {
  if (value == null) return fallback;
  return ["1", "true", "yes", "y", "on"].includes(value.trim().toLowerCase());
}

export function parsePositiveNumber(value: string | undefined, fallback: number) {
  const parsed = value ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseNonNegativeNumber(value: string | undefined, fallback: number) {
  const parsed = value ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
