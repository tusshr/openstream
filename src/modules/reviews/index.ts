import { subject } from "@casl/ability";
import { Elysia, status, t } from "elysia";

import { ProblemDetailsSchema } from "@/lib/api/models";
import { dataOf, HttpProblem, ok } from "@/lib/response";
import { authMacro } from "@/modules/auth";

import {
  CreateReviewBodySchema,
  PublicReviewSchema,
  ReviewSchema,
  UpdateReviewBodySchema,
} from "./model";
import { reviewService } from "./service";

const idParam = t.Object({ id: t.String({ minLength: 1 }) });
const mutateSecurity = [{ sessionCookie: [], csrfHeader: [] }];

export const reviewsModule = new Elysia({
  name: "reviews",
  prefix: "/reviews",
})
  .use(authMacro)
  // Public: a course's reviews.
  .get(
    "/course/:courseId",
    async ({ params }) =>
      ok(await reviewService.listForCourse(params.courseId)),
    {
      params: t.Object({ courseId: t.String({ minLength: 1 }) }),
      response: { 200: dataOf(t.Array(PublicReviewSchema)) },
      detail: { summary: "List a course's reviews", tags: ["Reviews"] },
    },
  )
  // Student: review a course they're enrolled in (one per course).
  .post(
    "/",
    async ({ body, user }) => {
      const result = await reviewService.create(user.id, body.courseId, body);
      switch (result.kind) {
        case "not-found":
          throw new HttpProblem(
            404,
            "NOT_FOUND",
            "Course not found or not published.",
          );
        case "not-enrolled":
          throw new HttpProblem(
            403,
            "NOT_ENROLLED",
            "You must be enrolled to review this course.",
          );
        case "already-reviewed":
          throw new HttpProblem(
            409,
            "ALREADY_REVIEWED",
            "You have already reviewed this course; edit your existing review.",
          );
        case "ok":
          return status(201, { data: result.review });
      }
    },
    {
      auth: { can: ["create", "Review"] },
      body: CreateReviewBodySchema,
      response: {
        201: dataOf(ReviewSchema),
        403: ProblemDetailsSchema,
        404: ProblemDetailsSchema,
        409: ProblemDetailsSchema,
      },
      detail: {
        summary: "Write a review",
        tags: ["Reviews"],
        security: mutateSecurity,
      },
    },
  )
  // Author (or admin): edit a review.
  .patch(
    "/:id",
    async ({ params, body, ability }) => {
      const review = await reviewService.getById(params.id);
      if (!review) throw new HttpProblem(404, "NOT_FOUND", "Review not found.");
      if (ability.cannot("update", subject("Review", review))) {
        throw new HttpProblem(403, "FORBIDDEN", "That's not your review.");
      }
      const updated = await reviewService.update(params.id, body);
      return ok(updated!);
    },
    {
      auth: { can: ["update", "Review"] },
      params: idParam,
      body: UpdateReviewBodySchema,
      response: {
        200: dataOf(ReviewSchema),
        403: ProblemDetailsSchema,
        404: ProblemDetailsSchema,
      },
      detail: {
        summary: "Update a review",
        tags: ["Reviews"],
        security: mutateSecurity,
      },
    },
  )
  // Author (own) or admin (moderation): delete a review.
  .delete(
    "/:id",
    async ({ params, ability }) => {
      const review = await reviewService.getById(params.id);
      if (!review) throw new HttpProblem(404, "NOT_FOUND", "Review not found.");
      if (ability.cannot("delete", subject("Review", review))) {
        throw new HttpProblem(403, "FORBIDDEN", "That's not your review.");
      }
      await reviewService.remove(params.id, review.courseId);
      return ok({ id: params.id, deleted: true });
    },
    {
      auth: { can: ["delete", "Review"] },
      params: idParam,
      response: {
        200: dataOf(t.Object({ id: t.String(), deleted: t.Boolean() })),
        403: ProblemDetailsSchema,
        404: ProblemDetailsSchema,
      },
      detail: {
        summary: "Delete a review",
        tags: ["Reviews"],
        security: mutateSecurity,
      },
    },
  );
