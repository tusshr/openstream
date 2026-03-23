import { Elysia, t } from "elysia";

import { buildValidationResponse } from "@/lib/validation";
import { authMacro, authRoutes } from "@/modules/auth";
import { categoriesModule } from "@/modules/categories";
import { coursesModule } from "@/modules/courses";
import { health } from "@/modules/health";
import { storage } from "@/modules/storage";
import { users } from "@/modules/users";
import { cors } from "@/plugins/cors";
import { csrf } from "@/plugins/csrf";
import { requestLogger } from "@/plugins/logger";
import { openapi } from "@/plugins/openapi";
import { securityHeaders } from "@/plugins/security-headers";

export const app = new Elysia({
  serve: { maxRequestBodySize: 1 * 1024 * 1024 },
})
  .use(requestLogger)
  .onError(({ code, error }) => {
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
