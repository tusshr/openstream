import { beforeEach, describe, expect, test } from "bun:test";

import { HttpProblem } from "@/lib/response";
import { rateLimit } from "@/plugins/rate-limit";

import { __resetRedisMock } from "./setup";

function makeCtx(ip: string | null): { request: Request } {
  const headers: Record<string, string> = {};
  if (ip !== null) headers["x-forwarded-for"] = ip;
  return { request: new Request("http://localhost/test", { headers }) };
}

// Over-limit calls throw an HttpProblem (the central onError turns it into a
// 429 problem+json). Return it so tests can assert on it; null means allowed.
async function runGuard(
  guard: (ctx: { request: Request }) => Promise<void>,
  ctx: { request: Request },
): Promise<HttpProblem | null> {
  try {
    await guard(ctx);
    return null;
  } catch (e) {
    if (e instanceof HttpProblem) return e;
    throw e;
  }
}

beforeEach(() => {
  __resetRedisMock();
});

describe("rateLimit", () => {
  test("allows up to `max` requests in the window", async () => {
    const guard = rateLimit({ key: "t", max: 3, windowSec: 60 });
    for (let i = 0; i < 3; i++) {
      expect(await runGuard(guard, makeCtx("203.0.113.1"))).toBeNull();
    }
  });

  test("rejects the (max+1)th request with 429 and Retry-After", async () => {
    const guard = rateLimit({ key: "t", max: 2, windowSec: 60 });
    const ctx = makeCtx("203.0.113.1");
    await runGuard(guard, ctx);
    await runGuard(guard, ctx);
    const problem = await runGuard(guard, ctx);

    expect(problem).not.toBeNull();
    expect(problem?.status).toBe(429);
    expect(problem?.code).toBe("TOO_MANY_REQUESTS");
    expect(problem?.detail).toContain("Rate limit exceeded for 't'");
    expect(problem?.extensions?.retryAfterSeconds).toEqual(expect.any(Number));
    expect(problem?.headers?.["Retry-After"]).toBeDefined();
  });

  test("buckets per IP — distinct callers do not interfere", async () => {
    const guard = rateLimit({ key: "t", max: 1, windowSec: 60 });
    expect(await runGuard(guard, makeCtx("203.0.113.1"))).toBeNull();
    // Different IP — still within its own bucket.
    expect(await runGuard(guard, makeCtx("198.51.100.1"))).toBeNull();
    // Same IP again — now over.
    const over = await runGuard(guard, makeCtx("203.0.113.1"));
    expect(over?.status).toBe(429);
  });

  test("buckets per key — distinct keys do not interfere", async () => {
    const a = rateLimit({ key: "a", max: 1, windowSec: 60 });
    const b = rateLimit({ key: "b", max: 1, windowSec: 60 });
    expect(await runGuard(a, makeCtx("203.0.113.1"))).toBeNull();
    // Same IP, different key — independent bucket.
    expect(await runGuard(b, makeCtx("203.0.113.1"))).toBeNull();
  });

  test("anonymous callers (no IP headers) share the 'anon' bucket", async () => {
    const guard = rateLimit({ key: "t", max: 2, windowSec: 60 });
    expect(await runGuard(guard, makeCtx(null))).toBeNull();
    expect(await runGuard(guard, makeCtx(null))).toBeNull();
    const over = await runGuard(guard, makeCtx(null));
    expect(over?.status).toBe(429);
  });

  test("window expiry resets the bucket", async () => {
    // windowSec=0 means EXPIRE arms a TTL that purges immediately on the
    // next access. Good enough to assert the reset path is wired.
    const guard = rateLimit({ key: "t", max: 1, windowSec: 0 });
    expect(await runGuard(guard, makeCtx("203.0.113.1"))).toBeNull();
    // Same IP — after the window has elapsed, the next call is fresh.
    const next = await runGuard(guard, makeCtx("203.0.113.1"));
    expect(next).toBeNull();
  });
});
