import { beforeEach, describe, expect, test } from "bun:test";

import { rateLimit } from "@/plugins/rate-limit";

import { __resetRedisMock } from "./setup";

type Headers = Record<string, string | number>;

function makeCtx(ip: string | null): {
  request: Request;
  set: { headers: Headers };
} {
  const headers: Record<string, string> = {};
  if (ip !== null) headers["x-forwarded-for"] = ip;
  return {
    request: new Request("http://localhost/test", { headers }),
    set: { headers: {} },
  };
}

beforeEach(() => {
  __resetRedisMock();
});

describe("rateLimit", () => {
  test("allows up to `max` requests in the window", async () => {
    const guard = rateLimit({ key: "t", max: 3, windowSec: 60 });
    for (let i = 0; i < 3; i++) {
      const result = await guard(makeCtx("203.0.113.1"));
      expect(result).toBeUndefined();
    }
  });

  test("rejects the (max+1)th request with 429 and Retry-After", async () => {
    const guard = rateLimit({ key: "t", max: 2, windowSec: 60 });
    const ctx = makeCtx("203.0.113.1");
    await guard(ctx);
    await guard(ctx);
    const result = await guard(ctx);

    // status() returns an ElysiaCustomStatusResponse — code+response are
    // the parts we care about here.
    expect(result).toBeDefined();
    expect(result?.code).toBe(429);
    expect(result?.response).toEqual({
      error: {
        code: "TOO_MANY_REQUESTS",
        message: expect.stringContaining("Rate limit exceeded for 't'"),
        retryAfterSeconds: expect.any(Number),
      },
    });
    expect(ctx.set.headers["Retry-After"]).toBeDefined();
  });

  test("buckets per IP — distinct callers do not interfere", async () => {
    const guard = rateLimit({ key: "t", max: 1, windowSec: 60 });
    expect(await guard(makeCtx("203.0.113.1"))).toBeUndefined();
    // Different IP — still within its own bucket.
    expect(await guard(makeCtx("198.51.100.1"))).toBeUndefined();
    // Same IP again — now over.
    const over = await guard(makeCtx("203.0.113.1"));
    expect(over?.code).toBe(429);
  });

  test("buckets per key — distinct keys do not interfere", async () => {
    const a = rateLimit({ key: "a", max: 1, windowSec: 60 });
    const b = rateLimit({ key: "b", max: 1, windowSec: 60 });
    expect(await a(makeCtx("203.0.113.1"))).toBeUndefined();
    // Same IP, different key — independent bucket.
    expect(await b(makeCtx("203.0.113.1"))).toBeUndefined();
  });

  test("anonymous callers (no IP headers) share the 'anon' bucket", async () => {
    const guard = rateLimit({ key: "t", max: 2, windowSec: 60 });
    expect(await guard(makeCtx(null))).toBeUndefined();
    expect(await guard(makeCtx(null))).toBeUndefined();
    const over = await guard(makeCtx(null));
    expect(over?.code).toBe(429);
  });

  test("window expiry resets the bucket", async () => {
    // windowSec=0 means EXPIRE arms a TTL that purges immediately on the
    // next access. Good enough to assert the reset path is wired.
    const guard = rateLimit({ key: "t", max: 1, windowSec: 0 });
    expect(await guard(makeCtx("203.0.113.1"))).toBeUndefined();
    // Same IP — after the window has elapsed, the next call is fresh.
    const next = await guard(makeCtx("203.0.113.1"));
    expect(next).toBeUndefined();
  });
});
