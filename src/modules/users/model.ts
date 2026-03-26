import { t } from "elysia";

export const UserResponseSchema = t.Object({
  id: t.String({ minLength: 1 }),
  name: t.String(),
  email: t.String({ format: "email" }),
  image: t.Union([t.String(), t.Null()]),
  role: t.String({ minLength: 1 }),
  emailVerified: t.Boolean(),
  createdAt: t.Date(),
});

export type UserResponse = typeof UserResponseSchema.static;
