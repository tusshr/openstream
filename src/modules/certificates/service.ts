import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  certificates,
  courses,
  enrollments,
  lessonProgress,
  lessons,
  user,
} from "@/db/schema";
import { generateToken } from "@/lib/token";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class CertificateService {
  async completeCourseIfDone(tx: Tx, userId: string, courseId: string) {
    const [counts] = await tx
      .select({
        total: sql<number>`count(*)`,
        done: sql<number>`count(*) filter (where ${lessonProgress.completedAt} is not null and ${lessonProgress.userId} = ${userId})`,
      })
      .from(lessons)
      .leftJoin(
        lessonProgress,
        and(
          eq(lessonProgress.lessonId, lessons.id),
          eq(lessonProgress.userId, userId),
        ),
      )
      .where(eq(lessons.courseId, courseId));

    const total = Number(counts?.total ?? 0);
    const done = Number(counts?.done ?? 0);
    if (total === 0 || done < total) return null;

    const [enr] = await tx
      .select({ id: enrollments.id, status: enrollments.status })
      .from(enrollments)
      .where(
        and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)),
      );
    if (!enr) return null;

    if (enr.status !== "completed") {
      await tx
        .update(enrollments)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(enrollments.id, enr.id));
    }

    const [issued] = await tx
      .insert(certificates)
      .values({
        userId,
        courseId,
        enrollmentId: enr.id,
        verificationCode: generateToken(12),
      })
      .onConflictDoNothing({
        target: [certificates.userId, certificates.courseId],
      })
      .returning();
    if (issued) return issued;
    const [existing] = await tx
      .select()
      .from(certificates)
      .where(
        and(
          eq(certificates.userId, userId),
          eq(certificates.courseId, courseId),
        ),
      );
    return existing ?? null;
  }

  listForUser(userId: string) {
    return db
      .select({
        id: certificates.id,
        courseId: certificates.courseId,
        courseTitle: courses.title,
        verificationCode: certificates.verificationCode,
        issuedAt: certificates.issuedAt,
      })
      .from(certificates)
      .innerJoin(courses, eq(certificates.courseId, courses.id))
      .where(eq(certificates.userId, userId))
      .orderBy(desc(certificates.issuedAt));
  }

  async verifyByCode(code: string) {
    const [row] = await db
      .select({
        recipientName: user.name,
        courseTitle: courses.title,
        verificationCode: certificates.verificationCode,
        issuedAt: certificates.issuedAt,
      })
      .from(certificates)
      .innerJoin(user, eq(certificates.userId, user.id))
      .innerJoin(courses, eq(certificates.courseId, courses.id))
      .where(eq(certificates.verificationCode, code));
    return row ?? null;
  }
}

export const certificateService = new CertificateService();
