import { describe, expect, test } from "bun:test";

import { redis } from "@/lib/redis";

import { callApp } from "./helpers/request";

// Forge a session into the (mocked) Redis cache so getSession resolves it
// without a DB. RBAC denials short-circuit in the auth macro's resolve, before
// any handler/DB call — so these run DB-free.
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

describe("course authoring — write routes require an authed educator", () => {
  test("anonymous → 401 on create/update/delete", async () => {
    const create = await callApp("/api/courses", {
      method: "POST",
      headers: json(),
      body: JSON.stringify({ title: "X" }),
    });
    const update = await callApp("/api/courses/123", {
      method: "PATCH",
      headers: json(),
      body: JSON.stringify({ title: "X" }),
    });
    const remove = await callApp("/api/courses/123", {
      method: "DELETE",
      headers: CSRF,
    });
    expect(create.status).toBe(401);
    expect(update.status).toBe(401);
    expect(remove.status).toBe(401);
  });

  test("student → 403 problem+json (lacks create/update/delete:Course)", async () => {
    const token = await forgeSession("student");

    const create = await callApp<{ code: string }>("/api/courses", {
      method: "POST",
      headers: json(token),
      body: JSON.stringify({ title: "X" }),
    });
    expect(create.status).toBe(403);
    expect(create.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    expect(create.body.code).toBe("FORBIDDEN");

    const update = await callApp("/api/courses/123", {
      method: "PATCH",
      headers: json(token),
      body: JSON.stringify({ title: "X" }),
    });
    expect(update.status).toBe(403);

    const remove = await callApp("/api/courses/123", {
      method: "DELETE",
      headers: { ...CSRF, cookie: `session_token=${token}` },
    });
    expect(remove.status).toBe(403);
  });
});

describe("chapter/lesson authoring composes from course ownership", () => {
  test("anonymous → 401 on chapter and lesson writes", async () => {
    const ch = await callApp("/api/chapters", {
      method: "POST",
      headers: json(),
      body: JSON.stringify({ courseId: "c1", title: "Ch" }),
    });
    const le = await callApp("/api/lessons", {
      method: "POST",
      headers: json(),
      body: JSON.stringify({ chapterId: "ch1", title: "L" }),
    });
    expect(ch.status).toBe(401);
    expect(le.status).toBe(401);
  });

  test("student → 403 (lacks update:Course on the parent)", async () => {
    const token = await forgeSession("student");

    const createChapter = await callApp<{ code: string }>("/api/chapters", {
      method: "POST",
      headers: json(token),
      body: JSON.stringify({ courseId: "c1", title: "Ch" }),
    });
    expect(createChapter.status).toBe(403);
    expect(createChapter.body.code).toBe("FORBIDDEN");

    const updateChapter = await callApp("/api/chapters/ch1", {
      method: "PATCH",
      headers: json(token),
      body: JSON.stringify({ title: "x" }),
    });
    expect(updateChapter.status).toBe(403);

    const deleteLesson = await callApp("/api/lessons/l1", {
      method: "DELETE",
      headers: { ...CSRF, cookie: `session_token=${token}` },
    });
    expect(deleteLesson.status).toBe(403);
  });
});

describe("lesson attachments compose from course ownership", () => {
  test("anonymous → 401", async () => {
    const create = await callApp("/api/attachments", {
      method: "POST",
      headers: json(),
      body: JSON.stringify({ lessonId: "l1", name: "f", fileKey: "k" }),
    });
    expect(create.status).toBe(401);
  });

  test("student → 403 on attach/list/delete", async () => {
    const token = await forgeSession("student");
    const create = await callApp<{ code: string }>("/api/attachments", {
      method: "POST",
      headers: json(token),
      body: JSON.stringify({ lessonId: "l1", name: "f", fileKey: "k" }),
    });
    expect(create.status).toBe(403);
    expect(create.body.code).toBe("FORBIDDEN");

    const list = await callApp("/api/attachments/lesson/l1", {
      method: "GET",
      headers: { cookie: `session_token=${token}` },
    });
    expect(list.status).toBe(403);

    const remove = await callApp("/api/attachments/a1", {
      method: "DELETE",
      headers: { ...CSRF, cookie: `session_token=${token}` },
    });
    expect(remove.status).toBe(403);
  });
});

describe("reading own drafts (educator dashboard)", () => {
  test("anonymous → 401", async () => {
    expect((await callApp("/api/courses/mine", { method: "GET" })).status).toBe(
      401,
    );
    expect(
      (await callApp("/api/courses/mine/c1", { method: "GET" })).status,
    ).toBe(401);
  });

  test("student → 403 (not a course author)", async () => {
    const token = await forgeSession("student");
    const list = await callApp("/api/courses/mine", {
      method: "GET",
      headers: { cookie: `session_token=${token}` },
    });
    const detail = await callApp("/api/courses/mine/c1", {
      method: "GET",
      headers: { cookie: `session_token=${token}` },
    });
    expect(list.status).toBe(403);
    expect(detail.status).toBe(403);
  });
});
