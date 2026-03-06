import type { ConnectionOptions } from "bullmq";

import { env } from "@/env";

// BullMQ accepts a URL string OR a ConnectionOptions object. We build the
// object so we can set `maxRetriesPerRequest: null`, which BullMQ *requires*
// when it issues blocking commands (BRPOP / BLPOP / etc). Passing a bare
// URL string causes BullMQ to warn on every Worker startup.
function parseRedisUrl(url: string): ConnectionOptions {
  const parsed = new URL(url);
  const dbFromPath =
    parsed.pathname && parsed.pathname.length > 1
      ? Number(parsed.pathname.slice(1))
      : 0;

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: Number.isFinite(dbFromPath) ? dbFromPath : 0,
    // Required by BullMQ. Default (20) would cause BLPOP to time out and
    // emit "MaxRetriesPerRequestError" once Redis is unreachable for ~20s.
    maxRetriesPerRequest: null,
  };
}

export const QUEUE_CONNECTION: ConnectionOptions = parseRedisUrl(env.REDIS_URL);
