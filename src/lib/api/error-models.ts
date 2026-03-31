import { Elysia } from "elysia";

import { ProblemDetailsSchema } from "./models";

export const errorModels = new Elysia({ name: "error-models" }).model({
  ProblemDetails: ProblemDetailsSchema,
});
