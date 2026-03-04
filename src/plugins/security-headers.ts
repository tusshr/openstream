import { Elysia } from "elysia";

import { env } from "@/env";

// Minimal hardening for an API server. CSP is intentionally omitted —
// it belongs on HTML responses, which this service does not emit.
// Reference: OWASP Secure Headers Project (2024).
const STATIC_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-site",
} as const;

// HSTS is only meaningful over HTTPS, and only safe to send in production.
// Sending it from a dev box that ever serves over http would brick browsers
// for the host.
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
}).onAfterHandle({ as: "global" }, ({ set }) => {
  for (const [name, value] of Object.entries(headers)) {
    // Don't clobber a header a handler has deliberately set.
    if (set.headers[name] === undefined) {
      set.headers[name] = value;
    }
  }
});
