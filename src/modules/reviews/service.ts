import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { courseReviews, courses, enrollments, user } from "@/db/schema";

import type { CreateReviewBody, UpdateReviewBody } from "./model";

type CreateResult =
  | { kind: "ok"; review: typeof courseReviews.$inferSelect }
  | { kind: "not-found" } // course missing or not published
  | { kind: "not-enrolled" }
  | { kind: "already-reviewed" };

// Recompute the course's denormalized rating aggregates from its reviews.
// Done in the same transaction as the mutation so they never drift.
async function recomputeRating(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  courseId: string,
) {
  const [agg] = await tx
    .select({
      count: sql<number>`count(*)`,
      avg: sql<string | null>`round(avg(${courseReviews.rating}), 2)`,
    })
    .from(courseReviews)
    .where(eq(courseReviews.courseId, courseId));

  await tx
    .update(courses)
    .set({
      reviewCount: Number(agg?.count ?? 0),
      averageRating: agg?.avg ?? null,
    })
    .where(eq(courses.id, courseId));
}

export class ReviewService {
  async create(
    userId: string,
    courseId: string,
    input: CreateReviewBody,
  ): Promise<CreateResult> {
    const [course] = await db
      .select({ status: courses.status })
      .from(courses)
      .where(eq(courses.id, courseId));
    if (!course || course.status !== "published") return { kind: "not-found" };

    // Only learners who took the course may review it.
    const [enr] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.userId, userId),
          eq(enrollments.courseId, courseId),
          inArray(enrollments.status, ["active", "completed"]),
        ),
      );
    if (!enr) return { kind: "not-enrolled" };

    return db.transaction(async (tx) => {
      const inserted = await tx
        .insert(courseReviews)
        .values({
          userId,
          courseId,
          rating: input.rating,
          body: input.body ?? null,
        })
        .onConflictDoNothing({
          target: [courseReviews.userId, courseReviews.courseId],
        })
        .returning();

      if (inserted.length === 0) return { kind: "already-reviewed" };

      await recomputeRating(tx, courseId);
      return { kind: "ok", review: inserted[0]! };
    });
  }

  getById(id: string) {
    return db
      .select()
      .from(courseReviews)
      .where(eq(courseReviews.id, id))
      .then((r) => r[0] ?? null);
  }

  async update(id: string, patch: UpdateReviewBody) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(courseReviews)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(courseReviews.id, id))
        .returning();
      if (!row) return null;
      await recomputeRating(tx, row.courseId);
      return row;
    });
  }

  async remove(id: string, courseId: string) {
    await db.transaction(async (tx) => {
      await tx.delete(courseReviews).where(eq(courseReviews.id, id));
      await recomputeRating(tx, courseId);
    });
  }

  listForCourse(courseId: string) {
    return db
      .select({
        id: courseReviews.id,
        userId: courseReviews.userId,
        authorName: user.name,
        rating: courseReviews.rating,
        body: courseReviews.body,
        createdAt: courseReviews.createdAt,
        updatedAt: courseReviews.updatedAt,
      })
      .from(courseReviews)
      .innerJoin(user, eq(courseReviews.userId, user.id))
      .where(eq(courseReviews.courseId, courseId))
      .orderBy(desc(courseReviews.createdAt));
  }
}

export const reviewService = new ReviewService();
