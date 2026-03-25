import { cors as corsPlugin } from "@elysiajs/cors";

import { env } from "@/env";

const ALLOWED_HEADERS = ["Content-Type", "Authorization"];
const CSRF_GUARD_HEADER = "x-requested-with";

if (ALLOWED_HEADERS.some((h) => h.toLowerCase() === CSRF_GUARD_HEADER)) {
  throw new Error(
    `CORS allowedHeaders must not include '${CSRF_GUARD_HEADER}' — it would disable CSRF protection.`,
  );
}

export const cors = corsPlugin({
  ...(env.ALLOWED_ORIGIN !== undefined ? { origin: env.ALLOWED_ORIGIN } : {}),
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ALLOWED_HEADERS,
});
