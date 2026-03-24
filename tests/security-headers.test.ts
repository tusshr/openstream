import { describe, expect, test } from "bun:test";

import { app } from "@/app";

// Security headers must appear on EVERY response, including errors — Elysia
// skips onAfterHandle on the error path, so they're set in onRequest. These
// cases pin that they survive the error path and reach nested /api instances.

function handle(method: string, path: string): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`, { method }));
}

function expectSecurityHeaders(res: Response): void {
  expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  expect(res.headers.get("Referrer-Policy")).toBe(
    "strict-origin-when-cross-origin",
  );
}

describe("security headers", () => {
  test("present on a 200 response", async () => {
    const res = await handle("GET", "/");
    expect(res.status).toBe(200);
    expectSecurityHeaders(res);
  });

  test("present on a 404 (global onError path)", async () => {
    const res = await handle("GET", "/no-such-route");
    expect(res.status).toBe(404);
    expectSecurityHeaders(res);
  });

  test("present on a 401 from a nested /api route", async () => {
    const res = await handle("GET", "/api/me");
    expect(res.status).toBe(401);
    expectSecurityHeaders(res);
  });

  test("present on a CSRF 403", async () => {
    // sign-out has no body schema, so a POST without the x-requested-with
    // header reaches the CSRF guard (rather than failing body validation first).
    const res = await handle("POST", "/api/auth/sign-out");
    expect(res.status).toBe(403);
    expectSecurityHeaders(res);
  });

  test("present on a 422 validation error (onError raw-Response path)", async () => {
    // POST sign-in with no body fails validation before any handler runs.
    const res = await handle("POST", "/api/auth/sign-in");
    expect(res.status).toBe(422);
    expectSecurityHeaders(res);
  });
});
