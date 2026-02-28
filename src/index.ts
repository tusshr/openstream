import { Elysia, t } from "elysia";

import { env } from "@/env";
import { cors } from "@/lib/cors";
import { openapi } from "@/lib/openapi";
import { dataOf, ok } from "@/lib/response";
import { betterAuth } from "@/modules/auth";
import { storage } from "@/modules/storage";

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

const normalizeValidationError = (
  validationError: ValidationErrorShape,
): ValidationErrorShape => {
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
};

export const app = new Elysia()
  .use(cors)
  .use(openapi)
  .get("/", "OpenStream", {
    response: {
      200: t.String({ description: "OpenStream service identifier" }),
    },
    detail: {
      summary: "Service name",
      tags: ["System"],
    },
  })
  .get(
    "/health",
    {
      status: "OK",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
    {
      response: {
        200: t.String({ description: "OpenStream service identifier" }),
      },
      detail: {
        summary: "Service name",
        tags: ["System"],
      },
    },
  )
  .onError(({ code, error }) => {
    // Always log the real error internally — never expose it to the client
    console.error(`[${new Date().toISOString()}] [${code}]`, error);

    switch (code) {
      case "NOT_FOUND":
        return Response.json({ error: "Not found" }, { status: 404 });
      case "VALIDATION": {
        const validationError = normalizeValidationError(
          error as ValidationErrorShape,
        );
        return Response.json(
          {
            error: "Validation failed",
            message:
              validationError.message ??
              "Request validation failed. Please check your input.",
            ...(validationError.on ? { on: validationError.on } : {}),
            ...(validationError.property
              ? { property: validationError.property }
              : {}),
            ...(validationError.summary
              ? { summary: validationError.summary }
              : {}),
            ...(Array.isArray(validationError.errors)
              ? {
                  issues: validationError.errors.map((issue) => ({
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
      case "PARSE":
        return Response.json(
          { error: "Invalid request body" },
          { status: 400 },
        );
    }

    // Unknown errors (DB failures, unhandled exceptions) — never leak internals
    return Response.json({ error: "Internal server error" }, { status: 500 });
  })
  .use(betterAuth)
  .group("/api", (app) =>
    app
      .use(storage) // /api/storage/**
      // example protected route
      .get("/me", ({ user }) => ok(user), {
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
          description:
            "Returns the authenticated user from the active session.",
          tags: ["Users"],
          security: [{ sessionCookie: [] }],
        },
      }),
  )
  .listen(env.PORT ? Number(env.PORT) : 8080);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);
