import { Elysia, status } from "elysia";

// Header-pair CSRF defense for cookie-authed APIs.
//
// Why this works:
//   * Browsers will not add a custom header on cross-origin form submissions,
//     <img>, <script>, or any "simple" request — there's no API for it.
//   * A cross-origin `fetch()` that sets this header triggers a CORS
//     preflight (OPTIONS). The preflight is rejected by our `cors` plugin
//     unless the origin is on the allowlist.
//   * Same-origin JS (our own frontend) can add the header freely.
//
// So the presence of `X-Requested-With: openstream` is a reliable signal
// that the request originated from same-origin JavaScript that we own.
// It is NOT a substitute for SameSite cookies or origin checks — it's a
// belt-and-braces second line.

const CSRF_HEADER = "x-requested-with";
const CSRF_HEADER_VALUE = "openstream";

// Methods that, by spec, must not have side effects. CSRF only matters for
// state-changing requests. Skipping safe methods keeps health probes,
// browser navigation, and image loads working without a header.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const csrf = new Elysia({ name: "csrf" }).onBeforeHandle(
  { as: "global" },
  ({ request }) => {
    if (SAFE_METHODS.has(request.method)) return;

    const received = request.headers.get(CSRF_HEADER);
    if (received !== CSRF_HEADER_VALUE) {
      return status(403, {
        error: {
          code: "FORBIDDEN",
          message: `Missing or invalid '${CSRF_HEADER}' header.`,
        },
      });
    }
  },
);
