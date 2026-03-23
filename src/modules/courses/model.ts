import { t } from "elysia";

export const CourseQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 50 })),
  category: t.Optional(t.String({ description: "Category slug" })),
  level: t.Optional(
    t.Union([
      t.Literal("beginner"),
      t.Literal("intermediate"),
      t.Literal("advanced"),
    ]),
  ),
  q: t.Optional(t.String({ description: "Full-text search query" })),
});

export const CourseCategorySchema = t.Object({
  id: t.String(),
  name: t.String(),
  slug: t.String(),
});

export const CourseCardSchema = t.Object({
  id: t.String(),
  title: t.String(),
  slug: t.String(),
  description: t.Union([t.String(), t.Null()]),
  level: t.Union([
    t.Literal("beginner"),
    t.Literal("intermediate"),
    t.Literal("advanced"),
  ]),
  price: t.String(),
  enrolledCount: t.Integer(),
  reviewCount: t.Integer(),
  averageRating: t.Union([t.String(), t.Null()]),
  category: t.Union([CourseCategorySchema, t.Null()]),
});

export const LessonSummarySchema = t.Object({
  id: t.String(),
  title: t.String(),
  type: t.Union([
    t.Literal("video"),
    t.Literal("text"),
    t.Literal("quiz"),
    t.Literal("assignment"),
  ]),
  position: t.Integer(),
  isPreview: t.Boolean(),
  durationSeconds: t.Union([t.Integer(), t.Null()]),
});

export const ChapterWithLessonsSchema = t.Object({
  id: t.String(),
  title: t.String(),
  position: t.Integer(),
  lessons: t.Array(LessonSummarySchema),
});

export const CourseEducatorSchema = t.Object({
  name: t.String(),
  headline: t.Union([t.String(), t.Null()]),
  bio: t.Union([t.String(), t.Null()]),
});

export const CourseDetailSchema = t.Object({
  id: t.String(),
  title: t.String(),
  slug: t.String(),
  description: t.Union([t.String(), t.Null()]),
  level: t.Union([
    t.Literal("beginner"),
    t.Literal("intermediate"),
    t.Literal("advanced"),
  ]),
  price: t.String(),
  enrolledCount: t.Integer(),
  reviewCount: t.Integer(),
  averageRating: t.Union([t.String(), t.Null()]),
  category: t.Union([CourseCategorySchema, t.Null()]),
  educator: t.Union([CourseEducatorSchema, t.Null()]),
  chapters: t.Array(ChapterWithLessonsSchema),
  tags: t.Array(
    t.Object({ id: t.String(), name: t.String(), slug: t.String() }),
  ),
});
