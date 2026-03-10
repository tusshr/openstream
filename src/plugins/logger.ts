import { Elysia } from "elysia";
import type { Logger } from "pino";

import { logger as baseLogger } from "@/lib/logger";

const REQUEST_ID_HEADER = "x-request-id";

type RequestState = {
  requestId: string;
  startedAt: number;
  failureLogged?: boolean;
};

// Per-request state keyed by the Request object. Elysia's `store` is global
// (shared across all requests), so concurrent requests would clobber each
// other's requestId. WeakMap entries are reclaimed when the Request is GC'd.
const requestState = new WeakMap<Request, RequestState>();

function readOrGenerateRequestId(headers: Headers): string {
  const inbound = headers.get(REQUEST_ID_HEADER);
  if (inbound && inbound.length > 0 && inbound.length <= 128) return inbound;
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

export const requestLogger = new Elysia({ name: "request-logger" })
  .onRequest(({ request, set }) => {
    const requestId = readOrGenerateRequestId(request.headers);
    set.headers[REQUEST_ID_HEADER] = requestId;
    requestState.set(request, { requestId, startedAt: performance.now() });
  })
  .derive({ as: "global" }, ({ request }): { log: Logger } => {
    const state = requestState.get(request);
    return { log: baseLogger.child({ requestId: state?.requestId }) };
  })
  .onError({ as: "global" }, ({ request, error, code }) => {
    const state = requestState.get(request);
    if (state) state.failureLogged = true;

    baseLogger.child({ requestId: state?.requestId }).error(
      {
        method: request.method,
        path: pathOf(request),
        code,
        err: error,
        durationMs:
          state !== undefined ? durationFrom(state.startedAt) : undefined,
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
