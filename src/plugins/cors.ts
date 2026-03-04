import { cors as corsPlugin } from "@elysiajs/cors";

import { env } from "@/env";

export const cors = corsPlugin({
  origin: env.ALLOWED_ORIGIN,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
});
