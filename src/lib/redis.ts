import { RedisClient } from "bun";

import { env } from "@/env";
import { logger } from "@/lib/logger";

export const redis = new RedisClient(env.REDIS_URL, {
  autoReconnect: true,
  maxRetries: 10,
  enableAutoPipelining: true,
});

redis.onclose = (error) => {
  if (error) {
    logger.warn({ err: error }, "redis: connection closed");
  }
};
