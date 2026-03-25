import pino, { type Logger, type LoggerOptions } from "pino";

import { env } from "@/env";

type Level = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

function resolveLevel(): Level | "silent" {
  if (env.LOG_LEVEL) return env.LOG_LEVEL;
  if (env.NODE_ENV === "test") return "silent";
  if (env.NODE_ENV === "production") return "info";
  return "debug";
}

const baseOptions: LoggerOptions = {
  level: resolveLevel(),
  redact: {
    paths: [
      "password",
      "*.password",
      "token",
      "*.token",
      "accessToken",
      "refreshToken",
      "secret",
      "*.secret",
      "authorization",
      'headers["authorization"]',
      'headers["cookie"]',
      'headers["set-cookie"]',
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
    ],
    censor: "[REDACTED]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: env.SERVICE_NAME ?? "openstream-api",
    env: env.NODE_ENV,
  },
};

export const logger: Logger = pino(baseOptions);
