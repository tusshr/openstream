import { describe, expect, test } from "bun:test";

import { postJson } from "./helpers/request";
import { __resetRedisMock } from "./setup";

// Proves the rateLimit() beforeHandle is actually wired onto auth endpoints.
// /2fa/verify is convenient: with no pending token in Redis it returns 400
// (INVALID_TOKEN) without touching the DB, so we can drive it past the limit.

describe("auth endpoints are rate limited", () => {
  test("POST /api/auth/2fa/verify returns 429 once the bucket is exhausted", async () => {
    __resetRedisMock();
    const body = { pendingToken: "no-such-token", code: "000000" };

    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await postJson("/api/auth/2fa/verify", body);
      statuses.push(res.status);
    }

    // max is 10/min → first 10 pass the limiter (and 400 on the bogus token),
    // the 11th is throttled.
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
