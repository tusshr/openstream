import { sql } from "drizzle-orm";

import { db } from "@/database";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

import type { CheckStatus, ReadinessResponse } from "./model";

const DEPENDENCY_TIMEOUT_MS = 2_000;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} probe timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function probeDatabase(): Promise<CheckStatus> {
  try {
    await withTimeout(
      db.execute(sql`select 1`),
      DEPENDENCY_TIMEOUT_MS,
      "database",
    );
    return "ok";
  } catch (error) {
    logger.warn({ err: error }, "health: database probe failed");
    return "down";
  }
}

async function probeRedis(): Promise<CheckStatus> {
  try {
    await withTimeout(redis.send("PING", []), DEPENDENCY_TIMEOUT_MS, "redis");
    return "ok";
  } catch (error) {
    logger.warn({ err: error }, "health: redis probe failed");
    return "down";
  }
}

export class HealthService {
  async checkReadiness(): Promise<ReadinessResponse> {
    const [database, redisStatus] = await Promise.all([
      probeDatabase(),
      probeRedis(),
    ]);

    const healthy = database === "ok" && redisStatus === "ok";

    return {
      status: healthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks: {
        database,
        redis: redisStatus,
      },
    };
  }
}

export const healthService = new HealthService();
