import { Elysia } from "elysia";

import { env } from "@/env";

const STATIC_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-site",
} as const;

const HSTS_HEADER = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
} as const;

function buildHeaders(): Record<string, string> {
  return env.NODE_ENV === "production"
    ? { ...STATIC_HEADERS, ...HSTS_HEADER }
    : { ...STATIC_HEADERS };
}

const headers = buildHeaders();

export const securityHeaders = new Elysia({
  name: "security-headers",
}).onRequest(({ set }) => {
  for (const [name, value] of Object.entries(headers)) {
    if (set.headers[name] === undefined) {
      set.headers[name] = value;
    }
  }
});
