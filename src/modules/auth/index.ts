import { Elysia } from "elysia";

import { auth } from "@/lib/auth";

// Better-auth ships a single fetch-style handler. We scope it to /api/auth/*
// rather than using a bare `.mount(auth.handler)` because the bare form acts
// as a catch-all: it intercepts *every* unmatched request and returns its own
// 404, which would prevent our global onError from emitting the consistent
// { error: "Not found" } envelope for the rest of the API.
export const betterAuth = new Elysia({ name: "better-auth" })
  .all("/api/auth/*", ({ request }) => auth.handler(request))
  .macro({
    auth: {
      async resolve({ status, request: { headers } }) {
        // Treat *any* session-lookup failure as unauthenticated. If Redis or
        // the DB is unreachable we surface 401 to the caller rather than
        // leaking 500s; the /readyz probe is the right signal for "system
        // degraded" and the load balancer drains the pod from there.
        const session = await auth.api
          .getSession({ headers })
          .catch((error: unknown) => {
            console.error("[auth] getSession failed:", error);
            return null;
          });

        if (!session) return status(401);
        return { user: session.user, session: session.session };
      },
    },
  });
