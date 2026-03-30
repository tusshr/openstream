import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { enrollments, lessonProgress, lessons } from "@/db/schema";
import { certificateService } from "@/modules/certificates/service";

import type { RecordProgressBody } from "./model";

type RecordResult =
  | {
      kind: "ok";
      progress: typeof lessonProgress.$inferSelect;
      courseCompleted: boolean;
    }
  | { kind: "not-found" } // lesson missing
  | { kind: "not-enrolled" };

export class ProgressService {
  async record(
    userId: string,
    input: RecordProgressBody,
  ): Promise<RecordResult> {
    const [lesson] = await db
      .select({ courseId: lessons.courseId })
      .from(lessons)
      .where(eq(lessons.id, input.lessonId));
    if (!lesson) return { kind: "not-found" };

    const [enr] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.userId, userId),
          eq(enrollments.courseId, lesson.courseId),
          inArray(enrollments.status, ["active", "completed"]),
        ),
      );
    if (!enr) return { kind: "not-enrolled" };

    const now = new Date();
    const watchedSeconds = input.watchedSeconds ?? 0;
    const completedAt = input.completed ? now : null;

    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(lessonProgress)
        .values({
          userId,
          lessonId: input.lessonId,
          courseId: lesson.courseId,
          watchedSeconds,
          completedAt,
        })
        .onConflictDoUpdate({
          target: [lessonProgress.userId, lessonProgress.lessonId],
          set: {
            watchedSeconds,
            completedAt: input.completed
              ? sql`coalesce(${lessonProgress.completedAt}, ${now})`
              : null,
            updatedAt: now,
          },
        })
        .returning();

      const cert = input.completed
        ? await certificateService.completeCourseIfDone(
            tx,
            userId,
            lesson.courseId,
          )
        : null;

      return { kind: "ok", progress: row!, courseCompleted: cert !== null };
    });
  }

  listForCourse(userId: string, courseId: string) {
    return db
      .select({
        lessonId: lessonProgress.lessonId,
        lessonTitle: lessons.title,
        watchedSeconds: lessonProgress.watchedSeconds,
        completedAt: lessonProgress.completedAt,
        updatedAt: lessonProgress.updatedAt,
      })
      .from(lessonProgress)
      .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
      .where(
        and(
          eq(lessonProgress.userId, userId),
          eq(lessonProgress.courseId, courseId),
        ),
      )
      .orderBy(asc(lessons.position));
  }
}

export const progressService = new ProgressService();
