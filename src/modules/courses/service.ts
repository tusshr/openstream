import { and, asc, desc, eq, isNotNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  chapters,
  courses,
  courseTags,
  educatorProfiles,
  lessons,
  tags,
  user,
} from "@/db/schema";

const DEFAULT_LIMIT = 20;

type ListParams = {
  cursor?: string;
  limit?: number;
  category?: string;
  level?: "beginner" | "intermediate" | "advanced";
  q?: string;
};

type Cursor = { p: string | null; id: string };

function encodeCursor(publishedAt: Date | null, id: string): string {
  return Buffer.from(
    JSON.stringify({ p: publishedAt?.toISOString() ?? null, id }),
  ).toString("base64url");
}

function decodeCursor(cursor: string): Cursor | null {
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString()) as Cursor;
  } catch {
    return null;
  }
}

export class CourseService {
  async list(params: ListParams) {
    const limit = Math.min(params.limit ?? DEFAULT_LIMIT, 50);
    const cursor = params.cursor ? decodeCursor(params.cursor) : null;

    const conditions = [
      eq(courses.status, "published"),
      isNotNull(courses.publishedAt),
    ];

    if (params.category) conditions.push(eq(categories.slug, params.category));
    if (params.level) conditions.push(eq(courses.level, params.level));
    if (params.q)
      conditions.push(
        sql`${courses.search} @@ websearch_to_tsquery('english', ${params.q})`,
      );

    if (cursor) {
      const cursorDate = cursor.p ? new Date(cursor.p) : null;
      const idAfter = sql`${courses.id}::bigint > ${cursor.id}::bigint`;
      if (cursorDate) {
        conditions.push(
          or(
            lt(courses.publishedAt, cursorDate),
            and(eq(courses.publishedAt, cursorDate), idAfter),
          )!,
        );
      } else {
        conditions.push(idAfter);
      }
    }

    const rows = await db
      .select({
        id: courses.id,
        title: courses.title,
        slug: courses.slug,
        description: courses.description,
        level: courses.level,
        price: courses.price,
        enrolledCount: courses.enrolledCount,
        reviewCount: courses.reviewCount,
        averageRating: courses.averageRating,
        publishedAt: courses.publishedAt,
        categoryId: categories.id,
        categoryName: categories.name,
        categorySlug: categories.slug,
      })
      .from(courses)
      .leftJoin(categories, eq(courses.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(desc(courses.publishedAt), asc(sql`${courses.id}::bigint`))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];

    return {
      rows: items.map((r) => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        description: r.description,
        level: r.level,
        price: r.price,
        enrolledCount: r.enrolledCount,
        reviewCount: r.reviewCount,
        averageRating: r.averageRating,
        category:
          r.categoryId !== null
            ? { id: r.categoryId, name: r.categoryName!, slug: r.categorySlug! }
            : null,
      })),
      nextCursor:
        hasMore && last ? encodeCursor(last.publishedAt, last.id) : null,
      hasMore,
      limit,
    };
  }

  async getBySlug(slug: string) {
    const [row] = await db
      .select({
        id: courses.id,
        title: courses.title,
        slug: courses.slug,
        description: courses.description,
        level: courses.level,
        price: courses.price,
        enrolledCount: courses.enrolledCount,
        reviewCount: courses.reviewCount,
        averageRating: courses.averageRating,
        categoryId: categories.id,
        categoryName: categories.name,
        categorySlug: categories.slug,
        educatorName: user.name,
        educatorHeadline: educatorProfiles.headline,
        educatorBio: educatorProfiles.bio,
      })
      .from(courses)
      .leftJoin(categories, eq(courses.categoryId, categories.id))
      .leftJoin(educatorProfiles, eq(courses.educatorId, educatorProfiles.id))
      .leftJoin(user, eq(educatorProfiles.userId, user.id))
      .where(and(eq(courses.slug, slug), eq(courses.status, "published")));

    if (!row) return null;

    const [chapterRows, tagRows] = await Promise.all([
      db
        .select({
          chapterId: chapters.id,
          chapterTitle: chapters.title,
          chapterPosition: chapters.position,
          lessonId: lessons.id,
          lessonTitle: lessons.title,
          lessonType: lessons.type,
          lessonPosition: lessons.position,
          lessonIsPreview: lessons.isPreview,
          lessonDuration: lessons.durationSeconds,
        })
        .from(chapters)
        .leftJoin(lessons, eq(lessons.chapterId, chapters.id))
        .where(eq(chapters.courseId, row.id))
        .orderBy(asc(chapters.position), asc(lessons.position)),
      db
        .select({ id: tags.id, name: tags.name, slug: tags.slug })
        .from(courseTags)
        .innerJoin(tags, eq(courseTags.tagId, tags.id))
        .where(eq(courseTags.courseId, row.id)),
    ]);

    const chaptersMap = new Map<
      string,
      {
        id: string;
        title: string;
        position: number;
        lessons: Array<{
          id: string;
          title: string;
          type: "video" | "text" | "quiz" | "assignment";
          position: number;
          isPreview: boolean;
          durationSeconds: number | null;
        }>;
      }
    >();

    for (const r of chapterRows) {
      if (!chaptersMap.has(r.chapterId)) {
        chaptersMap.set(r.chapterId, {
          id: r.chapterId,
          title: r.chapterTitle,
          position: r.chapterPosition,
          lessons: [],
        });
      }
      if (r.lessonId) {
        chaptersMap.get(r.chapterId)!.lessons.push({
          id: r.lessonId,
          title: r.lessonTitle!,
          type: r.lessonType!,
          position: r.lessonPosition!,
          isPreview: r.lessonIsPreview!,
          durationSeconds: r.lessonDuration,
        });
      }
    }

    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      description: row.description,
      level: row.level,
      price: row.price,
      enrolledCount: row.enrolledCount,
      reviewCount: row.reviewCount,
      averageRating: row.averageRating,
      category:
        row.categoryId !== null
          ? {
              id: row.categoryId,
              name: row.categoryName!,
              slug: row.categorySlug!,
            }
          : null,
      educator:
        row.educatorName !== null
          ? {
              name: row.educatorName,
              headline: row.educatorHeadline,
              bio: row.educatorBio,
            }
          : null,
      chapters: [...chaptersMap.values()].sort(
        (a, b) => a.position - b.position,
      ),
      tags: tagRows,
    };
  }
}

export const courseService = new CourseService();
