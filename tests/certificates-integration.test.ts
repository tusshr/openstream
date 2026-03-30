import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { chapters, courses, enrollments, lessons, user } from "@/db/schema";
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
const studentId = generateId();
const courseId = generateId();
const chapterId = generateId();
const lesson1 = generateId();
const lesson2 = generateId();

async function forge(id: string): Promise<string> {
  const token = `itest-${id}`;
  await redis.send("SET", [
    `session:${token}`,
    JSON.stringify({
      session: { id: `s-${token}`, token, userId: id },
      user: { id, name: "Stu", email: `${id}@itest.local`, role: "student" },
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

describe.skipIf(!dbUp)("course completion → certificate (real DB)", () => {
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
        id: studentId,
        name: "Stu",
        email: `${studentId}@itest.local`,
        role: "student",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db
      .insert(courses)
      .values({
        id: courseId,
        educatorId,
        title: "Complete Me",
        slug: `itest-cert-${courseId}`,
        status: "published",
        price: "0",
        publishedAt: now,
      });
    await db
      .insert(chapters)
      .values({ id: chapterId, courseId, title: "Ch1", position: 0 });
    await db.insert(lessons).values([
      { id: lesson1, chapterId, courseId, title: "L1", position: 0 },
      { id: lesson2, chapterId, courseId, title: "L2", position: 1 },
    ]);
    await db
      .insert(enrollments)
      .values({ userId: studentId, courseId, status: "active" });
  });

  afterAll(async () => {
    await db.delete(courses).where(eq(courses.id, courseId)); // cascades chapters/lessons/enrollments/progress/certs
    await db.delete(user).where(eq(user.id, educatorId));
    await db.delete(user).where(eq(user.id, studentId));
  });

  test("finishing every lesson completes the enrollment and issues a certificate", async () => {
    const student = await forge(studentId);

    // First lesson done → not complete yet (1/2).
    const p1 = await callApp<{ data: { courseCompleted: boolean } }>(
      "/api/progress",
      {
        method: "PUT",
        headers: json(student),
        body: JSON.stringify({ lessonId: lesson1, completed: true }),
      },
    );
    expect(p1.status).toBe(200);
    expect(p1.body.data.courseCompleted).toBe(false);

    // Second (last) lesson done → course complete.
    const p2 = await callApp<{ data: { courseCompleted: boolean } }>(
      "/api/progress",
      {
        method: "PUT",
        headers: json(student),
        body: JSON.stringify({ lessonId: lesson2, completed: true }),
      },
    );
    expect(p2.body.data.courseCompleted).toBe(true);

    // Enrollment flipped to completed.
    const [enr] = await db
      .select({ status: enrollments.status })
      .from(enrollments)
      .where(eq(enrollments.userId, studentId));
    expect(enr!.status).toBe("completed");

    // Certificate issued and listed.
    const mine = await callApp<{
      data: Array<{ courseId: string; verificationCode: string }>;
    }>("/api/certificates", {
      method: "GET",
      headers: { cookie: `session_token=${student}` },
    });
    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(1);
    const code = mine.body.data[0]!.verificationCode;

    // Publicly verifiable (no auth).
    const verify = await callApp<{ data: { recipientName: string } }>(
      `/api/certificates/verify/${code}`,
      { method: "GET" },
    );
    expect(verify.status).toBe(200);
    expect(verify.body.data.recipientName).toBe("Stu");

    // Idempotent: re-completing doesn't mint a second certificate.
    await callApp("/api/progress", {
      method: "PUT",
      headers: json(student),
      body: JSON.stringify({ lessonId: lesson2, completed: true }),
    });
    const again = await callApp<{ data: unknown[] }>("/api/certificates", {
      method: "GET",
      headers: { cookie: `session_token=${student}` },
    });
    expect(again.body.data).toHaveLength(1);
  });
});
