import { RedisClient } from "bun";

import { env } from "@/env";

export const redis = new RedisClient(env.REDIS_URL, {
  autoReconnect: true,
  maxRetries: 10,
  enableAutoPipelining: true,
});

redis.onclose = (error) => {
  if (error) console.error("[redis] disconnected:", error.message);
};
