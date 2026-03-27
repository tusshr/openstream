import { describe, expect, test } from "bun:test";

import { buildAbility } from "@/lib/ability";
import { redis } from "@/lib/redis";

import { getJson } from "./helpers/request";

type Problem = { code: string; status: number };

// Forge a session straight into the (mocked) Redis cache so getSession resolves
// it without a database. The 403 path short-circuits in the auth macro's
// resolve — before any handler/DB call — so these run DB-free.
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

const authed = (token: string) => ({
  headers: { cookie: `session_token=${token}` },
});

describe("buildAbility", () => {
  test("admin can manage everything, including users", () => {
    const a = buildAbility({ id: "1", role: "admin" });
    expect(a.can("manage", "all")).toBe(true);
    expect(a.can("read", "User")).toBe(true);
    expect(a.can("update", "User")).toBe(true);
  });

  test("educator authors courses but cannot manage users", () => {
    const a = buildAbility({ id: "1", role: "educator" });
    expect(a.can("create", "Course")).toBe(true);
    expect(a.can("read", "User")).toBe(false);
    expect(a.can("update", "User")).toBe(false);
  });

  test("student can neither author courses nor manage users", () => {
    const a = buildAbility({ id: "1", role: "user" });
    expect(a.can("read", "Course")).toBe(true);
    expect(a.can("create", "Course")).toBe(false);
    expect(a.can("read", "User")).toBe(false);
  });
});

describe("RBAC enforcement on GET /api/users (read:User)", () => {
  test("anonymous → 401", async () => {
    const res = await getJson<Problem>("/api/users");
    expect(res.status).toBe(401);
  });

  test("authenticated student → 403 problem+json", async () => {
    const res = await getJson<Problem>(
      "/api/users",
      authed(await forgeSession("user")),
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    expect(res.body.code).toBe("FORBIDDEN");
  });

  test("authenticated educator → 403 (lacks read:User)", async () => {
    const res = await getJson<Problem>(
      "/api/users",
      authed(await forgeSession("educator")),
    );
    expect(res.status).toBe(403);
  });
});
