import type { Server } from "bun";

import { db } from "@/db";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

const SHUTDOWN_SIGNALS = ["SIGTERM", "SIGINT"] as const;

const FORCE_EXIT_TIMEOUT_MS = 15_000;

let shuttingDown = false;

export type Closeable = {
  readonly name: string;
  close(): void | Promise<void>;
};

export function httpServer(server: Server<unknown> | null): Closeable | null {
  if (!server) return null;
  return {
    name: "http server",
    close: () => server.stop(),
  };
}

async function runShutdown(
  signal: string,
  resources: readonly Closeable[],
): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, "shutdown initiated");

  const forceExitTimer = setTimeout(() => {
    logger.fatal(
      { timeoutMs: FORCE_EXIT_TIMEOUT_MS },
      "forceful exit after shutdown timeout",
    );
    process.exit(1);
  }, FORCE_EXIT_TIMEOUT_MS);
  forceExitTimer.unref();

  for (const resource of resources) {
    try {
      logger.info({ resource: resource.name }, "closing");
      await resource.close();
      logger.info({ resource: resource.name }, "closed");
    } catch (error) {
      logger.error(
        { resource: resource.name, err: error },
        "error while closing resource",
      );
    }
  }

  try {
    logger.info({ resource: "redis" }, "closing");
    redis.close();
    logger.info({ resource: "redis" }, "closed");
  } catch (error) {
    logger.error({ err: error }, "error closing redis");
  }

  try {
    logger.info({ resource: "database" }, "closing");
    await db.$client.end();
    logger.info({ resource: "database" }, "closed");
  } catch (error) {
    logger.error({ err: error }, "error closing database");
  }

  clearTimeout(forceExitTimer);
  logger.info("shutdown complete");
  process.exit(0);
}

export function registerGracefulShutdown(
  resources: ReadonlyArray<Closeable | null>,
): void {
  const filtered = resources.filter((r): r is Closeable => r !== null);

  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, () => {
      void runShutdown(signal, filtered);
    });
  }
}
