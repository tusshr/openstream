import { t, type TSchema } from "elysia";

export const PaginationMetaSchema = t.Object(
  {
    hasMore: t.Boolean(),
    nextCursor: t.Union([t.String({ minLength: 1 }), t.Null()]),
    previousCursor: t.Union([t.String({ minLength: 1 }), t.Null()]),
    limit: t.Number({ minimum: 1 }),
    totalCount: t.Optional(t.Number({ minimum: 0 })),
  },
  { description: "Pagination metadata" },
);

export const PaginationLinksSchema = t.Object(
  {
    self: t.String({ format: "uri" }),
    next: t.Optional(t.String({ format: "uri" })),
    prev: t.Optional(t.String({ format: "uri" })),
  },
  { description: "Pagination navigation links" },
);

export const FieldErrorSchema = t.Object({
  field: t.Optional(t.String({ minLength: 1 })),
  rule: t.Optional(t.String({ minLength: 1 })),
  message: t.String({ minLength: 1 }),
  rejectedValue: t.Optional(t.Unknown()),
});

export const ApiErrorSchema = t.Object({
  code: t.String({ minLength: 1 }),
  message: t.String({ minLength: 1 }),
  details: t.Optional(t.Array(FieldErrorSchema)),
});

export const ApiErrorResponseSchema = t.Object({
  error: ApiErrorSchema,
});

export const responseOf = <T extends TSchema>(dataSchema: T) =>
  t.Object({
    data: dataSchema,
    meta: t.Optional(PaginationMetaSchema),
    links: t.Optional(PaginationLinksSchema),
  });

export const collectionOf = <T extends TSchema>(itemSchema: T) =>
  t.Object({
    data: t.Array(itemSchema),
    meta: PaginationMetaSchema,
    links: t.Optional(PaginationLinksSchema),
  });

export type PaginationMeta = typeof PaginationMetaSchema.static;
export type PaginationLinks = typeof PaginationLinksSchema.static;
export type FieldError = typeof FieldErrorSchema.static;
export type ApiError = typeof ApiErrorSchema.static;
export type ApiErrorResponse = typeof ApiErrorResponseSchema.static;
export type ApiResponse<T> = {
  data: T;
  meta?: PaginationMeta;
  links?: PaginationLinks;
};
