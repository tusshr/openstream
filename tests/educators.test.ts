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

const CSRF = { "x-requested-with": "openstream" };
const json = (cookie?: string) => ({
  "content-type": "application/json",
  ...CSRF,
  ...(cookie ? { cookie: `session_token=${cookie}` } : {}),
});

describe("educator profile RBAC", () => {
  test("anonymous → 401 on /me", async () => {
    const put = await callApp("/api/educators/me", {
      method: "PUT",
      headers: json(),
      body: JSON.stringify({ headline: "Hi" }),
    });
    const get = await callApp("/api/educators/me", { method: "GET" });
    expect(put.status).toBe(401);
    expect(get.status).toBe(401);
  });

  test("student → 403 (only educators have profiles)", async () => {
    const token = await forgeSession("student");
    const put = await callApp<{ code: string }>("/api/educators/me", {
      method: "PUT",
      headers: json(token),
      body: JSON.stringify({ headline: "Hi" }),
    });
    expect(put.status).toBe(403);
    expect(put.body.code).toBe("FORBIDDEN");

    const get = await callApp("/api/educators/me", {
      method: "GET",
      headers: { cookie: `session_token=${token}` },
    });
    expect(get.status).toBe(403);
  });
});
