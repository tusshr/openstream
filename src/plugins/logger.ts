import { Elysia } from "elysia";
import type { Logger } from "pino";

import { logger as baseLogger } from "@/lib/logger";

const REQUEST_ID_HEADER = "x-request-id";

type RequestState = {
  requestId: string;
  startedAt: number;
  failureLogged?: boolean;
};

// Per-request state keyed by the Request object. Elysia's `store` is *global*
// (shared across requests), so it cannot safely carry per-request fields:
// concurrent requests would clobber each other's request id, and the
// `failureLogged` flag would leak between requests. A WeakMap is the canonical
// side-table pattern — entries are reclaimed when the Request is GC'd.
const requestState = new WeakMap<Request, RequestState>();

function readOrGenerateRequestId(headers: Headers): string {
  const inbound = headers.get(REQUEST_ID_HEADER);
  if (inbound && inbound.length > 0 && inbound.length <= 128) {
    return inbound;
  }
  // UUIDv7 is time-sortable (RFC 9562). Bun ships a native generator, so we
  // avoid adding a dep. Once Node's crypto.randomUUID emits v7, this stays
  // forward-compatible.
  return Bun.randomUUIDv7();
}

function pathOf(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return request.url;
  }
}

function durationFrom(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 1000) / 1000;
}

// Per-request observability plugin. Wires four hooks:
//
//  1. `onRequest`: extract or generate X-Request-Id, record start time in the
//     per-request side-table, and echo the id back on the response so load
//     balancers / clients can correlate.
//  2. `derive`: attach a pino child logger (`ctx.log`) carrying requestId for
//     the duration of the handler. Only runs for matched routes.
//  3. `onError`: log the failure and mark the request so the completion log
//     is skipped (set.status doesn't reflect Response.json status codes, so
//     a second log line would carry a misleading status).
//  4. `onAfterResponse`: log the completion for successful requests.
//
// onError and onAfterResponse are scoped `as: "global"` so they fire even for
// unmatched routes (404). `derive` doesn't run for those, which is why we
// construct child loggers from the side-table directly in those two hooks.
export const requestLogger = new Elysia({ name: "request-logger" })
  .onRequest(({ request, set }) => {
    const requestId = readOrGenerateRequestId(request.headers);
    set.headers[REQUEST_ID_HEADER] = requestId;
    requestState.set(request, {
      requestId,
      startedAt: performance.now(),
    });
  })
  .derive({ as: "global" }, ({ request }): { log: Logger } => {
    const state = requestState.get(request);
    return {
      log: baseLogger.child({ requestId: state?.requestId }),
    };
  })
  .onError({ as: "global" }, ({ request, error, code }) => {
    const state = requestState.get(request);
    if (state) state.failureLogged = true;

    const durationMs =
      state !== undefined ? durationFrom(state.startedAt) : undefined;

    baseLogger.child({ requestId: state?.requestId }).error(
      {
        method: request.method,
        path: pathOf(request),
        code,
        err: error,
        durationMs,
      },
      "request failed",
    );
  })
  .onAfterResponse({ as: "global" }, ({ request, set }) => {
    const state = requestState.get(request);
    if (!state || state.failureLogged) return;

    baseLogger.child({ requestId: state.requestId }).info(
      {
        method: request.method,
        path: pathOf(request),
        status: set.status ?? 200,
        durationMs: durationFrom(state.startedAt),
      },
      "request completed",
    );
  });
