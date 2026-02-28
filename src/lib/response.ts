import { t, type TSchema } from "elysia";

import type {
  ApiAcceptedResponse,
  ApiError,
  ApiErrorResponse,
  ApiLinks,
  ApiMeta,
  ApiSuccessResponse,
} from "@/lib/api/contracts";
import {
  acceptedOf,
  apiErrorResponseSchema,
  successOf,
} from "@/lib/api/models";

/** Wraps a success value in the standard { data: T } envelope */
export const ok = <T>(data: T): { data: T } => ({ data });

/** Wraps a TypeBox schema in { data: schema } for response type registration */
export const dataOf = <T extends TSchema>(schema: T) =>
  t.Object({ data: schema });

/** Full success envelope with status/meta for endpoints that need richer metadata. */
export const okWithMeta = <T>(
  data: T,
  meta: ApiMeta,
  links?: ApiLinks,
): ApiSuccessResponse<T> => ({
  status: "success",
  data,
  meta,
  links,
});

/** Full accepted envelope for async/process-later endpoints. */
export const accepted = <T>(
  data: T,
  meta: ApiMeta,
): ApiAcceptedResponse<T> => ({
  status: "accepted",
  data,
  meta,
});

/** Full error envelope for consistent machine-readable errors. */
export const err = (error: ApiError, meta: ApiMeta): ApiErrorResponse => ({
  status: "error",
  error,
  meta,
});

/** Rich envelope response schemas (opt-in). */
export const successResponseOf = <T extends TSchema>(schema: T) =>
  successOf(schema);
export const acceptedResponseOf = <T extends TSchema>(schema: T) =>
  acceptedOf(schema);
export const errorResponse = apiErrorResponseSchema;
