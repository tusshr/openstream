import { Elysia, t } from "elysia";

import { dataOf, ok } from "@/lib/response";
import { betterAuth } from "@/modules/auth";
import { health } from "@/modules/health";
import { storage } from "@/modules/storage";
import { cors } from "@/plugins/cors";
import { openapi } from "@/plugins/openapi";
import { securityHeaders } from "@/plugins/security-headers";

type ValidationIssue = {
  path?: string;
  message?: string;
  summary?: string;
};

type ValidationErrorShape = {
  message?: string;
  on?: string;
  property?: string;
  summary?: string;
  errors?: ValidationIssue[];
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
// onError is registered FIRST so it covers every subsequent route — including
// the implicit NOT_FOUND for unmatched paths. Elysia's "order matters" rule
// means a mid-chain onError would only catch errors from routes registered
// after it. Keep it at the top.
export const app = new Elysia()
  .onError(({ code, error }) => {
    // Always log the real error internally; never expose it to the client.
    console.error(`[${new Date().toISOString()}] [${code}]`, error);

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
  .use(betterAuth)
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
