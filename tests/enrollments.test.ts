import { describe, expect, test } from "bun:test";

import { redis } from "@/lib/redis";

import { callApp } from "./helpers/request";

// Forge a session into the (mocked) Redis cache; RBAC denials short-circuit in
// the auth macro's resolve, before any handler/DB call — so these run DB-free.
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
const cookie = (token: string) => ({ cookie: `session_token=${token}` });

describe("enrollments RBAC", () => {
  test("anonymous → 401 everywhere", async () => {
    const enroll = await callApp("/api/enrollments", {
      method: "POST",
      headers: json(),
      body: JSON.stringify({ courseId: "c1" }),
    });
    const mine = await callApp("/api/enrollments", { method: "GET" });
    const roster = await callApp("/api/enrollments/course/c1", {
      method: "GET",
    });
    const unenroll = await callApp("/api/enrollments/e1", {
      method: "DELETE",
      headers: CSRF,
    });
    expect(enroll.status).toBe(401);
    expect(mine.status).toBe(401);
    expect(roster.status).toBe(401);
    expect(unenroll.status).toBe(401);
  });

  test("educator → 403 (enroll/list-own are student capabilities)", async () => {
    const token = await forgeSession("educator");

    const enroll = await callApp<{ code: string }>("/api/enrollments", {
      method: "POST",
      headers: json(token),
      body: JSON.stringify({ courseId: "c1" }),
    });
    expect(enroll.status).toBe(403);
    expect(enroll.body.code).toBe("FORBIDDEN");

    const mine = await callApp("/api/enrollments", {
      method: "GET",
      headers: cookie(token),
    });
    expect(mine.status).toBe(403);
  });
});
