import { Elysia } from "elysia";

import {
  livenessResponseSchema,
  type ReadinessResponse,
  readinessResponseSchema,
} from "./model";
import { healthService } from "./service";

function buildLivenessResponse() {
  return {
    status: "ok" as const,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
}

// Readiness shares one handler between /readyz and /health (alias). 503 is set
// on the response object so k8s / load balancers can drain pods correctly.
async function buildReadinessResponse({
  set,
}: {
  set: { status?: number };
}): Promise<ReadinessResponse> {
  const result = await healthService.checkReadiness();
  if (result.status !== "ok") {
    set.status = 503;
  }
  return result;
}

export const health = new Elysia({ name: "health" })
  .model({
    "health.liveness.response": livenessResponseSchema,
    "health.readiness.response": readinessResponseSchema,
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
  .get("/readyz", (ctx) => buildReadinessResponse(ctx), {
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
  })
  .get("/health", (ctx) => buildReadinessResponse(ctx), {
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
  });
