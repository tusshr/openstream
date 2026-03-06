import { Elysia, t } from "elysia";

import { dataOf, ok } from "@/lib/response";
import { authMacro, authRoutes } from "@/modules/auth";
import { health } from "@/modules/health";
import { storage } from "@/modules/storage";
import { cors } from "@/plugins/cors";
import { requestLogger } from "@/plugins/logger";
import { openapi } from "@/plugins/openapi";
import { securityHeaders } from "@/plugins/security-headers";

// Optional fields written as `?: T | undefined` (rather than `?: T`) so the
// spread + ?? fallbacks below can set them to `undefined` explicitly without
// violating `exactOptionalPropertyTypes`.
type ValidationIssue = {
  path?: string | undefined;
  message?: string | undefined;
  summary?: string | undefined;
};

type ValidationErrorShape = {
  message?: string | undefined;
  on?: string | undefined;
  property?: string | undefined;
  summary?: string | undefined;
  errors?: ValidationIssue[] | undefined;
};

// Elysia surfaces validation errors with a JSON-encoded message string. We
// unwrap it so the client receives structured fields instead of a stringified
// blob. If the surface changes upstream, the heuristic falls back gracefully
// to passing the original error through.
function normalizeValidationError(
  validationError: ValidationErrorShape,
): ValidationErrorShape {
  const rawMessage = validationError.message;
  if (typeof rawMessage !== "string") return validationError;

  const trimmed = rawMessage.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return validationError;
  }

  try {
    const parsed = JSON.parse(trimmed) as ValidationErrorShape;
    return {
      ...validationError,
      message: parsed.message ?? validationError.message,
      on: validationError.on ?? parsed.on,
      property: validationError.property ?? parsed.property,
      summary: validationError.summary ?? parsed.summary,
      errors: validationError.errors ?? parsed.errors,
    };
  } catch {
    return validationError;
  }
}

function buildValidationResponse(error: ValidationErrorShape): Response {
  const normalized = normalizeValidationError(error);
  return Response.json(
    {
      error: "Validation failed",
      message:
        normalized.message ??
        "Request validation failed. Please check your input.",
      ...(normalized.on ? { on: normalized.on } : {}),
      ...(normalized.property ? { property: normalized.property } : {}),
      ...(normalized.summary ? { summary: normalized.summary } : {}),
      ...(Array.isArray(normalized.errors)
        ? {
            issues: normalized.errors.map((issue) => ({
              ...(issue.path ? { path: issue.path } : {}),
              ...(issue.message ? { message: issue.message } : {}),
              ...(issue.summary ? { summary: issue.summary } : {}),
            })),
          }
        : {}),
    },
    { status: 422 },
  );
}

// The application instance, fully wired but NOT listening. `src/index.ts` is
// the only consumer that calls `.listen()`. Tests import from here and drive
// the app via `app.handle(new Request(...))`.
//
// Order matters. `requestLogger` is first so it assigns a request id and
// logs every request — including unmatched ones. `onError` follows so its
// response-shaping covers every subsequent route including the implicit
// NOT_FOUND. The requestLogger's own onError logs the failure; this one
// returns the user-facing envelope.
export const app = new Elysia()
  .use(requestLogger)
  .onError(({ code, error }) => {
    switch (code) {
      case "NOT_FOUND":
        return Response.json({ error: "Not found" }, { status: 404 });
      case "VALIDATION":
        return buildValidationResponse(error as ValidationErrorShape);
      case "PARSE":
        return Response.json(
          { error: "Invalid request body" },
          { status: 400 },
        );
    }

    return Response.json({ error: "Internal server error" }, { status: 500 });
  })
  .use(securityHeaders)
  .use(cors)
  .use(openapi)
  .use(health)
  .get("/", () => "OpenStream", {
    response: {
      200: t.String({ description: "OpenStream service identifier" }),
    },
    detail: {
      summary: "Service name",
      tags: ["System"],
    },
  })
  .use(authRoutes)
  .use(authMacro)
  .group("/api", (app) =>
    app.use(storage).get("/me", ({ user }) => ok(user), {
      auth: true,
      response: {
        200: dataOf(
          t.Object({
            id: t.String({ minLength: 1 }),
            email: t.String({ format: "email" }),
          }),
        ),
      },
      detail: {
        summary: "Get current user",
        description: "Returns the authenticated user from the active session.",
        tags: ["Users"],
        security: [{ sessionCookie: [] }],
      },
    }),
  );

export type App = typeof app;
