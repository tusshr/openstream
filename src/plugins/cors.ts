import { cors as corsPlugin } from "@elysiajs/cors";

import { env } from "@/env";

// `origin` is conditionally included so we don't pass `undefined` explicitly
// — the cors plugin's typing for `origin` doesn't allow undefined under
// exactOptionalPropertyTypes. When ALLOWED_ORIGIN is unset (dev), no origin
// restriction is configured; otherwise the value is honored.
export const cors = corsPlugin({
  ...(env.ALLOWED_ORIGIN !== undefined ? { origin: env.ALLOWED_ORIGIN } : {}),
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
});
