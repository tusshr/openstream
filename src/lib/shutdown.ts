import type { Server } from "bun";

import { db } from "@/database";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

const SHUTDOWN_SIGNALS = ["SIGTERM", "SIGINT"] as const;

// Generous, but tuned to fit inside the typical k8s
// terminationGracePeriodSeconds: 30s. Coolify allows configuration too.
const FORCE_EXIT_TIMEOUT_MS = 15_000;

let shuttingDown = false;

// A closeable resource is anything we own that needs draining before exit:
// HTTP servers, BullMQ workers, BullMQ queues, etc. Each step is named so
// shutdown logs make the order of operations obvious.
export type Closeable = {
  readonly name: string;
  close(): void | Promise<void>;
};

// Adapters so call sites can pass framework objects directly instead of
// hand-rolling the { name, close } wrapper every time.
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

  // User-supplied resources first (HTTP servers, BullMQ workers) so they
  // stop accepting new work before we tear down the underlying connections.
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

  // Then the shared infra. These are imported singletons; both api and
  // worker hold connections to them, so the shutdown helper owns their
  // lifecycle regardless of which process is exiting.
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

// Registers SIGTERM + SIGINT handlers. The `resources` array drains in
// declaration order before redis/db are closed. Safe to call once at boot;
// repeated signals are no-ops via the `shuttingDown` flag.
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
