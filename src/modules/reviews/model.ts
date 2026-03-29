import { t } from "elysia";

const RatingSchema = t.Integer({ minimum: 1, maximum: 5 });

export const CreateReviewBodySchema = t.Object({
  courseId: t.String({ minLength: 1 }),
  rating: RatingSchema,
  body: t.Optional(t.Union([t.String({ maxLength: 5000 }), t.Null()])),
});

export const UpdateReviewBodySchema = t.Partial(
  t.Object({
    rating: RatingSchema,
    body: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
  }),
);

// Raw row (author's own view — create/update responses).
export const ReviewSchema = t.Object({
  id: t.String(),
  userId: t.String(),
  courseId: t.String(),
  rating: t.Integer(),
  body: t.Union([t.String(), t.Null()]),
  createdAt: t.Date(),
  updatedAt: t.Date(),
});

// Public list row — author name instead of raw userId emphasis.
export const PublicReviewSchema = t.Object({
  id: t.String(),
  userId: t.String(),
  authorName: t.String(),
  rating: t.Integer(),
  body: t.Union([t.String(), t.Null()]),
  createdAt: t.Date(),
  updatedAt: t.Date(),
});

export type CreateReviewBody = typeof CreateReviewBodySchema.static;
export type UpdateReviewBody = typeof UpdateReviewBodySchema.static;
