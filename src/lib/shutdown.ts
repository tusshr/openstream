import type { Server } from "bun";

import { db } from "@/database";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

const SHUTDOWN_SIGNALS = ["SIGTERM", "SIGINT"] as const;

// If clean shutdown takes longer than this, exit non-zero so the orchestrator
// (Coolify / k8s / systemd) treats it as a crash and notices. The number is
// tuned to fit inside a typical k8s `terminationGracePeriodSeconds` of 30s
// while leaving headroom for the orchestrator to send SIGKILL on overrun.
const FORCE_EXIT_TIMEOUT_MS = 15_000;

let shuttingDown = false;

async function runShutdown(
  server: Server<unknown> | null,
  signal: string,
): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, "shutdown initiated");

  // Force-exit timer guards against any of the close calls hanging. unref()
  // so the timer doesn't keep the loop alive once cleanup is done.
  const forceExitTimer = setTimeout(() => {
    logger.fatal(
      { timeoutMs: FORCE_EXIT_TIMEOUT_MS },
      "forceful exit after shutdown timeout",
    );
    process.exit(1);
  }, FORCE_EXIT_TIMEOUT_MS);
  forceExitTimer.unref();

  try {
    if (server) {
      logger.info("http server: stop accepting new requests");
      await server.stop();
      logger.info("http server: stopped");
    }

    logger.info("redis: closing");
    redis.close();
    logger.info("redis: closed");

    logger.info("database: closing pool");
    await db.$client.end();
    logger.info("database: closed");
  } catch (error) {
    logger.error({ err: error }, "error during shutdown");
  }

  clearTimeout(forceExitTimer);
  logger.info("shutdown complete");
  process.exit(0);
}

// Registers SIGTERM and SIGINT handlers that drain the HTTP server, close
// external connections, then exit. Safe to call once at boot — the internal
// `shuttingDown` flag makes repeated signals a no-op.
export function registerGracefulShutdown(server: Server<unknown> | null): void {
  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, () => {
      void runShutdown(server, signal);
    });
  }
}
