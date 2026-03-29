import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";

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

// Real DB + the mocked Redis from setup.ts (used to forge sessions). Skips
// entirely when no database is reachable, like the auth-integration suite.
const educatorId = generateId();
const outsiderId = generateId();
const studentId = generateId();
const courseId = generateId();
const slug = `itest-course-${courseId}`;

async function forge(id: string, role: string): Promise<string> {
  const token = `itest-${id}`;
  await redis.send("SET", [
    `session:${token}`,
    JSON.stringify({
      session: { id: `s-${token}`, token, userId: id },
      user: { id, name: "T", email: `${id}@itest.local`, role },
    }),
    "EX",
    "300",
  ]);
  return token;
}

const cookie = (token: string) => ({ cookie: `session_token=${token}` });
const json = (token: string) => ({
  "content-type": "application/json",
  "x-requested-with": "openstream",
  ...cookie(token),
});

describe.skipIf(!dbUp)("enrollments (real DB)", () => {
  beforeAll(async () => {
    const now = new Date();
    await db.insert(user).values([
      {
        id: educatorId,
        name: "Edu",
        email: `${educatorId}@itest.local`,
        role: "educator",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: outsiderId,
        name: "Other",
        email: `${outsiderId}@itest.local`,
        role: "educator",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: studentId,
        name: "Stu",
        email: `${studentId}@itest.local`,
        role: "student",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.insert(courses).values({
      id: courseId,
      educatorId,
      title: "Integration Course",
      slug,
      status: "published",
      price: "0",
      publishedAt: now,
    });
  });

  afterAll(async () => {
    await db.delete(courses).where(eq(courses.id, courseId)); // cascades enrollments
    await db.delete(user).where(eq(user.id, educatorId));
    await db.delete(user).where(eq(user.id, outsiderId));
    await db.delete(user).where(eq(user.id, studentId));
  });

  test("student enrolls, sees it, drops it (soft-delete), re-enrolls", async () => {
    const student = await forge(studentId, "student");

    const enroll = await callApp<{ data: { id: string } }>("/api/enrollments", {
      method: "POST",
      headers: json(student),
      body: JSON.stringify({ courseId }),
    });
    expect(enroll.status).toBe(201);
    const enrollmentId = enroll.body.data.id;

    // enrolledCount bumped to 1.
    const [c1] = await db
      .select({ n: courses.enrolledCount })
      .from(courses)
      .where(eq(courses.id, courseId));
    expect(c1!.n).toBe(1);

    const mine = await callApp<{ data: Array<{ courseId: string }> }>(
      "/api/enrollments",
      { method: "GET", headers: cookie(student) },
    );
    expect(mine.status).toBe(200);
    expect(mine.body.data.some((e) => e.courseId === courseId)).toBe(true);

    // Owning educator sees the roster; an unrelated educator does not.
    const roster = await callApp<{ data: Array<{ userId: string }> }>(
      `/api/enrollments/course/${courseId}`,
      { method: "GET", headers: cookie(await forge(educatorId, "educator")) },
    );
    expect(roster.status).toBe(200);
    expect(roster.body.data.some((e) => e.userId === studentId)).toBe(true);

    const forbidden = await callApp(`/api/enrollments/course/${courseId}`, {
      method: "GET",
      headers: cookie(await forge(outsiderId, "educator")),
    });
    expect(forbidden.status).toBe(403);

    // Unenroll → soft-delete (row kept, status "dropped", count back to 0).
    const drop = await callApp(`/api/enrollments/${enrollmentId}`, {
      method: "DELETE",
      headers: json(student),
    });
    expect(drop.status).toBe(200);
    const [dropped] = await db
      .select({ status: enrollments.status })
      .from(enrollments)
      .where(eq(enrollments.id, enrollmentId));
    expect(dropped!.status).toBe("dropped");
    const [c2] = await db
      .select({ n: courses.enrolledCount })
      .from(courses)
      .where(eq(courses.id, courseId));
    expect(c2!.n).toBe(0);

    // Re-enrolling reactivates the same row (no duplicate).
    const reenroll = await callApp("/api/enrollments", {
      method: "POST",
      headers: json(student),
      body: JSON.stringify({ courseId }),
    });
    expect(reenroll.status).toBe(201);
    const rows = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.userId, studentId),
          eq(enrollments.courseId, courseId),
        ),
      );
    expect(rows).toHaveLength(1);
  });
});
