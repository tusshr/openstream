import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import { logger } from "@/lib/logger";

// Demo job. Exists to prove the producer/consumer wiring end-to-end on a
// pure-function processor. Replace with the first real job (email send) when
// Phase 2 lands.

export const ECHO_JOB_NAME = "echo" as const;

export const echoPayloadSchema = Type.Object({
  message: Type.String({ minLength: 1, maxLength: 1024 }),
});

export type EchoPayload = Static<typeof echoPayloadSchema>;

export type EchoResult = {
  readonly echoed: string;
  readonly receivedAt: string;
};

// Pure processor. Takes a payload, returns a result. No queue / Redis / IO.
// This is the seam unit tests cover; the queue infrastructure around it is
// covered by integration tests once a Redis is available.
export function processEcho(payload: EchoPayload): EchoResult {
  const result: EchoResult = {
    echoed: payload.message,
    receivedAt: new Date().toISOString(),
  };

  logger.info(
    { jobName: ECHO_JOB_NAME, message: payload.message },
    "echo job processed",
  );

  return result;
}

// Runtime guard for payloads coming off the queue. BullMQ stores job data as
// JSON; we re-validate on the consumer side because a payload could have
// been enqueued by an older code version with a different shape.
export function parseEchoPayload(raw: unknown): EchoPayload {
  if (!Value.Check(echoPayloadSchema, raw)) {
    const errors = [...Value.Errors(echoPayloadSchema, raw)]
      .map((e) => `${e.path}: ${e.message}`)
      .join("; ");
    throw new Error(`Invalid echo job payload: ${errors}`);
  }
  return raw;
}
