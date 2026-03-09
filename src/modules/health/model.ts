import { t } from "elysia";

const CheckStatusSchema = t.Union([t.Literal("ok"), t.Literal("down")], {
  description: "Result of a single dependency probe",
});

export const LivenessResponseSchema = t.Object(
  {
    status: t.Literal("ok"),
    uptime: t.Number({ minimum: 0, description: "Process uptime in seconds" }),
    timestamp: t.String({ format: "date-time" }),
  },
  { description: "Process is responsive. No dependencies are checked." },
);

export const ReadinessResponseSchema = t.Object(
  {
    status: t.Union([t.Literal("ok"), t.Literal("degraded")]),
    timestamp: t.String({ format: "date-time" }),
    checks: t.Object({
      database: CheckStatusSchema,
      redis: CheckStatusSchema,
    }),
  },
  {
    description:
      "Process plus all critical dependencies. 503 if any dependency is down.",
  },
);

export type LivenessResponse = typeof LivenessResponseSchema.static;
export type ReadinessResponse = typeof ReadinessResponseSchema.static;
export type CheckStatus = typeof CheckStatusSchema.static;
