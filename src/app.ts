import { Elysia, t } from "elysia";

import { HttpProblem, problem } from "@/lib/response";
import { buildValidationResponse } from "@/lib/validation";
import { authMacro, authRoutes } from "@/modules/auth";
import { AuthError } from "@/modules/auth/service";
import { coursesModule } from "@/modules/courses";
import { categoriesModule } from "@/modules/courses/categories";
import { courseContentModule } from "@/modules/courses/content";
import { enrollmentsModule } from "@/modules/enrollments";
import { health } from "@/modules/health";
import { progressModule } from "@/modules/progress";
import { reviewsModule } from "@/modules/reviews";
import { storage } from "@/modules/storage";
import { users } from "@/modules/users";
import { cors } from "@/plugins/cors";
import { csrf } from "@/plugins/csrf";
import { requestLogger } from "@/plugins/logger";
import { openapi } from "@/plugins/openapi";
import { securityHeaders } from "@/plugins/security-headers";

const AUTH_ERROR_STATUS: Record<string, number> = {
  EMAIL_TAKEN: 409,
  INVALID_CREDENTIALS: 401,
  EMAIL_NOT_VERIFIED: 403,
  INVALID_TOKEN: 400,
  TOTP_INVALID: 400,
  TOTP_SETUP_EXPIRED: 400,
  TOO_MANY_ATTEMPTS: 429,
  NOT_FOUND: 404,
};

export const app = new Elysia({
  serve: { maxRequestBodySize: 1 * 1024 * 1024 },
})
  .use(requestLogger)
  .onError(({ code, error, request }) => {
    const instance = new URL(request.url).pathname;

    if (error instanceof AuthError) {
      return problem({
        status: AUTH_ERROR_STATUS[error.code] ?? 400,
        code: error.code,
        detail: error.message,
        instance,
      });
    }

    if (error instanceof HttpProblem) {
      return problem({
        status: error.status,
        code: error.code,
        detail: error.detail,
        instance,
        ...(error.errors ? { errors: error.errors } : {}),
        ...(error.extensions ? { extensions: error.extensions } : {}),
        ...(error.headers ? { headers: error.headers } : {}),
      });
    }

    switch (code) {
      case "NOT_FOUND":
        return problem({
          status: 404,
          code: "NOT_FOUND",
          detail: "Not found",
          instance,
        });
      case "VALIDATION":
        return buildValidationResponse(error, instance);
      case "PARSE":
        return problem({
          status: 400,
          code: "PARSE_ERROR",
          detail: "Invalid request body",
          instance,
        });
    }

    return problem({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      detail: "Internal server error",
      instance,
    });
  })
  .use(securityHeaders)
  .use(cors)
  .use(csrf)
  .use(openapi)
  .use(health)
  .get("/", () => "OpenStream", {
    response: {
      200: t.String({ description: "OpenStream service identifier" }),
    },
    detail: { summary: "Service name", tags: ["System"] },
  })
  .use(authRoutes)
  .use(authMacro)
  .group("/api", (app) =>
    app
      .use(storage)
      .use(users)
      .use(coursesModule)
      .use(courseContentModule)
      .use(enrollmentsModule)
      .use(reviewsModule)
      .use(progressModule)
      .use(categoriesModule),
  );

export type App = typeof app;
