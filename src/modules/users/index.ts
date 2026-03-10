import { Elysia, t } from "elysia";

import { dataOf, ok } from "@/lib/response";
import { authMacro } from "@/modules/auth";

export const users = new Elysia({ name: "users" })
  .use(authMacro)
  .get("/me", ({ user }) => ok(user), {
    auth: true,
    response: {
      200: dataOf(
        t.Object({
          id: t.String({ minLength: 1 }),
          email: t.String({ format: "email" }),
        }),
      ),
    },
    detail: {
      summary: "Get current user",
      description: "Returns the authenticated user from the active session.",
      tags: ["Users"],
      security: [{ sessionCookie: [] }],
    },
  });
