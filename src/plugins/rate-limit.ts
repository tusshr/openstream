import { t } from "elysia";

import { ProblemDetailsSchema } from "@/lib/api/models";
import { extractIp } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { HttpProblem } from "@/lib/response";

export type RateLimitOptions = {
  readonly key: string;
  readonly max: number;
  readonly windowSec: number;
};

export type RateLimitContext = {
  readonly request: Request;
};

export const tooManyRequestsResponseSchema = t.Composite([
  ProblemDetailsSchema,
  t.Object({ retryAfterSeconds: t.Integer({ minimum: 0 }) }),
]);

export type TooManyRequestsResponse =
  typeof tooManyRequestsResponseSchema.static;

export function rateLimit(options: RateLimitOptions) {
  return async (ctx: RateLimitContext) => {
    const identity = (extractIp(ctx.request) ?? "anon").slice(0, 64);
    const redisKey = `ratelimit:${options.key}:${identity}`;

    let count: number;
    let ttl: number;
    try {
      count = Number(await redis.send("INCR", [redisKey]));
      if (Number.isNaN(count)) {
        logger.warn(
          { bucket: options.key },
          "rate-limit: INCR returned NaN, failing open",
        );
        return;
      }
      if (count === 1) {
        await redis.send("EXPIRE", [redisKey, String(options.windowSec)]);
        ttl = options.windowSec;
      } else {
        ttl = Number(await redis.send("TTL", [redisKey]));
      }
    } catch (error) {
      logger.warn(
        { err: error, bucket: options.key },
        "rate-limit: redis error, failing open",
      );
      return;
    }

    if (count > options.max) {
      const retryAfter = Math.max(ttl, 0);
      throw new HttpProblem(
        429,
        "TOO_MANY_REQUESTS",
        `Rate limit exceeded for '${options.key}'. Retry after ${retryAfter}s.`,
        {
          extensions: { retryAfterSeconds: retryAfter },
          headers: { "Retry-After": String(retryAfter) },
        },
      );
    }
  };
}
