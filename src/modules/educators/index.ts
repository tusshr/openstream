import { Elysia, t } from "elysia";

import { errorModels } from "@/lib/api/error-models";
import { dataOf, HttpProblem, ok } from "@/lib/response";
import { authMacro } from "@/modules/auth";

import {
  EducatorProfileSchema,
  UpsertEducatorProfileBodySchema,
} from "./model";
import { educatorProfileService } from "./service";

export const educatorsModule = new Elysia({
  name: "educators",
  prefix: "/educators",
})
  .use(authMacro)
  .use(errorModels)
  .put(
    "/me",
    async ({ body, user }) => {
      const profile = await educatorProfileService.upsert(user.id, body);
      return ok(profile!);
    },
    {
      auth: { can: ["create", "EducatorProfile"] },
      body: UpsertEducatorProfileBodySchema,
      response: {
        401: "ProblemDetails",
        422: "ProblemDetails",
        200: dataOf(EducatorProfileSchema),
      },
      detail: {
        summary: "Upsert my educator profile",
        tags: ["Educators"],
        security: [{ sessionCookie: [], csrfHeader: [] }],
      },
    },
  )
  .get(
    "/me",
    async ({ user }) => {
      const profile = await educatorProfileService.getByUserId(user.id);
      if (!profile) {
        throw new HttpProblem(
          404,
          "NOT_FOUND",
          "You haven't set up an educator profile yet.",
        );
      }
      return ok(profile);
    },
    {
      auth: { can: ["create", "EducatorProfile"] },
      response: {
        401: "ProblemDetails",
        200: dataOf(EducatorProfileSchema),
        404: "ProblemDetails",
      },
      detail: {
        summary: "Get my educator profile",
        tags: ["Educators"],
        security: [{ sessionCookie: [] }],
      },
    },
  )
  .get(
    "/:userId",
    async ({ params }) => {
      const profile = await educatorProfileService.getByUserId(params.userId);
      if (!profile)
        throw new HttpProblem(404, "NOT_FOUND", "Educator not found.");
      return ok(profile);
    },
    {
      params: t.Object({ userId: t.String({ minLength: 1 }) }),
      response: {
        200: dataOf(EducatorProfileSchema),
        404: "ProblemDetails",
      },
      detail: { summary: "Get an educator profile", tags: ["Educators"] },
    },
  );
