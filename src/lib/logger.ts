import pino, { type Logger, type LoggerOptions } from "pino";

import { env } from "@/env";

const LEVELS = ["fatal", "error", "warn", "info", "debug", "trace"] as const;
type Level = (typeof LEVELS)[number];

function resolveLevel(): Level | "silent" {
  const fromEnv = process.env.LOG_LEVEL?.toLowerCase();
  if (fromEnv && (LEVELS as readonly string[]).includes(fromEnv)) {
    return fromEnv as Level;
  }
  if (fromEnv === "silent") return "silent";

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
    service: process.env.SERVICE_NAME ?? "openstream-api",
    env: env.NODE_ENV,
  },
};

export const logger: Logger = pino(baseOptions);
