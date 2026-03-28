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

const CourseLevelSchema = t.Union([
  t.Literal("beginner"),
  t.Literal("intermediate"),
  t.Literal("advanced"),
]);

const CourseStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("published"),
  t.Literal("archived"),
]);

const PriceSchema = t.String({ pattern: "^\\d+(\\.\\d{1,2})?$" });

export const CreateCourseBodySchema = t.Object({
  title: t.String({ minLength: 1, maxLength: 200 }),
  description: t.Optional(t.String({ maxLength: 5000 })),
  categoryId: t.Optional(t.String({ minLength: 1 })),
  level: t.Optional(CourseLevelSchema),
  language: t.Optional(t.String({ minLength: 2, maxLength: 10 })),
  price: t.Optional(PriceSchema),
});

export const UpdateCourseBodySchema = t.Partial(
  t.Object({
    title: t.String({ minLength: 1, maxLength: 200 }),
    description: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
    categoryId: t.Union([t.String({ minLength: 1 }), t.Null()]),
    level: CourseLevelSchema,
    status: CourseStatusSchema,
    language: t.String({ minLength: 2, maxLength: 10 }),
    price: PriceSchema,
    thumbnailKey: t.Union([t.String(), t.Null()]),
    previewVideoKey: t.Union([t.String(), t.Null()]),
  }),
);

export const ManagedCourseSchema = t.Object({
  id: t.String(),
  educatorId: t.String(),
  title: t.String(),
  slug: t.String(),
  description: t.Union([t.String(), t.Null()]),
  categoryId: t.Union([t.String(), t.Null()]),
  level: CourseLevelSchema,
  status: CourseStatusSchema,
  language: t.String(),
  price: t.String(),
  thumbnailKey: t.Union([t.String(), t.Null()]),
  previewVideoKey: t.Union([t.String(), t.Null()]),
  publishedAt: t.Union([t.Date(), t.Null()]),
  createdAt: t.Date(),
  updatedAt: t.Date(),
});

export type CreateCourseBody = typeof CreateCourseBodySchema.static;
export type UpdateCourseBody = typeof UpdateCourseBodySchema.static;

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
