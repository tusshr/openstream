import pino, { type Logger, type LoggerOptions } from "pino";

import { env } from "@/env";

const LEVELS = ["fatal", "error", "warn", "info", "debug", "trace"] as const;
type Level = (typeof LEVELS)[number];

function resolveLevel(): Level | "silent" {
  // Tests don't care about log output and we don't want pino JSON polluting
  // assertion output. Override with LOG_LEVEL=info if you need to debug.
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
  // Redact common credential-bearing fields. Pino redacts deeply.
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
  // ISO timestamp (default is epoch ms). Easier to read in raw stdout.
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: "openstream-api",
    env: env.NODE_ENV,
  },
  // No in-process transport. Sync stdout is what containerized log
  // aggregators (Coolify, Docker, k8s) expect. Pipe through `pino-pretty`
  // externally in dev — see the `dev` script.
};

export const logger: Logger = pino(baseOptions);
