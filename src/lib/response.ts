import { t, type TSchema } from "elysia";

import {
  ApiErrorResponseSchema,
  collectionOf,
  responseOf,
  type ApiError,
  type ApiErrorResponse,
  type ApiResponse,
  type PaginationLinks,
  type PaginationMeta,
} from "@/lib/api/models";

export function ok<T>(data: T): { data: T } {
  return { data };
}

export function dataOf<T extends TSchema>(schema: T) {
  return t.Object({ data: schema });
}

export function okWithMeta<T>(
  data: T,
  meta: PaginationMeta,
  links?: PaginationLinks,
): ApiResponse<T> {
  return links === undefined ? { data, meta } : { data, meta, links };
}

export function err(error: ApiError): ApiErrorResponse {
  return { error };
}

export { responseOf, collectionOf };

export const errorResponse = ApiErrorResponseSchema;
