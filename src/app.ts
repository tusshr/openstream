import { Elysia, t } from "elysia";

import { buildValidationResponse } from "@/lib/validation";
import { authMacro, authRoutes } from "@/modules/auth";
import { AuthError } from "@/modules/auth/service";
import { coursesModule } from "@/modules/courses";
import { categoriesModule } from "@/modules/courses/categories";
import { health } from "@/modules/health";
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
  .onError(({ code, error }) => {
    if (error instanceof AuthError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: AUTH_ERROR_STATUS[error.code] ?? 400 },
      );
    }

    switch (code) {
      case "NOT_FOUND":
        return Response.json(
          { error: { code: "NOT_FOUND", message: "Not found" } },
          { status: 404 },
        );
      case "VALIDATION":
        return buildValidationResponse(error);
      case "PARSE":
        return Response.json(
          { error: { code: "PARSE_ERROR", message: "Invalid request body" } },
          { status: 400 },
        );
    }

    return Response.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
        },
      },
      { status: 500 },
    );
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
    app.use(storage).use(users).use(coursesModule).use(categoriesModule),
  );

export type App = typeof app;
