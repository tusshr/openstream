import { t } from "elysia";

const NullableText = (max: number) =>
  t.Optional(t.Union([t.String({ maxLength: max }), t.Null()]));

export const UpsertEducatorProfileBodySchema = t.Object({
  bio: NullableText(2000),
  headline: NullableText(200),
  website: NullableText(500),
  twitter: NullableText(100),
  linkedin: NullableText(100),
  youtube: NullableText(100),
});

export const EducatorProfileSchema = t.Object({
  userId: t.String(),
  name: t.String(),
  bio: t.Union([t.String(), t.Null()]),
  headline: t.Union([t.String(), t.Null()]),
  website: t.Union([t.String(), t.Null()]),
  twitter: t.Union([t.String(), t.Null()]),
  linkedin: t.Union([t.String(), t.Null()]),
  youtube: t.Union([t.String(), t.Null()]),
  createdAt: t.Date(),
  updatedAt: t.Date(),
});

export type UpsertEducatorProfileBody =
  typeof UpsertEducatorProfileBodySchema.static;
