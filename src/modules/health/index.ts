import { Elysia } from "elysia";

import { LivenessResponseSchema, ReadinessResponseSchema } from "./model";
import { healthService } from "./service";

function buildLivenessResponse() {
  return {
    status: "ok" as const,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
}

export const health = new Elysia({ name: "health" })
  .model({
    "health.liveness.response": LivenessResponseSchema,
    "health.readiness.response": ReadinessResponseSchema,
  })
  .get("/livez", () => buildLivenessResponse(), {
    response: { 200: "health.liveness.response" },
    detail: {
      summary: "Liveness probe",
      description:
        "Reports only that the process is alive. No dependencies are checked.",
      tags: ["System"],
    },
  })
  .get(
    "/readyz",
    async ({ set }) => {
      const result = await healthService.checkReadiness();
      if (result.status !== "ok") set.status = 503;
      return result;
    },
    {
      response: {
        200: "health.readiness.response",
        503: "health.readiness.response",
      },
      detail: {
        summary: "Readiness probe",
        description:
          "Pings Postgres and Redis. Returns 503 if any dependency is unreachable.",
        tags: ["System"],
      },
    },
  )
  .get(
    "/health",
    async ({ set }) => {
      const result = await healthService.checkReadiness();
      if (result.status !== "ok") set.status = 503;
      return result;
    },
    {
      response: {
        200: "health.readiness.response",
        503: "health.readiness.response",
      },
      detail: {
        summary: "Readiness probe (alias of /readyz)",
        description:
          "Retained for monitors pointed at /health. Identical to /readyz.",
        tags: ["System"],
      },
    },
  );
