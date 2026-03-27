import { Elysia, t } from "elysia";

import { dataOf, HttpProblem, ok } from "@/lib/response";
import { authMacro } from "@/modules/auth";

import { UpdateRoleBodySchema, UserResponseSchema } from "./model";
import { usersService } from "./service";

export const users = new Elysia({ name: "users" })
  .use(authMacro)
  .model({
    "users.me.response": dataOf(UserResponseSchema),
    "users.list.response": dataOf(t.Array(UserResponseSchema)),
    "users.role.body": UpdateRoleBodySchema,
  })
  .get(
    "/me",
    ({ user }) =>
      ok({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image ?? null,
        role: user.role ?? "student",
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
  )
  .get("/users", async () => ok(await usersService.list()), {
    auth: { can: ["read", "User"] },
    response: { 200: "users.list.response" },
    detail: {
      summary: "List users",
      description:
        "Admin-only. Returns all users (capped). Requires read:User.",
      tags: ["Users"],
      security: [{ sessionCookie: [] }],
    },
  })
  .patch(
    "/users/:id/role",
    async ({ params, body, user }) => {
      // Coarse self-lockout guard: an admin can't change their own role.
      if (params.id === user.id) {
        throw new HttpProblem(
          400,
          "CANNOT_MODIFY_SELF",
          "You cannot change your own role.",
        );
      }
      const updated = await usersService.setRole(params.id, body.role);
      if (!updated) throw new HttpProblem(404, "NOT_FOUND", "User not found.");
      return ok(updated);
    },
    {
      auth: { can: ["update", "User"] },
      params: t.Object({ id: t.String({ minLength: 1 }) }),
      body: "users.role.body",
      response: { 200: "users.me.response" },
      detail: {
        summary: "Set a user's role",
        description:
          "Admin-only. Promotes/demotes a user between user, educator, and admin. Requires update:User.",
        tags: ["Users"],
        security: [{ sessionCookie: [], csrfHeader: [] }],
      },
    },
  );
