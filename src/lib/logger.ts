import pino from "pino";

const isDevelopment = process.env.NODE_ENV !== "production";

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
});

export function getLogger(bindings: pino.Bindings) {
  return logger.child(bindings);
}

export function errorLogFields(error: unknown) {
  if (error instanceof Error) return { err: error };
  return { error: String(error) };
}
