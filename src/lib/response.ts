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

// Wraps a success value in the standard { data: T } envelope.
export function ok<T>(data: T): { data: T } {
  return { data };
}

// Wraps a TypeBox schema in { data: schema } for response type registration.
export function dataOf<T extends TSchema>(schema: T) {
  return t.Object({ data: schema });
}

// Full success envelope with status/meta for endpoints that need richer
// metadata. The {data:T} envelope above is the project default; opt into this
// one only when you genuinely need meta/links.
export function okWithMeta<T>(
  data: T,
  meta: ApiMeta,
  links?: ApiLinks,
): ApiSuccessResponse<T> {
  return { status: "success", data, meta, links };
}

// Full accepted envelope for async/process-later endpoints.
export function accepted<T>(data: T, meta: ApiMeta): ApiAcceptedResponse<T> {
  return { status: "accepted", data, meta };
}

// Full error envelope for consistent machine-readable errors.
export function err(error: ApiError, meta: ApiMeta): ApiErrorResponse {
  return { status: "error", error, meta };
}

// Rich envelope response schemas (opt-in).
export function successResponseOf<T extends TSchema>(schema: T) {
  return successOf(schema);
}

export function acceptedResponseOf<T extends TSchema>(schema: T) {
  return acceptedOf(schema);
}

export const errorResponse = apiErrorResponseSchema;
