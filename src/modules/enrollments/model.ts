import { t } from "elysia";

const EnrollmentStatusSchema = t.Union([
  t.Literal("active"),
  t.Literal("completed"),
  t.Literal("refunded"),
  t.Literal("suspended"),
  t.Literal("dropped"),
]);

export const EnrollBodySchema = t.Object({
  courseId: t.String({ minLength: 1 }),
});

// Raw enrollment row (POST response).
export const EnrollmentSchema = t.Object({
  id: t.String(),
  userId: t.String(),
  courseId: t.String(),
  status: EnrollmentStatusSchema,
  enrolledAt: t.Date(),
  completedAt: t.Union([t.Date(), t.Null()]),
});

// A student's own enrollment, with the course it points at (GET /enrollments).
export const MyEnrollmentSchema = t.Object({
  id: t.String(),
  courseId: t.String(),
  courseTitle: t.String(),
  courseSlug: t.String(),
  status: EnrollmentStatusSchema,
  enrolledAt: t.Date(),
  completedAt: t.Union([t.Date(), t.Null()]),
});

// One row of a course's roster, for the owning educator/admin.
export const CourseEnrollmentSchema = t.Object({
  id: t.String(),
  userId: t.String(),
  studentName: t.String(),
  status: EnrollmentStatusSchema,
  enrolledAt: t.Date(),
  completedAt: t.Union([t.Date(), t.Null()]),
});

export type EnrollBody = typeof EnrollBodySchema.static;
