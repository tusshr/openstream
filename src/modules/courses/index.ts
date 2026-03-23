import { Elysia, status, t } from "elysia";

import { collectionOf, dataOf, ok, okWithMeta } from "@/lib/response";

import {
  CourseCardSchema,
  CourseDetailSchema,
  CourseQuerySchema,
} from "./model";
import { courseService } from "./service";

export const coursesModule = new Elysia({ name: "courses", prefix: "/courses" })
  .model({
    "courses.list": collectionOf(CourseCardSchema),
    "courses.detail": dataOf(CourseDetailSchema),
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
    "/:slug",
    async ({ params }) => {
      const course = await courseService.getBySlug(params.slug);
      if (!course)
        return status(404, {
          error: { code: "NOT_FOUND", message: "Course not found." },
        });
      return ok(course);
    },
    {
      params: t.Object({ slug: t.String() }),
      response: {
        200: "courses.detail",
        404: t.Object({
          error: t.Object({ code: t.String(), message: t.String() }),
        }),
      },
      detail: {
        summary: "Get course",
        description:
          "Returns full course detail including chapters, lessons, tags, and educator.",
        tags: ["Courses"],
      },
    },
  );
