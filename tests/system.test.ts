import { describe, expect, test } from "bun:test";

import { getJson } from "./helpers/request";

describe("GET /", () => {
  test("returns the service identifier", async () => {
    const res = await getJson<string>("/");
    expect(res.status).toBe(200);
    expect(res.body).toBe("OpenStream");
  });
});

describe("GET /livez", () => {
  test("returns ok with uptime and timestamp", async () => {
    const res = await getJson<{
      status: string;
      uptime: number;
      timestamp: string;
    }>("/livez");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    expect(new Date(res.body.timestamp).toString()).not.toBe("Invalid Date");
  });

  test("reflects fresh state on each call (not a cached literal)", async () => {
    const first = await getJson<{ timestamp: string }>("/livez");
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await getJson<{ timestamp: string }>("/livez");
    expect(second.body.timestamp).not.toBe(first.body.timestamp);
  });
});

describe("GET /readyz", () => {
  test("returns a well-formed payload whether deps are up or down", async () => {
    const res = await getJson<{
      status: "ok" | "degraded";
      timestamp: string;
      checks: { database: "ok" | "down"; redis: "ok" | "down" };
    }>("/readyz");

    expect([200, 503]).toContain(res.status);
    expect(["ok", "degraded"]).toContain(res.body.status);
    expect(res.body.checks).toBeDefined();
    expect(["ok", "down"]).toContain(res.body.checks.database);
    expect(["ok", "down"]).toContain(res.body.checks.redis);

    // If any dependency is down, the HTTP status must be 503 so load balancers
    // can drain. This is the load-bearing invariant of /readyz.
    const anyDown =
      res.body.checks.database === "down" || res.body.checks.redis === "down";
    if (anyDown) {
      expect(res.status).toBe(503);
      expect(res.body.status).toBe("degraded");
    }
  });
});

describe("GET /health (alias of /readyz)", () => {
  test("returns the same shape as /readyz", async () => {
    const res = await getJson<{ status: string; checks: object }>("/health");
    expect([200, 503]).toContain(res.status);
    expect(res.body.checks).toBeDefined();
  });
});

describe("404 handler", () => {
  test("unknown routes return a structured 404", async () => {
    const res = await getJson<{ code: string; detail: string }>(
      "/this-route-does-not-exist",
    );
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });
});

describe("security headers", () => {
  test("hardening headers are present on responses", async () => {
    const res = await getJson("/livez");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(res.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(res.headers.get("Cross-Origin-Resource-Policy")).toBe("same-site");
    expect(res.headers.get("Permissions-Policy")).toContain("camera=()");
  });
});
