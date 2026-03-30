import { Elysia, t } from "elysia";

import { ProblemDetailsSchema } from "@/lib/api/models";
import { dataOf, HttpProblem, ok } from "@/lib/response";
import { authMacro } from "@/modules/auth";

import {
  CourseProgressItemSchema,
  RecordProgressBodySchema,
  RecordProgressResponseSchema,
} from "./model";
import { progressService } from "./service";

export const progressModule = new Elysia({
  name: "progress",
  prefix: "/progress",
})
  .use(authMacro)
  .put(
    "/",
    async ({ body, user }) => {
      const result = await progressService.record(user.id, body);
      switch (result.kind) {
        case "not-found":
          throw new HttpProblem(404, "NOT_FOUND", "Lesson not found.");
        case "not-enrolled":
          throw new HttpProblem(
            403,
            "NOT_ENROLLED",
            "You must be enrolled in the course to track progress.",
          );
        case "ok":
          return ok({
            progress: result.progress,
            courseCompleted: result.courseCompleted,
          });
      }
    },
    {
      auth: { can: ["create", "Progress"] },
      body: RecordProgressBodySchema,
      response: {
        200: dataOf(RecordProgressResponseSchema),
        403: ProblemDetailsSchema,
        404: ProblemDetailsSchema,
      },
      detail: {
        summary: "Record lesson progress",
        description:
          "Upserts watch progress / completion for one lesson. PUT-replace semantics.",
        tags: ["Progress"],
        security: [{ sessionCookie: [], csrfHeader: [] }],
      },
    },
  )
  .get(
    "/course/:courseId",
    async ({ params, user }) =>
      ok(await progressService.listForCourse(user.id, params.courseId)),
    {
      auth: { can: ["read", "Progress"] },
      params: t.Object({ courseId: t.String({ minLength: 1 }) }),
      response: { 200: dataOf(t.Array(CourseProgressItemSchema)) },
      detail: {
        summary: "My progress in a course",
        tags: ["Progress"],
        security: [{ sessionCookie: [] }],
      },
    },
  );
