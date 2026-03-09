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

// Just the slice of Elysia's handler context we need. Typing it structurally
// (rather than reaching into Elysia's `Context` type) keeps the factory
// testable with a plain object and avoids coupling to a specific Elysia
// version's context layout. Header values widen to `string | number` to
// match Elysia's `HTTPHeaders` so tests and real routes share one type.
export type RateLimitContext = {
  readonly request: Request;
  readonly set: { headers: Record<string, string | number> };
};

// Returned shape on a 429. `retryAfterSeconds` mirrors the Retry-After
// header for clients that prefer the JSON envelope. Exported as a TypeBox
// schema so rate-limited routes can declare it in their `response` map and
// satisfy Elysia's static response-shape checks.
export const tooManyRequestsResponseSchema = t.Object({
  error: t.Object({
    code: t.Literal("TOO_MANY_REQUESTS"),
    message: t.String(),
    retryAfterSeconds: t.Integer({ minimum: 0 }),
  }),
});

export type TooManyRequestsResponse =
  typeof tooManyRequestsResponseSchema.static;

// Returns a `beforeHandle` function. Plug it into a route's options to
// throttle just that route: `beforeHandle: rateLimit({ key, max, windowSec })`.
export function rateLimit(options: RateLimitOptions) {
  return async (ctx: RateLimitContext) => {
    const identity = extractIp(ctx.request) ?? "anon";
    const redisKey = `ratelimit:${options.key}:${identity}`;

    let count: number;
    let ttl: number;
    try {
      count = Number(await redis.send("INCR", [redisKey]));
      if (count === 1) {
        // First hit in the window — arm the TTL. Doing this only when
        // count === 1 keeps the window aligned to the first request.
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
