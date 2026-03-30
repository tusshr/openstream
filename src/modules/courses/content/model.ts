import { t } from "elysia";

const LessonTypeSchema = t.Union([
  t.Literal("video"),
  t.Literal("text"),
  t.Literal("quiz"),
  t.Literal("assignment"),
]);

export const CreateChapterBodySchema = t.Object({
  courseId: t.String({ minLength: 1 }),
  title: t.String({ minLength: 1, maxLength: 200 }),
  position: t.Optional(t.Integer({ minimum: 0 })),
});

export const UpdateChapterBodySchema = t.Partial(
  t.Object({
    title: t.String({ minLength: 1, maxLength: 200 }),
    position: t.Integer({ minimum: 0 }),
  }),
);

export const ChapterSchema = t.Object({
  id: t.String(),
  courseId: t.String(),
  title: t.String(),
  position: t.Integer(),
  createdAt: t.Date(),
  updatedAt: t.Date(),
});

export const CreateLessonBodySchema = t.Object({
  chapterId: t.String({ minLength: 1 }),
  title: t.String({ minLength: 1, maxLength: 200 }),
  type: t.Optional(LessonTypeSchema),
  position: t.Optional(t.Integer({ minimum: 0 })),
  isPreview: t.Optional(t.Boolean()),
  videoKey: t.Optional(t.Union([t.String(), t.Null()])),
  durationSeconds: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])),
  content: t.Optional(t.Union([t.String(), t.Null()])),
});

export const UpdateLessonBodySchema = t.Partial(
  t.Object({
    title: t.String({ minLength: 1, maxLength: 200 }),
    type: LessonTypeSchema,
    position: t.Integer({ minimum: 0 }),
    isPreview: t.Boolean(),
    videoKey: t.Union([t.String(), t.Null()]),
    durationSeconds: t.Union([t.Integer({ minimum: 0 }), t.Null()]),
    content: t.Union([t.String(), t.Null()]),
  }),
);

export const LessonSchema = t.Object({
  id: t.String(),
  chapterId: t.String(),
  courseId: t.String(),
  title: t.String(),
  type: LessonTypeSchema,
  position: t.Integer(),
  isPreview: t.Boolean(),
  videoKey: t.Union([t.String(), t.Null()]),
  durationSeconds: t.Union([t.Integer(), t.Null()]),
  content: t.Union([t.String(), t.Null()]),
  createdAt: t.Date(),
  updatedAt: t.Date(),
});

export const CreateAttachmentBodySchema = t.Object({
  lessonId: t.String({ minLength: 1 }),
  name: t.String({ minLength: 1, maxLength: 255 }),
  fileKey: t.String({ minLength: 1 }),
  fileSize: t.Optional(t.Integer({ minimum: 0 })),
  mimeType: t.Optional(t.String({ maxLength: 255 })),
});

export const AttachmentSchema = t.Object({
  id: t.String(),
  lessonId: t.String(),
  name: t.String(),
  fileKey: t.String(),
  fileSize: t.Union([t.Integer(), t.Null()]),
  mimeType: t.Union([t.String(), t.Null()]),
  createdAt: t.Date(),
});

export type CreateChapterBody = typeof CreateChapterBodySchema.static;
export type UpdateChapterBody = typeof UpdateChapterBodySchema.static;
export type CreateLessonBody = typeof CreateLessonBodySchema.static;
export type UpdateLessonBody = typeof UpdateLessonBodySchema.static;
export type CreateAttachmentBody = typeof CreateAttachmentBodySchema.static;
