import { describe, expect, test } from "bun:test";

import { postJson } from "./helpers/request";
import { __resetRedisMock } from "./setup";

describe("auth endpoints are rate limited", () => {
  test("POST /api/auth/2fa/verify returns 429 once the bucket is exhausted", async () => {
    __resetRedisMock();
    const body = { pendingToken: "no-such-token", code: "000000" };

    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await postJson("/api/auth/2fa/verify", body);
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[10]).toBe(429);
  });
});
