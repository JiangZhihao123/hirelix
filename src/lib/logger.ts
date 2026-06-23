import fs from "node:fs";
import path from "node:path";

import pino from "pino";

const isDevelopment = process.env.NODE_ENV !== "production";

function isEnabled(value: string | undefined) {
  if (value == null) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function buildStreams(): pino.StreamEntry[] {
  const streams: pino.StreamEntry[] = [
    { stream: process.stdout },
  ];
  const logFilePath = process.env.LOG_FILE_PATH?.trim();

  if (!isEnabled(process.env.LOG_FILE_ENABLED) || !logFilePath) {
    return streams;
  }

  try {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
    streams.push({
      stream: pino.destination({
        dest: logFilePath,
        mkdir: true,
        sync: false,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[logger] failed to initialize log file ${logFilePath}: ${message}\n`);
  }

  return streams;
}

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? "debug" : "info"),
  base: {
    service: "hirelix",
    env: process.env.NODE_ENV || "development",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  redact: {
    paths: [
      "*.password",
      "*.token",
      "*.apiKey",
      "*.authorization",
      "*.Authorization",
      "password",
      "token",
      "apiKey",
      "authorization",
      "Authorization",
    ],
    remove: true,
  },
}, pino.multistream(buildStreams()));

export function getLogger(bindings: pino.Bindings) {
  return logger.child(bindings);
}

export function errorLogFields(error: unknown) {
  if (error instanceof Error) return { err: error };
  return { error: String(error) };
}
