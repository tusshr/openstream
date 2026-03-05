import { describe, expect, test } from "bun:test";

import { getJson } from "./helpers/request";

describe("auth-protected routes reject anonymous callers", () => {
  test("GET /api/me without a session cookie returns 401", async () => {
    const res = await getJson("/api/me");
    expect(res.status).toBe(401);
  });

  test("GET /api/storage/presign/download with a valid key but no session returns 401", async () => {
    // The key shape is valid so validation passes; auth should then refuse.
    const validShapedKey =
      "users/anon/profile-image/00000000-0000-0000-0000-000000000000/file";
    const res = await getJson(
      `/api/storage/presign/download?key=${encodeURIComponent(validShapedKey)}`,
    );
    expect(res.status).toBe(401);
  });
});
