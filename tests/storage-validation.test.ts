import { describe, expect, test } from "bun:test";

import { getJson, postJson } from "./helpers/request";

// These tests cover the schema-level rejection paths on the storage routes.
// They run without a session because Elysia's body/query validation fires
// before the auth macro resolves, so a malformed payload returns 422
// regardless of credentials. The auth-gated paths (401, 403) belong with the
// auth-gate suite once we have signed-in fixtures.

describe("POST /api/storage/presign/upload — body validation", () => {
  test("missing fields → 422", async () => {
    const res = await postJson<{ error: string }>(
      "/api/storage/presign/upload",
      {},
    );
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("Validation failed");
  });

  test("unknown purpose → 422", async () => {
    const res = await postJson("/api/storage/presign/upload", {
      fileName: "avatar.png",
      contentType: "image/png",
      purpose: "secret-stash",
    });
    expect(res.status).toBe(422);
  });

  test("empty fileName → 422", async () => {
    const res = await postJson("/api/storage/presign/upload", {
      fileName: "",
      contentType: "image/png",
      purpose: "profile-image",
    });
    expect(res.status).toBe(422);
  });
});

describe("GET /api/storage/presign/download — query validation", () => {
  test("missing key → 422", async () => {
    const res = await getJson("/api/storage/presign/download");
    expect(res.status).toBe(422);
  });

  test("malformed key (does not match users/.../.../.../.../...) → 422", async () => {
    const res = await getJson(
      `/api/storage/presign/download?key=${encodeURIComponent("not/a/real/key")}`,
    );
    expect(res.status).toBe(422);
  });
});

describe("DELETE /api/storage/files — query validation", () => {
  test("missing key → 422", async () => {
    const res = await getJson("/api/storage/files", { method: "DELETE" });
    expect(res.status).toBe(422);
  });
});
