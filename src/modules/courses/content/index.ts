import { Elysia, status, t } from "elysia";

import { ProblemDetailsSchema } from "@/lib/api/models";
import { dataOf, HttpProblem, ok } from "@/lib/response";
import { authMacro } from "@/modules/auth";

import { requireOwnedCourse } from "../authz";
import {
  AttachmentSchema,
  ChapterSchema,
  CreateAttachmentBodySchema,
  CreateChapterBodySchema,
  CreateLessonBodySchema,
  LessonSchema,
  UpdateChapterBodySchema,
  UpdateLessonBodySchema,
} from "./model";
import { courseContentService } from "./service";

const idParam = t.Object({ id: t.String({ minLength: 1 }) });
const deletedResponse = dataOf(
  t.Object({ id: t.String(), deleted: t.Boolean() }),
);
const ownerSecurity = [{ sessionCookie: [], csrfHeader: [] }];
const errs = { 403: ProblemDetailsSchema, 404: ProblemDetailsSchema };

export const courseContentModule = new Elysia({ name: "course-content" })
  .use(authMacro)
  .post(
    "/chapters",
    async ({ body, ability }) => {
      await requireOwnedCourse(body.courseId, ability);
      const chapter = await courseContentService.createChapter(
        body.courseId,
        body,
      );
      return status(201, { data: chapter });
    },
    {
      auth: { can: ["update", "Course"] },
      body: CreateChapterBodySchema,
      response: { 201: dataOf(ChapterSchema), ...errs },
      detail: {
        summary: "Add a chapter to a course",
        tags: ["Chapters"],
        security: ownerSecurity,
      },
    },
  )
  .patch(
    "/chapters/:id",
    async ({ params, body, ability }) => {
      const chapter = await courseContentService.getChapter(params.id);
      if (!chapter)
        throw new HttpProblem(404, "NOT_FOUND", "Chapter not found.");
      await requireOwnedCourse(chapter.courseId, ability);
      const updated = await courseContentService.updateChapter(params.id, body);
      return ok(updated!);
    },
    {
      auth: { can: ["update", "Course"] },
      params: idParam,
      body: UpdateChapterBodySchema,
      response: { 200: dataOf(ChapterSchema), ...errs },
      detail: {
        summary: "Update a chapter",
        tags: ["Chapters"],
        security: ownerSecurity,
      },
    },
  )
  .delete(
    "/chapters/:id",
    async ({ params, ability }) => {
      const chapter = await courseContentService.getChapter(params.id);
      if (!chapter)
        throw new HttpProblem(404, "NOT_FOUND", "Chapter not found.");
      await requireOwnedCourse(chapter.courseId, ability);
      await courseContentService.deleteChapter(params.id);
      return ok({ id: params.id, deleted: true });
    },
    {
      auth: { can: ["update", "Course"] },
      params: idParam,
      response: { 200: deletedResponse, ...errs },
      detail: {
        summary: "Delete a chapter",
        tags: ["Chapters"],
        security: ownerSecurity,
      },
    },
  )
  .post(
    "/lessons",
    async ({ body, ability }) => {
      const chapter = await courseContentService.getChapter(body.chapterId);
      if (!chapter)
        throw new HttpProblem(404, "NOT_FOUND", "Chapter not found.");
      await requireOwnedCourse(chapter.courseId, ability);
      const lesson = await courseContentService.createLesson(
        chapter.id,
        chapter.courseId,
        body,
      );
      return status(201, { data: lesson });
    },
    {
      auth: { can: ["update", "Course"] },
      body: CreateLessonBodySchema,
      response: { 201: dataOf(LessonSchema), ...errs },
      detail: {
        summary: "Add a lesson to a chapter",
        tags: ["Lessons"],
        security: ownerSecurity,
      },
    },
  )
  .patch(
    "/lessons/:id",
    async ({ params, body, ability }) => {
      const lesson = await courseContentService.getLesson(params.id);
      if (!lesson) throw new HttpProblem(404, "NOT_FOUND", "Lesson not found.");
      await requireOwnedCourse(lesson.courseId, ability);
      const updated = await courseContentService.updateLesson(params.id, body);
      return ok(updated!);
    },
    {
      auth: { can: ["update", "Course"] },
      params: idParam,
      body: UpdateLessonBodySchema,
      response: { 200: dataOf(LessonSchema), ...errs },
      detail: {
        summary: "Update a lesson",
        tags: ["Lessons"],
        security: ownerSecurity,
      },
    },
  )
  .delete(
    "/lessons/:id",
    async ({ params, ability }) => {
      const lesson = await courseContentService.getLesson(params.id);
      if (!lesson) throw new HttpProblem(404, "NOT_FOUND", "Lesson not found.");
      await requireOwnedCourse(lesson.courseId, ability);
      await courseContentService.deleteLesson(params.id);
      return ok({ id: params.id, deleted: true });
    },
    {
      auth: { can: ["update", "Course"] },
      params: idParam,
      response: { 200: deletedResponse, ...errs },
      detail: {
        summary: "Delete a lesson",
        tags: ["Lessons"],
        security: ownerSecurity,
      },
    },
  )
  .post(
    "/attachments",
    async ({ body, ability }) => {
      const lesson = await courseContentService.getLesson(body.lessonId);
      if (!lesson) throw new HttpProblem(404, "NOT_FOUND", "Lesson not found.");
      await requireOwnedCourse(lesson.courseId, ability);
      const attachment = await courseContentService.createAttachment(body);
      return status(201, { data: attachment });
    },
    {
      auth: { can: ["update", "Course"] },
      body: CreateAttachmentBodySchema,
      response: { 201: dataOf(AttachmentSchema), ...errs },
      detail: {
        summary: "Attach a file to a lesson",
        tags: ["Lessons"],
        security: ownerSecurity,
      },
    },
  )
  .get(
    "/attachments/lesson/:lessonId",
    async ({ params, ability }) => {
      const lesson = await courseContentService.getLesson(params.lessonId);
      if (!lesson) throw new HttpProblem(404, "NOT_FOUND", "Lesson not found.");
      await requireOwnedCourse(lesson.courseId, ability);
      return ok(await courseContentService.listAttachments(params.lessonId));
    },
    {
      auth: { can: ["update", "Course"] },
      params: t.Object({ lessonId: t.String({ minLength: 1 }) }),
      response: { 200: dataOf(t.Array(AttachmentSchema)), ...errs },
      detail: {
        summary: "List a lesson's attachments",
        tags: ["Lessons"],
        security: ownerSecurity,
      },
    },
  )
  .delete(
    "/attachments/:id",
    async ({ params, ability }) => {
      const attachment = await courseContentService.getAttachment(params.id);
      if (!attachment) {
        throw new HttpProblem(404, "NOT_FOUND", "Attachment not found.");
      }
      const lesson = await courseContentService.getLesson(attachment.lessonId);
      if (!lesson) throw new HttpProblem(404, "NOT_FOUND", "Lesson not found.");
      await requireOwnedCourse(lesson.courseId, ability);
      await courseContentService.deleteAttachment(params.id);
      return ok({ id: params.id, deleted: true });
    },
    {
      auth: { can: ["update", "Course"] },
      params: idParam,
      response: { 200: deletedResponse, ...errs },
      detail: {
        summary: "Delete an attachment",
        tags: ["Lessons"],
        security: ownerSecurity,
      },
    },
  );
