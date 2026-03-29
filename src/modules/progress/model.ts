import { t } from "elysia";

export const RecordProgressBodySchema = t.Object({
  lessonId: t.String({ minLength: 1 }),
  watchedSeconds: t.Optional(t.Integer({ minimum: 0 })),
  completed: t.Optional(t.Boolean()),
});

export const ProgressSchema = t.Object({
  id: t.String(),
  userId: t.String(),
  lessonId: t.String(),
  courseId: t.String(),
  watchedSeconds: t.Integer(),
  completedAt: t.Union([t.Date(), t.Null()]),
  updatedAt: t.Date(),
});

export const CourseProgressItemSchema = t.Object({
  lessonId: t.String(),
  lessonTitle: t.String(),
  watchedSeconds: t.Integer(),
  completedAt: t.Union([t.Date(), t.Null()]),
  updatedAt: t.Date(),
});

export type RecordProgressBody = typeof RecordProgressBodySchema.static;
