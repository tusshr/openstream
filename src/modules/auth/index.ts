import { Elysia } from "elysia";

import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";

// Two separate concerns split into two plugins.
//
// `authMacro` provides the `auth: true` route option. Apply it wherever a
// route needs to read the session. Adds NO routes, so it's safe to .use()
// inside nested modules without polluting their prefix.
//
// `authRoutes` registers better-auth's catch-all `/api/auth/*` handler.
// Apply it ONCE at the root. Mounting it inside a prefixed module would
// register the catch-all under that prefix (e.g. `/api/storage/api/auth/*`),
// which is exactly the bug this split exists to prevent.
//
// Note: `.mount(auth.handler)` without a path acts as a sink — it intercepts
// every unmatched request and returns better-auth's own empty-body 404,
// blocking our global onError. We use `.all("/api/auth/*", ...)` instead so
// unmatched paths fall through to onError and get the standard envelope.

export const authMacro = new Elysia({ name: "auth-macro" }).macro({
  auth: {
    async resolve({ status, request: { headers } }) {
      // Treat *any* session-lookup failure as unauthenticated. If Redis or
      // the DB is unreachable we surface 401 to the caller rather than
      // leaking 500s; /readyz is the right signal for "system degraded" and
      // the load balancer drains the pod from there.
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
    detail: {
      // Hidden from OpenAPI — better-auth has its own catalog of routes
      // behind this wildcard. Documenting a single placeholder would be
      // worse than nothing.
      hide: true,
    },
  },
);
