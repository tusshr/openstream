import { describe, expect, test } from "bun:test";

import { redis } from "@/lib/redis";

import { callApp } from "./helpers/request";

async function forgeSession(role: string): Promise<string> {
  const token = `tok-${role}-${Math.random().toString(36).slice(2)}`;
  const now = new Date().toISOString();
  const blob = {
    session: {
      id: `s-${token}`,
      token,
      userId: `u-${role}`,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    },
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
  };
  await redis.set(`session:${token}`, JSON.stringify(blob));
  return token;
}

const CSRF = { "x-requested-with": "openstream" };
const json = (cookie?: string) => ({
  "content-type": "application/json",
  ...CSRF,
  ...(cookie ? { cookie: `session_token=${cookie}` } : {}),
});

describe("progress RBAC", () => {
  test("anonymous → 401", async () => {
    const put = await callApp("/api/progress", {
      method: "PUT",
      headers: json(),
      body: JSON.stringify({ lessonId: "l1" }),
    });
    const list = await callApp("/api/progress/course/c1", { method: "GET" });
    expect(put.status).toBe(401);
    expect(list.status).toBe(401);
  });

  test("educator → 403 (progress is a student capability)", async () => {
    const token = await forgeSession("educator");
    const put = await callApp<{ code: string }>("/api/progress", {
      method: "PUT",
      headers: json(token),
      body: JSON.stringify({ lessonId: "l1", completed: true }),
    });
    expect(put.status).toBe(403);
    expect(put.body.code).toBe("FORBIDDEN");

    const list = await callApp("/api/progress/course/c1", {
      method: "GET",
      headers: { cookie: `session_token=${token}` },
    });
    expect(list.status).toBe(403);
  });
});
