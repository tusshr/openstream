import { subject } from "@casl/ability";
import { Elysia, status, t } from "elysia";

import { ProblemDetailsSchema } from "@/lib/api/models";
import {
  collectionOf,
  dataOf,
  HttpProblem,
  ok,
  okWithMeta,
} from "@/lib/response";
import { authMacro } from "@/modules/auth";

import { requireOwnedCourse } from "./authz";
import {
  CourseCardSchema,
  CourseDetailSchema,
  CourseQuerySchema,
  CreateCourseBodySchema,
  ManagedCourseSchema,
  UpdateCourseBodySchema,
} from "./model";
import { courseService } from "./service";

const idParam = t.Object({ id: t.String({ minLength: 1 }) });

export const coursesModule = new Elysia({ name: "courses", prefix: "/courses" })
  .use(authMacro)
  .model({
    "courses.list": collectionOf(CourseCardSchema),
    "courses.detail": dataOf(CourseDetailSchema),
    "courses.managed": dataOf(ManagedCourseSchema),
    "courses.create.body": CreateCourseBodySchema,
    "courses.update.body": UpdateCourseBodySchema,
  })
  .get(
    "/",
    async ({ query }) => {
      const result = await courseService.list(query);
      return okWithMeta(result.rows, {
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
        previousCursor: null,
        limit: result.limit,
      });
    },
    {
      query: CourseQuerySchema,
      response: { 200: "courses.list" },
      detail: {
        summary: "List courses",
        description:
          "Paginated course catalog with optional category/level filters and full-text search.",
        tags: ["Courses"],
      },
    },
  )
  .get(
    "/mine",
    async ({ user }) => ok(await courseService.listByEducator(user.id)),
    {
      auth: { can: ["create", "Course"] },
      response: { 200: dataOf(t.Array(ManagedCourseSchema)) },
      detail: {
        summary: "List my courses",
        description:
          "Educator dashboard — own courses in any status (incl. drafts).",
        tags: ["Courses"],
        security: [{ sessionCookie: [] }],
      },
    },
  )
  .get(
    "/mine/:id",
    async ({ params, ability }) => {
      await requireOwnedCourse(params.id, ability);
      const course = await courseService.getOwnedDetail(params.id);
      if (!course) throw new HttpProblem(404, "NOT_FOUND", "Course not found.");
      return ok(course);
    },
    {
      auth: { can: ["create", "Course"] },
      params: idParam,
      response: {
        200: "courses.detail",
        403: ProblemDetailsSchema,
        404: ProblemDetailsSchema,
      },
      detail: {
        summary: "Get my course (any status, incl. draft)",
        description: "Owner/admin preview of a course before it's published.",
        tags: ["Courses"],
        security: [{ sessionCookie: [] }],
      },
    },
  )
  .get(
    "/:slug",
    async ({ params }) => {
      const course = await courseService.getBySlug(params.slug);
      if (!course) throw new HttpProblem(404, "NOT_FOUND", "Course not found.");
      return ok(course);
    },
    {
      params: t.Object({ slug: t.String() }),
      response: {
        200: "courses.detail",
        404: ProblemDetailsSchema,
      },
      detail: {
        summary: "Get course",
        description:
          "Returns full course detail including chapters, lessons, tags, and educator.",
        tags: ["Courses"],
      },
    },
  )
  .post(
    "/",
    async ({ body, user }) => {
      const course = await courseService.create(user.id, body);
      return status(201, { data: course });
    },
    {
      auth: { can: ["create", "Course"] },
      body: "courses.create.body",
      response: { 201: "courses.managed" },
      detail: {
        summary: "Create a course",
        description:
          "Educator-only. Creates a draft course owned by the caller. Requires create:Course.",
        tags: ["Courses"],
        security: [{ sessionCookie: [], csrfHeader: [] }],
      },
    },
  )
  .patch(
    "/:id",
    async ({ params, body, ability }) => {
      const course = await courseService.getById(params.id);
      if (!course) throw new HttpProblem(404, "NOT_FOUND", "Course not found.");
      if (ability.cannot("update", subject("Course", course))) {
        throw new HttpProblem(
          403,
          "FORBIDDEN",
          "You can only edit your own courses.",
        );
      }
      const updated = await courseService.update(params.id, body);
      if (!updated)
        throw new HttpProblem(404, "NOT_FOUND", "Course not found.");
      return ok(updated);
    },
    {
      auth: { can: ["update", "Course"] },
      params: idParam,
      body: "courses.update.body",
      response: {
        200: "courses.managed",
        403: ProblemDetailsSchema,
        404: ProblemDetailsSchema,
      },
      detail: {
        summary: "Update a course",
        description:
          "Educator-only, own courses. Setting status to 'published' stamps publishedAt. Requires update:Course.",
        tags: ["Courses"],
        security: [{ sessionCookie: [], csrfHeader: [] }],
      },
    },
  )
  .delete(
    "/:id",
    async ({ params, ability }) => {
      const course = await courseService.getById(params.id);
      if (!course) throw new HttpProblem(404, "NOT_FOUND", "Course not found.");
      if (ability.cannot("delete", subject("Course", course))) {
        throw new HttpProblem(
          403,
          "FORBIDDEN",
          "You can only delete your own courses.",
        );
      }
      await courseService.remove(params.id);
      return ok({ id: params.id, deleted: true });
    },
    {
      auth: { can: ["delete", "Course"] },
      params: idParam,
      response: {
        200: dataOf(t.Object({ id: t.String(), deleted: t.Boolean() })),
        403: ProblemDetailsSchema,
        404: ProblemDetailsSchema,
      },
      detail: {
        summary: "Delete a course",
        description: "Educator-only, own courses. Requires delete:Course.",
        tags: ["Courses"],
        security: [{ sessionCookie: [], csrfHeader: [] }],
      },
    },
  );
