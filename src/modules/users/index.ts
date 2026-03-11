import { Elysia } from "elysia";

import { dataOf, ok } from "@/lib/response";
import { authMacro } from "@/modules/auth";

import { UserResponseSchema } from "./model";

export const users = new Elysia({ name: "users" })
  .use(authMacro)
  .model({ "users.me.response": dataOf(UserResponseSchema) })
  .get(
    "/me",
    ({ user }) =>
      ok({
        id: user.id,
        name: user.name,
        email: user.email,
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
        image: user.image ?? null,
        role: user.role ?? "user",
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      }),
    {
      auth: true,
      response: { 200: "users.me.response" },
      detail: {
        summary: "Get current user",
        description: "Returns the authenticated user from the active session.",
        tags: ["Users"],
        security: [{ sessionCookie: [] }],
      },
    },
  );
