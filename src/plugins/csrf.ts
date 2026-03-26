import { Elysia } from "elysia";

import { problem } from "@/lib/response";

const CSRF_HEADER = "x-requested-with";
const CSRF_HEADER_VALUE = "openstream";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const csrf = new Elysia({ name: "csrf" }).onBeforeHandle(
  { as: "global" },
  ({ request }) => {
    if (SAFE_METHODS.has(request.method)) return;

    const received = request.headers.get(CSRF_HEADER);
    if (received !== CSRF_HEADER_VALUE) {
      return problem({
        status: 403,
        code: "FORBIDDEN",
        detail: `Missing or invalid '${CSRF_HEADER}' header.`,
        instance: new URL(request.url).pathname,
      });
    }
  },
);
