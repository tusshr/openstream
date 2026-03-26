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

export const ProblemDetailsSchema = t.Object(
  {
    type: t.String({ description: "Problem type URI. Always 'about:blank'." }),
    title: t.String({
      description: "Short, human-readable summary (the HTTP status phrase).",
    }),
    status: t.Integer({
      description: "HTTP status code, repeated in the body.",
    }),
    detail: t.String({
      description: "Human-readable explanation specific to this occurrence.",
    }),
    code: t.String({
      minLength: 1,
      description: "Machine-readable error code (extension member).",
    }),
    instance: t.Optional(
      t.String({
        description: "Path of the failing request (extension member).",
      }),
    ),
    errors: t.Optional(
      t.Array(FieldErrorSchema, {
        description: "Field-level validation errors (extension member).",
      }),
    ),
  },
  { description: "RFC 9457 problem details" },
);

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
export type ProblemDetails = typeof ProblemDetailsSchema.static;
export type ApiResponse<T> = {
  data: T;
  meta?: PaginationMeta;
  links?: PaginationLinks;
};
