import { describe, expect, test } from "bun:test";

import { callApp } from "./helpers/request";

// These tests bypass the postJson/deleteJson helpers because those add the
// CSRF header automatically. Here we want to assert what happens *without*
// it — i.e. how an attacker's cross-site request would be treated.

describe("CSRF guard", () => {
  test("rejects POST to /api/storage/presign/upload without the CSRF header", async () => {
    const res = await callApp<{ error: { code: string; message: string } }>(
      "/api/storage/presign/upload",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fileName: "x.png",
          contentType: "image/png",
          purpose: "profile-image",
        }),
      },
    );
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(res.body.error.message).toMatch(/x-requested-with/i);
  });

  test("rejects DELETE to /api/storage/files without the CSRF header", async () => {
    // Use a structurally valid key so query validation passes and we
    // actually reach the CSRF check. (Elysia runs route validation before
    // onBeforeHandle, so an invalid key would 422 first.)
    const validKey =
      "users/anon/profile-image/00000000-0000-0000-0000-000000000000/file";
    const res = await callApp<{ error: { code: string; message: string } }>(
      `/api/storage/files?key=${encodeURIComponent(validKey)}`,
      { method: "DELETE" },
    );
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  test("accepts POST when the CSRF header is set (falls through to auth)", async () => {
    // With the header present, CSRF passes and the auth macro takes over.
    // Without a session cookie that means 401.
    const res = await callApp("/api/storage/presign/upload", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-requested-with": "openstream",
      },
      body: JSON.stringify({
        fileName: "x.png",
        contentType: "image/png",
        purpose: "profile-image",
      }),
    });
    expect(res.status).toBe(401);
  });

  test("rejects POST when the CSRF header has the wrong value", async () => {
    const res = await callApp("/api/storage/presign/upload", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-requested-with": "XMLHttpRequest",
      },
      body: JSON.stringify({
        fileName: "x.png",
        contentType: "image/png",
        purpose: "profile-image",
      }),
    });
    expect(res.status).toBe(403);
  });

  test("safe methods (GET) require no CSRF header", async () => {
    const res = await callApp("/livez");
    expect(res.status).toBe(200);
  });

  test("/api/auth/* is exempt — better-auth handles its own CSRF", async () => {
    // Sign-in without a CSRF header. better-auth still runs and returns its
    // own status (400 for empty body), proving our guard didn't intercept.
    const res = await callApp("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).not.toBe(403);
  });
});
