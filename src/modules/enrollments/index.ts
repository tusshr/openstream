import { Elysia, status, t } from "elysia";

import { errorModels } from "@/lib/api/error-models";
import { dataOf, HttpProblem, ok } from "@/lib/response";
import { authMacro } from "@/modules/auth";
import { requireOwnedCourse } from "@/modules/courses/authz";

import {
  CourseEnrollmentSchema,
  EnrollBodySchema,
  EnrollmentSchema,
  MyEnrollmentSchema,
} from "./model";
import { enrollmentService } from "./service";

export const enrollmentsModule = new Elysia({
  name: "enrollments",
  prefix: "/enrollments",
})
  .use(authMacro)
  .use(errorModels)
  // Student: enroll in a (free, published) course.
  .post(
    "/",
    async ({ body, user }) => {
      const result = await enrollmentService.enroll(user.id, body.courseId);
      switch (result.kind) {
        case "not-found":
          throw new HttpProblem(
            404,
            "NOT_FOUND",
            "Course not found or not published.",
          );
        case "payment-required":
          throw new HttpProblem(
            402,
            "PAYMENT_REQUIRED",
            `This course costs ${result.price}; checkout is required to enroll.`,
          );
        case "already-enrolled":
          throw new HttpProblem(
            409,
            "ALREADY_ENROLLED",
            "You are already enrolled in this course.",
          );
        case "ok":
          return status(201, { data: result.enrollment });
      }
    },
    {
      auth: { can: ["create", "Enrollment"] },
      body: EnrollBodySchema,
      response: {
        401: "ProblemDetails",
        422: "ProblemDetails",
        201: dataOf(EnrollmentSchema),
        402: "ProblemDetails",
        404: "ProblemDetails",
        409: "ProblemDetails",
      },
      detail: {
        summary: "Enroll in a course",
        description:
          "Enrolls the caller in a free, published course. Paid courses return 402 until checkout exists.",
        tags: ["Enrollments"],
        security: [{ sessionCookie: [], csrfHeader: [] }],
      },
    },
  )
  // Student: list own enrollments.
  .get(
    "/",
    async ({ user }) => ok(await enrollmentService.listForUser(user.id)),
    {
      auth: { can: ["read", "Enrollment"] },
      response: {
        401: "ProblemDetails",
        200: dataOf(t.Array(MyEnrollmentSchema)),
      },
      detail: {
        summary: "List my enrollments",
        tags: ["Enrollments"],
        security: [{ sessionCookie: [] }],
      },
    },
  )
  // Educator/admin: a course's roster. Compose-from-parent read — authorized by
  // Course ownership, not an Enrollment permission (educators have none).
  .get(
    "/course/:courseId",
    async ({ params, ability }) => {
      await requireOwnedCourse(params.courseId, ability);
      return ok(await enrollmentService.listForCourse(params.courseId));
    },
    {
      auth: true,
      params: t.Object({ courseId: t.String({ minLength: 1 }) }),
      response: {
        401: "ProblemDetails",
        200: dataOf(t.Array(CourseEnrollmentSchema)),
        403: "ProblemDetails",
        404: "ProblemDetails",
      },
      detail: {
        summary: "List a course's enrollments",
        description: "Owning educator (or admin) only.",
        tags: ["Enrollments"],
        security: [{ sessionCookie: [] }],
      },
    },
  )
  // Student: unenroll from one of their own enrollments.
  .delete(
    "/:id",
    async ({ params, user }) => {
      const ok_ = await enrollmentService.unenroll(params.id, user.id);
      if (!ok_) {
        throw new HttpProblem(404, "NOT_FOUND", "Enrollment not found.");
      }
      return ok({ id: params.id, deleted: true });
    },
    {
      auth: { can: ["delete", "Enrollment"] },
      params: t.Object({ id: t.String({ minLength: 1 }) }),
      response: {
        401: "ProblemDetails",
        200: dataOf(t.Object({ id: t.String(), deleted: t.Boolean() })),
        404: "ProblemDetails",
      },
      detail: {
        summary: "Unenroll from a course",
        tags: ["Enrollments"],
        security: [{ sessionCookie: [], csrfHeader: [] }],
      },
    },
  );
