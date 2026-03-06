import { describe, expect, test } from "bun:test";

import { getJson } from "./helpers/request";

describe("X-Request-Id propagation", () => {
  test("a generated id is echoed back on the response", async () => {
    const res = await getJson("/livez");
    const id = res.headers.get("x-request-id");
    expect(id).toBeTruthy();
    // UUIDv7: 36 chars with dashes, version nibble is 7.
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  test("an inbound X-Request-Id is preserved verbatim", async () => {
    const res = await getJson("/livez", {
      headers: { "x-request-id": "trace-abc-123" },
    });
    expect(res.headers.get("x-request-id")).toBe("trace-abc-123");
  });

  test("two requests get two different generated ids", async () => {
    const a = await getJson("/livez");
    const b = await getJson("/livez");
    const idA = a.headers.get("x-request-id");
    const idB = b.headers.get("x-request-id");
    expect(idA).toBeTruthy();
    expect(idB).toBeTruthy();
    expect(idA).not.toBe(idB);
  });

  test("requests to unmatched routes also receive a request id", async () => {
    const res = await getJson("/this-route-does-not-exist");
    expect(res.status).toBe(404);
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });
});
