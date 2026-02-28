import { t, type TSchema } from "elysia";

export const apiMetaSchema = t.Object(
  {
    requestId: t.String({ minLength: 1 }),
    timestamp: t.String({ format: "date-time" }),
    apiVersion: t.String({ minLength: 1 }),
  },
  { description: "Response metadata" },
);

export const apiLinksSchema = t.Record(
  t.String({ minLength: 1 }),
  t.String({ format: "uri" }),
  {
    description: "Related links (must include self when present)",
  },
);

export const errorDetailSchema = t.Object({
  field: t.Optional(t.String({ minLength: 1 })),
  rule: t.Optional(t.String({ minLength: 1 })),
  message: t.String({ minLength: 1 }),
  rejectedValue: t.Optional(t.Unknown()),
});

export const apiErrorSchema = t.Object({
  code: t.String({ minLength: 1 }),
  message: t.String({ minLength: 1 }),
  details: t.Array(errorDetailSchema),
  helpUrl: t.Optional(t.String({ format: "uri" })),
});

export const paginationSchema = t.Object({
  hasMore: t.Boolean(),
  nextCursor: t.Union([t.String({ minLength: 1 }), t.Null()]),
  previousCursor: t.Union([t.String({ minLength: 1 }), t.Null()]),
  limit: t.Number({ minimum: 1 }),
  totalCount: t.Optional(t.Number({ minimum: 0 })),
});

export const successOf = <T extends TSchema>(dataSchema: T) =>
  t.Object({
    status: t.Literal("success"),
    data: dataSchema,
    meta: apiMetaSchema,
    links: t.Optional(apiLinksSchema),
  });

export const collectionOf = <T extends TSchema>(itemSchema: T) =>
  t.Object({
    status: t.Literal("success"),
    data: t.Array(itemSchema),
    pagination: paginationSchema,
    links: apiLinksSchema,
    meta: apiMetaSchema,
  });

export const acceptedOf = <T extends TSchema>(dataSchema: T) =>
  t.Object({
    status: t.Literal("accepted"),
    data: dataSchema,
    meta: apiMetaSchema,
  });

export const apiErrorResponseSchema = t.Object({
  status: t.Literal("error"),
  error: apiErrorSchema,
  meta: apiMetaSchema,
});
