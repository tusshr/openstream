import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import { logger } from "@/lib/logger";

export const ECHO_JOB_NAME = "echo" as const;

export const echoPayloadSchema = Type.Object({
  message: Type.String({ minLength: 1, maxLength: 1024 }),
});

export type EchoPayload = Static<typeof echoPayloadSchema>;

export type EchoResult = {
  readonly echoed: string;
  readonly receivedAt: string;
};

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

export function parseEchoPayload(raw: unknown): EchoPayload {
  if (!Value.Check(echoPayloadSchema, raw)) {
    const errors = [...Value.Errors(echoPayloadSchema, raw)]
      .map((e) => `${e.path}: ${e.message}`)
      .join("; ");
    throw new Error(`Invalid echo job payload: ${errors}`);
  }
  return raw;
}
