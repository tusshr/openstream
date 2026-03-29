import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { courses, enrollments, user } from "@/db/schema";

type EnrollResult =
  | { kind: "ok"; enrollment: typeof enrollments.$inferSelect }
  | { kind: "not-found" }
  | { kind: "payment-required"; price: string }
  | { kind: "already-enrolled" };

export class EnrollmentService {
  async enroll(userId: string, courseId: string): Promise<EnrollResult> {
    const [course] = await db
      .select({ status: courses.status, price: courses.price })
      .from(courses)
      .where(eq(courses.id, courseId));

    if (!course || course.status !== "published") return { kind: "not-found" };
    if (Number(course.price) > 0) {
      return { kind: "payment-required", price: course.price };
    }

    return db.transaction(async (tx) => {
      const inserted = await tx
        .insert(enrollments)
        .values({ userId, courseId })
        .onConflictDoNothing({
          target: [enrollments.userId, enrollments.courseId],
        })
        .returning();

      if (inserted.length > 0) {
        await this.bumpCount(tx, courseId, 1);
        return { kind: "ok", enrollment: inserted[0]! };
      }

      const [existing] = await tx
        .select({ id: enrollments.id, status: enrollments.status })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.userId, userId),
            eq(enrollments.courseId, courseId),
          ),
        );

      if (!existing || existing.status !== "dropped") {
        return { kind: "already-enrolled" };
      }

      const [reactivated] = await tx
        .update(enrollments)
        .set({ status: "active", enrolledAt: new Date(), completedAt: null })
        .where(eq(enrollments.id, existing.id))
        .returning();
      await this.bumpCount(tx, courseId, 1);
      return { kind: "ok", enrollment: reactivated! };
    });
  }

  private async bumpCount(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    courseId: string,
    delta: 1 | -1,
  ) {
    await tx
      .update(courses)
      .set({
        enrolledCount:
          delta === 1
            ? sql`${courses.enrolledCount} + 1`
            : sql`greatest(${courses.enrolledCount} - 1, 0)`,
      })
      .where(eq(courses.id, courseId));
  }

  async unenroll(id: string, userId: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [enr] = await tx
        .select({ courseId: enrollments.courseId, status: enrollments.status })
        .from(enrollments)
        .where(and(eq(enrollments.id, id), eq(enrollments.userId, userId)));

      if (!enr) return false;
      if (enr.status === "dropped") return true;

      await tx
        .update(enrollments)
        .set({ status: "dropped" })
        .where(eq(enrollments.id, id));
      await this.bumpCount(tx, enr.courseId, -1);
      return true;
    });
  }

  listForUser(userId: string) {
    return db
      .select({
        id: enrollments.id,
        courseId: enrollments.courseId,
        courseTitle: courses.title,
        courseSlug: courses.slug,
        status: enrollments.status,
        enrolledAt: enrollments.enrolledAt,
        completedAt: enrollments.completedAt,
      })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .where(eq(enrollments.userId, userId))
      .orderBy(desc(enrollments.enrolledAt));
  }

  listForCourse(courseId: string) {
    return db
      .select({
        id: enrollments.id,
        userId: enrollments.userId,
        studentName: user.name,
        status: enrollments.status,
        enrolledAt: enrollments.enrolledAt,
        completedAt: enrollments.completedAt,
      })
      .from(enrollments)
      .innerJoin(user, eq(enrollments.userId, user.id))
      .where(eq(enrollments.courseId, courseId))
      .orderBy(desc(enrollments.enrolledAt));
  }
}

export const enrollmentService = new EnrollmentService();
