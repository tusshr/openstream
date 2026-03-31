import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { enrollments, lessonAttachments, lessons } from "@/db/schema";
import { s3 } from "@/lib/storage";

import type { LessonPlayerSchema } from "./model";

const URL_TTL_SECONDS = 60 * 60;

type PlayableLesson = typeof LessonPlayerSchema.static;

type ViewResult =
  | { kind: "ok"; lesson: PlayableLesson }
  | { kind: "not-found" }
  | { kind: "locked" };

function sign(key: string): string {
  return s3.presign(key, { method: "GET", expiresIn: URL_TTL_SECONDS });
}

export class PlayerService {
  async getLesson(
    lessonId: string,
    userId: string | null,
  ): Promise<ViewResult> {
    const [lesson] = await db
      .select({
        id: lessons.id,
        courseId: lessons.courseId,
        title: lessons.title,
        type: lessons.type,
        content: lessons.content,
        videoKey: lessons.videoKey,
        durationSeconds: lessons.durationSeconds,
        isPreview: lessons.isPreview,
      })
      .from(lessons)
      .where(eq(lessons.id, lessonId));
    if (!lesson) return { kind: "not-found" };

    let access = lesson.isPreview;
    if (!access && userId) {
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
      access = enr != null;
    }
    if (!access) return { kind: "locked" };

    const atts = await db
      .select()
      .from(lessonAttachments)
      .where(eq(lessonAttachments.lessonId, lessonId))
      .orderBy(asc(lessonAttachments.createdAt));

    return {
      kind: "ok",
      lesson: {
        id: lesson.id,
        courseId: lesson.courseId,
        title: lesson.title,
        type: lesson.type,
        content: lesson.content,
        durationSeconds: lesson.durationSeconds,
        isPreview: lesson.isPreview,
        videoUrl: lesson.videoKey ? sign(lesson.videoKey) : null,
        attachments: atts.map((a) => ({
          id: a.id,
          name: a.name,
          mimeType: a.mimeType,
          fileSize: a.fileSize === null ? null : Number(a.fileSize),
          downloadUrl: sign(a.fileKey),
        })),
        urlExpiresInSeconds: URL_TTL_SECONDS,
      },
    };
  }
}

export const playerService = new PlayerService();
