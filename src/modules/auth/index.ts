import { Elysia } from "elysia";

import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";

// `authMacro` provides the `auth: true` route option — no routes added, safe to
// use inside nested modules. `authRoutes` registers `/api/auth/*` at the root;
// mounting inside a prefixed module would nest the path incorrectly.
export const authMacro = new Elysia({ name: "auth-macro" }).macro({
  auth: {
    async resolve({ status, request: { headers } }) {
      const session = await auth.api
        .getSession({ headers })
        .catch((error: unknown) => {
          logger.warn({ err: error }, "auth: getSession failed");
          return null;
        });

      if (!session) return status(401);
      return { user: session.user, session: session.session };
    },
  },
});

export const authRoutes = new Elysia({ name: "auth-routes" }).all(
  "/api/auth/*",
  ({ request }) => auth.handler(request),
  {
    detail: { hide: true },
  },
);
