import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { courses, enrollments, user } from "@/db/schema";
import { generateId } from "@/lib/id";
import { redis } from "@/lib/redis";

import { callApp } from "./helpers/request";

let dbUp = false;
try {
  await db.execute(sql`select 1`);
  dbUp = true;
} catch {
  dbUp = false;
}

const educatorId = generateId();
const s1 = generateId();
const s2 = generateId();
const outsiderId = generateId();
const courseId = generateId();

async function forge(id: string): Promise<string> {
  const token = `itest-${id}`;
  await redis.send("SET", [
    `session:${token}`,
    JSON.stringify({
      session: { id: `s-${token}`, token, userId: id },
      user: { id, name: "T", email: `${id}@itest.local`, role: "student" },
    }),
    "EX",
    "300",
  ]);
  return token;
}
const json = (token: string) => ({
  "content-type": "application/json",
  "x-requested-with": "openstream",
  cookie: `session_token=${token}`,
});

async function avgRating(): Promise<string | null> {
  const [c] = await db
    .select({ avg: courses.averageRating, n: courses.reviewCount })
    .from(courses)
    .where(eq(courses.id, courseId));
  return c ? `${c.avg}/${c.n}` : null;
}

describe.skipIf(!dbUp)("reviews + rating aggregates (real DB)", () => {
  beforeAll(async () => {
    const now = new Date();
    await db.insert(user).values(
      [educatorId, s1, s2, outsiderId].map((id) => ({
        id,
        name: "U",
        email: `${id}@itest.local`,
        role: id === educatorId ? ("educator" as const) : ("student" as const),
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })),
    );
    await db.insert(courses).values({
      id: courseId,
      educatorId,
      title: "Reviewable",
      slug: `itest-rev-${courseId}`,
      status: "published",
      price: "0",
      publishedAt: now,
    });
    await db
      .insert(enrollments)
      .values(
        [s1, s2].map((userId) => ({
          userId,
          courseId,
          status: "active" as const,
        })),
      );
  });

  afterAll(async () => {
    await db.delete(courses).where(eq(courses.id, courseId)); // cascades reviews + enrollments
    for (const id of [educatorId, s1, s2, outsiderId]) {
      await db.delete(user).where(eq(user.id, id));
    }
  });

  test("create/update/delete keep averageRating + reviewCount correct", async () => {
    // s1 rates 4 → avg 4.00, count 1
    const r1 = await callApp<{ data: { id: string } }>("/api/reviews", {
      method: "POST",
      headers: json(await forge(s1)),
      body: JSON.stringify({ courseId, rating: 4 }),
    });
    expect(r1.status).toBe(201);
    expect(await avgRating()).toBe("4.00/1");

    // s2 rates 2 → avg 3.00, count 2
    await callApp("/api/reviews", {
      method: "POST",
      headers: json(await forge(s2)),
      body: JSON.stringify({ courseId, rating: 2 }),
    });
    expect(await avgRating()).toBe("3.00/2");

    // not enrolled → 403; duplicate → 409
    const outsider = await callApp("/api/reviews", {
      method: "POST",
      headers: json(await forge(outsiderId)),
      body: JSON.stringify({ courseId, rating: 5 }),
    });
    expect(outsider.status).toBe(403);
    const dup = await callApp("/api/reviews", {
      method: "POST",
      headers: json(await forge(s1)),
      body: JSON.stringify({ courseId, rating: 1 }),
    });
    expect(dup.status).toBe(409);

    // s1 edits 4 → 5 → avg (5+2)/2 = 3.50
    await callApp(`/api/reviews/${r1.body.data.id}`, {
      method: "PATCH",
      headers: json(await forge(s1)),
      body: JSON.stringify({ rating: 5 }),
    });
    expect(await avgRating()).toBe("3.50/2");

    // delete s1's review → only s2's (2) remains → avg 2.00, count 1
    await callApp(`/api/reviews/${r1.body.data.id}`, {
      method: "DELETE",
      headers: json(await forge(s1)),
    });
    expect(await avgRating()).toBe("2.00/1");
  });
});
