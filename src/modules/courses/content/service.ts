import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { chapters, lessonAttachments, lessons } from "@/db/schema";

import type {
  CreateAttachmentBody,
  CreateChapterBody,
  CreateLessonBody,
  UpdateChapterBody,
  UpdateLessonBody,
} from "./model";

function toAttachment(row: typeof lessonAttachments.$inferSelect) {
  return {
    id: row.id,
    lessonId: row.lessonId,
    name: row.name,
    fileKey: row.fileKey,
    fileSize: row.fileSize === null ? null : Number(row.fileSize),
    mimeType: row.mimeType,
    createdAt: row.createdAt,
  };
}

export class CourseContentService {
  async getChapter(id: string) {
    return await db
      .select()
      .from(chapters)
      .where(eq(chapters.id, id))
      .then((r) => r[0] ?? null);
  }

  private async nextChapterPosition(courseId: string): Promise<number> {
    const [r] = await db
      .select({
        next: sql<number>`coalesce(max(${chapters.position}), -1) + 1`,
      })
      .from(chapters)
      .where(eq(chapters.courseId, courseId));
    return Number(r?.next ?? 0);
  }

  async createChapter(courseId: string, input: CreateChapterBody) {
    const position =
      input.position ?? (await this.nextChapterPosition(courseId));
    const [row] = await db
      .insert(chapters)
      .values({ courseId, title: input.title, position })
      .returning();
    return row!;
  }

  async updateChapter(id: string, patch: UpdateChapterBody) {
    const [row] = await db
      .update(chapters)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(chapters.id, id))
      .returning();
    return row ?? null;
  }

  async deleteChapter(id: string) {
    const rows = await db
      .delete(chapters)
      .where(eq(chapters.id, id))
      .returning({ id: chapters.id });
    return rows.length > 0;
  }

  async getLesson(id: string) {
    return await db
      .select()
      .from(lessons)
      .where(eq(lessons.id, id))
      .then((r) => r[0] ?? null);
  }

  private async nextLessonPosition(chapterId: string): Promise<number> {
    const [r] = await db
      .select({ next: sql<number>`coalesce(max(${lessons.position}), -1) + 1` })
      .from(lessons)
      .where(eq(lessons.chapterId, chapterId));
    return Number(r?.next ?? 0);
  }

  async createLesson(
    chapterId: string,
    courseId: string,
    input: CreateLessonBody,
  ) {
    const position =
      input.position ?? (await this.nextLessonPosition(chapterId));
    const [row] = await db
      .insert(lessons)
      .values({
        chapterId,
        courseId,
        title: input.title,
        type: input.type ?? "video",
        position,
        isPreview: input.isPreview ?? false,
        videoKey: input.videoKey ?? null,
        durationSeconds: input.durationSeconds ?? null,
        content: input.content ?? null,
      })
      .returning();
    return row!;
  }

  async updateLesson(id: string, patch: UpdateLessonBody) {
    const [row] = await db
      .update(lessons)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(lessons.id, id))
      .returning();
    return row ?? null;
  }

  async deleteLesson(id: string) {
    const rows = await db
      .delete(lessons)
      .where(eq(lessons.id, id))
      .returning({ id: lessons.id });
    return rows.length > 0;
  }

  async getAttachment(id: string) {
    return await db
      .select()
      .from(lessonAttachments)
      .where(eq(lessonAttachments.id, id))
      .then((r) => r[0] ?? null);
  }

  async createAttachment(input: CreateAttachmentBody) {
    const [row] = await db
      .insert(lessonAttachments)
      .values({
        lessonId: input.lessonId,
        name: input.name,
        fileKey: input.fileKey,
        fileSize: input.fileSize == null ? null : BigInt(input.fileSize),
        mimeType: input.mimeType ?? null,
      })
      .returning();
    return toAttachment(row!);
  }

  async deleteAttachment(id: string) {
    await db.delete(lessonAttachments).where(eq(lessonAttachments.id, id));
  }

  async listAttachments(lessonId: string) {
    const rows = await db
      .select()
      .from(lessonAttachments)
      .where(eq(lessonAttachments.lessonId, lessonId))
      .orderBy(asc(lessonAttachments.createdAt));
    return rows.map(toAttachment);
  }
}

export const courseContentService = new CourseContentService();
