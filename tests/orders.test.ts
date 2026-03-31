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

describe("orders RBAC", () => {
  test("anonymous → 401", async () => {
    const checkout = await callApp("/api/orders", {
      method: "POST",
      headers: json(),
      body: JSON.stringify({ courseId: "c1" }),
    });
    const pay = await callApp("/api/orders/o1/pay", {
      method: "POST",
      headers: CSRF,
    });
    const list = await callApp("/api/orders", { method: "GET" });
    expect(checkout.status).toBe(401);
    expect(pay.status).toBe(401);
    expect(list.status).toBe(401);
  });

  test("educator → 403 (buying is a student capability)", async () => {
    const token = await forgeSession("educator");
    const checkout = await callApp<{ code: string }>("/api/orders", {
      method: "POST",
      headers: json(token),
      body: JSON.stringify({ courseId: "c1" }),
    });
    expect(checkout.status).toBe(403);
    expect(checkout.body.code).toBe("FORBIDDEN");

    const list = await callApp("/api/orders", {
      method: "GET",
      headers: { cookie: `session_token=${token}` },
    });
    expect(list.status).toBe(403);
  });
});
