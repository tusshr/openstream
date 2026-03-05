import { Elysia } from "elysia";
import type { Logger } from "pino";

import { logger as baseLogger } from "@/lib/logger";

const REQUEST_ID_HEADER = "x-request-id";

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

// Per-request observability plugin. Wires three things:
//
//  1. `onRequest`: extract or generate `X-Request-Id`, stash it + a start
//     time on the request store, and echo the id back on the response so
//     load balancers / clients can correlate.
//  2. `derive`: attach a pino child logger to the request context. Every
//     log line emitted via `ctx.log` automatically carries `requestId`.
//  3. `onAfterResponse` and `onError`: emit completion / failure logs with
//     method, path, status, and duration.
//
// All hooks are scoped `as: "global"` so they cover routes registered after
// the plugin is mounted, including nested plugin instances.
export const requestLogger = new Elysia({ name: "request-logger" })
  .onRequest(({ request, set, store }) => {
    // onRequest fires for every request that reaches the instance — no scope
    // option needed (and Elysia's typing doesn't accept one for this hook).
    const requestId = readOrGenerateRequestId(request.headers);
    set.headers[REQUEST_ID_HEADER] = requestId;
    (store as { requestId?: string; startedAt?: number }).requestId = requestId;
    (store as { requestId?: string; startedAt?: number }).startedAt =
      performance.now();
  })
  .derive({ as: "global" }, ({ store }): { log: Logger } => {
    const requestId = (store as { requestId?: string }).requestId;
    return {
      log: baseLogger.child({ requestId }),
    };
  })
  .onAfterResponse({ as: "global" }, ({ request, set, store, log }) => {
    const startedAt = (store as { startedAt?: number }).startedAt;
    const durationMs =
      startedAt !== undefined
        ? Math.round((performance.now() - startedAt) * 1000) / 1000
        : undefined;

    log.info(
      {
        method: request.method,
        path: pathOf(request),
        status: set.status ?? 200,
        durationMs,
      },
      "request completed",
    );
  })
  .onError({ as: "global" }, ({ request, error, code, store }) => {
    const startedAt = (store as { startedAt?: number }).startedAt;
    const requestId = (store as { requestId?: string }).requestId;
    const durationMs =
      startedAt !== undefined
        ? Math.round((performance.now() - startedAt) * 1000) / 1000
        : undefined;

    baseLogger.child({ requestId }).error(
      {
        method: request.method,
        path: pathOf(request),
        code,
        err: error,
        durationMs,
      },
      "request failed",
    );
  });
