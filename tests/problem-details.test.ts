import { describe, expect, test } from "bun:test";

import { callApp, getJson, postJson } from "./helpers/request";

// Pins the RFC 9457 error contract: every error is served as
// application/problem+json with the registered members (type/title/status/
// detail) plus our `code` extension. type is always "about:blank", so title
// carries the HTTP status phrase.

type Problem = {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  instance?: string;
  errors?: Array<{ field?: string; message: string }>;
};

describe("RFC 9457 problem details", () => {
  test("404 is problem+json with all registered members", async () => {
    const res = await getJson<Problem>("/this-route-does-not-exist");

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    expect(res.body.type).toBe("about:blank");
    expect(res.body.title).toBe("Not Found");
    expect(res.body.status).toBe(404);
    expect(typeof res.body.detail).toBe("string");
    expect(res.body.code).toBe("NOT_FOUND");
    expect(res.body.instance).toBe("/this-route-does-not-exist");
    // Flat shape — not nested under an `error` key.
    expect(res.body).not.toHaveProperty("error");
  });

  test("401 from the auth macro is problem+json", async () => {
    const res = await getJson<Problem>("/api/me");
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    expect(res.body.code).toBe("UNAUTHORIZED");
    expect(res.body.status).toBe(401);
  });

  test("422 validation carries a field-level `errors` array", async () => {
    const res = await postJson<Problem>("/api/auth/sign-in", {});
    expect(res.status).toBe(422);
    expect(res.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  test("CSRF 403 is problem+json", async () => {
    const res = await callApp<Problem>("/api/auth/sign-out", {
      method: "POST",
    });
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    expect(res.body.code).toBe("FORBIDDEN");
  });
});
