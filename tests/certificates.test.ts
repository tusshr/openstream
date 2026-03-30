import { describe, expect, test } from "bun:test";

import { redis } from "@/lib/redis";

import { callApp } from "./helpers/request";

async function forgeSession(role: string): Promise<string> {
  const token = `tok-${role}-${Math.random().toString(36).slice(2)}`;
  const now = new Date().toISOString();
  await redis.set(
    `session:${token}`,
    JSON.stringify({
      session: { id: `s-${token}`, token, userId: `u-${role}` },
      user: {
        id: `u-${role}`,
        name: "Test",
        email: `${role}@test.local`,
        role,
        emailVerified: true,
        image: null,
        password: null,
        createdAt: now,
        updatedAt: now,
      },
    }),
  );
  return token;
}

describe("certificates RBAC", () => {
  test("anonymous → 401 on my certificates", async () => {
    const res = await callApp("/api/certificates", { method: "GET" });
    expect(res.status).toBe(401);
  });

  test("educator → 403 (no read:Certificate)", async () => {
    const res = await callApp("/api/certificates", {
      method: "GET",
      headers: { cookie: `session_token=${await forgeSession("educator")}` },
    });
    expect(res.status).toBe(403);
  });
});
