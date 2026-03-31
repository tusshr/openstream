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

const educatorId = generateId();
const studentId = generateId();
const courseId = generateId();

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

describe.skipIf(!dbUp)("orders checkout → pay → enrol (real DB)", () => {
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
        title: "Paid",
        slug: `itest-paid-${courseId}`,
        status: "published",
        price: "19.99",
        publishedAt: now,
      });
  });

  afterAll(async () => {
    await db.delete(courses).where(eq(courses.id, courseId)); // cascades orders/items/enrollments
    await db.delete(user).where(eq(user.id, educatorId));
    await db.delete(user).where(eq(user.id, studentId));
  });

  test("buying a paid course enrols the student; pay is idempotent", async () => {
    const student = await forge(studentId);

    // Direct enrollment is blocked for a paid course.
    const blocked = await callApp("/api/enrollments", {
      method: "POST",
      headers: json(student),
      body: JSON.stringify({ courseId }),
    });
    expect(blocked.status).toBe(402);

    // Checkout → pending order at the course price.
    const checkout = await callApp<{
      data: { id: string; status: string; totalAmount: string };
    }>("/api/orders", {
      method: "POST",
      headers: json(student),
      body: JSON.stringify({ courseId }),
    });
    expect(checkout.status).toBe(201);
    expect(checkout.body.data.status).toBe("pending");
    expect(checkout.body.data.totalAmount).toBe("19.99");
    const orderId = checkout.body.data.id;

    // Pay → completed.
    const pay = await callApp<{ data: { status: string } }>(
      `/api/orders/${orderId}/pay`,
      { method: "POST", headers: json(student) },
    );
    expect(pay.status).toBe(200);
    expect(pay.body.data.status).toBe("completed");

    // Now actively enrolled, count bumped, order item linked to the enrollment.
    const [enr] = await db
      .select({ status: enrollments.status })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.userId, studentId),
          eq(enrollments.courseId, courseId),
        ),
      );
    expect(enr!.status).toBe("active");
    const [c] = await db
      .select({ n: courses.enrolledCount })
      .from(courses)
      .where(eq(courses.id, courseId));
    expect(c!.n).toBe(1);

    const detail = await callApp<{
      data: {
        items: Array<{ enrollmentId: string | null; courseTitle: string }>;
      };
    }>(`/api/orders/${orderId}`, {
      method: "GET",
      headers: { cookie: `session_token=${student}` },
    });
    expect(detail.body.data.items[0]!.enrollmentId).toBeTruthy();

    // Paying again is a no-op; still one enrollment.
    const payAgain = await callApp<{ data: { status: string } }>(
      `/api/orders/${orderId}/pay`,
      { method: "POST", headers: json(student) },
    );
    expect(payAgain.body.data.status).toBe("completed");
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

    // Can't buy a course you already hold.
    const dup = await callApp("/api/orders", {
      method: "POST",
      headers: json(student),
      body: JSON.stringify({ courseId }),
    });
    expect(dup.status).toBe(409);
  });
});
