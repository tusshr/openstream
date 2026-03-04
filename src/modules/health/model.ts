import { t } from "elysia";

const checkStatusSchema = t.Union([t.Literal("ok"), t.Literal("down")], {
  description: "Result of a single dependency probe",
});

export const livenessResponseSchema = t.Object(
  {
    status: t.Literal("ok"),
    uptime: t.Number({ minimum: 0, description: "Process uptime in seconds" }),
    timestamp: t.String({ format: "date-time" }),
  },
  { description: "Process is responsive. No dependencies are checked." },
);

export const readinessResponseSchema = t.Object(
  {
    status: t.Union([t.Literal("ok"), t.Literal("degraded")]),
    timestamp: t.String({ format: "date-time" }),
    checks: t.Object({
      database: checkStatusSchema,
      redis: checkStatusSchema,
    }),
  },
  {
    description:
      "Process plus all critical dependencies. 503 if any dependency is down.",
  },
);

export type LivenessResponse = typeof livenessResponseSchema.static;
export type ReadinessResponse = typeof readinessResponseSchema.static;
export type CheckStatus = typeof checkStatusSchema.static;
