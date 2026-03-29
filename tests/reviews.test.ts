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

describe("reviews RBAC", () => {
  test("anonymous → 401 on write routes", async () => {
    const create = await callApp("/api/reviews", {
      method: "POST",
      headers: json(),
      body: JSON.stringify({ courseId: "c1", rating: 5 }),
    });
    const update = await callApp("/api/reviews/r1", {
      method: "PATCH",
      headers: json(),
      body: JSON.stringify({ rating: 4 }),
    });
    const remove = await callApp("/api/reviews/r1", {
      method: "DELETE",
      headers: CSRF,
    });
    expect(create.status).toBe(401);
    expect(update.status).toBe(401);
    expect(remove.status).toBe(401);
  });

  test("educator → 403 on create (reviewing is a student capability)", async () => {
    const token = await forgeSession("educator");
    const create = await callApp<{ code: string }>("/api/reviews", {
      method: "POST",
      headers: json(token),
      body: JSON.stringify({ courseId: "c1", rating: 5 }),
    });
    expect(create.status).toBe(403);
    expect(create.body.code).toBe("FORBIDDEN");
  });

  test("rating out of range → 422 (validation, before any handler)", async () => {
    const token = await forgeSession("student");
    const bad = await callApp("/api/reviews", {
      method: "POST",
      headers: json(token),
      body: JSON.stringify({ courseId: "c1", rating: 9 }),
    });
    expect(bad.status).toBe(422);
  });
});
