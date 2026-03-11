import { status, t } from "elysia";

import { extractIp } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

// Fixed-window rate limit, keyed by (bucket, client IP). The window starts
// the first time a key is hit and resets when EXPIRE fires; that is simpler
// and more predictable than sliding/token-bucket schemes, and good enough
// for the abuse-control buckets we want around auth and presign endpoints.
//
// Identity is the caller's IP. For authenticated routes, IP-based buckets
// can be over-permissive when many real users share a NAT, but they are
// also resistant to a single hostile user creating accounts to amplify
// limits. Switch to per-user buckets only if a specific endpoint needs
// it; do not generalize without that need.

export type RateLimitOptions = {
  readonly key: string;
  readonly max: number;
  readonly windowSec: number;
};

export type RateLimitContext = {
  readonly request: Request;
  readonly set: { headers: Record<string, string | number> };
};

export const tooManyRequestsResponseSchema = t.Object({
  error: t.Object({
    code: t.Literal("TOO_MANY_REQUESTS"),
    message: t.String(),
    retryAfterSeconds: t.Integer({ minimum: 0 }),
  }),
});

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
      // Fail open. A broken Redis must not 500 the API; /readyz is the
      // signal for "system degraded" and the LB drains the pod from there.
      logger.warn(
        { err: error, bucket: options.key },
        "rate-limit: redis error, failing open",
      );
      return;
    }

    if (count > options.max) {
      const retryAfter = Math.max(ttl, 0);
      const body: TooManyRequestsResponse = {
        error: {
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for '${options.key}'. Retry after ${retryAfter}s.`,
          retryAfterSeconds: retryAfter,
        },
      };
      ctx.set.headers["Retry-After"] = String(retryAfter);
      return status(429, body);
    }
  };
}
