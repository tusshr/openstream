import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import {
  type EmailMessage,
  type EmailSendResult,
  sendEmail,
} from "@/lib/email";
import { logger } from "@/lib/logger";

export const EMAIL_JOB_NAME = "email" as const;

const verificationPayloadSchema = Type.Object({
  kind: Type.Literal("verification"),
  to: Type.String({ format: "email" }),
  name: Type.String({ minLength: 1 }),
  url: Type.String({ format: "uri" }),
});

const resetPasswordPayloadSchema = Type.Object({
  kind: Type.Literal("reset-password"),
  to: Type.String({ format: "email" }),
  name: Type.String({ minLength: 1 }),
  url: Type.String({ format: "uri" }),
});

const changeEmailPayloadSchema = Type.Object({
  kind: Type.Literal("change-email"),
  to: Type.String({ format: "email" }),
  name: Type.String({ minLength: 1 }),
  newEmail: Type.String({ format: "email" }),
  url: Type.String({ format: "uri" }),
});

export const emailPayloadSchema = Type.Union([
  verificationPayloadSchema,
  resetPasswordPayloadSchema,
  changeEmailPayloadSchema,
]);

export type EmailPayload = Static<typeof emailPayloadSchema>;
export type VerificationPayload = Static<typeof verificationPayloadSchema>;
export type ResetPasswordPayload = Static<typeof resetPasswordPayloadSchema>;
export type ChangeEmailPayload = Static<typeof changeEmailPayloadSchema>;

const APP_NAME = "OpenStream";

export function buildVerificationEmail(
  payload: VerificationPayload,
): EmailMessage {
  return {
    to: payload.to,
    subject: `Verify your email — ${APP_NAME}`,
    text: [
      `Hi ${payload.name},`,
      "",
      `Welcome to ${APP_NAME}. Verify your email by opening this link:`,
      payload.url,
      "",
      "If you didn't sign up, you can safely ignore this message.",
      "",
      `— ${APP_NAME}`,
    ].join("\n"),
  };
}

export function buildResetPasswordEmail(
  payload: ResetPasswordPayload,
): EmailMessage {
  return {
    to: payload.to,
    subject: `Reset your password — ${APP_NAME}`,
    text: [
      `Hi ${payload.name},`,
      "",
      `Reset your ${APP_NAME} password by opening this link:`,
      payload.url,
      "",
      "If you didn't request a password reset, ignore this email — your password stays unchanged.",
      "",
      `— ${APP_NAME}`,
    ].join("\n"),
  };
}

export function buildChangeEmailEmail(
  payload: ChangeEmailPayload,
): EmailMessage {
  return {
    // Sent to the current address per better-auth convention; mentions both so
    // the user knows what they're approving.
    to: payload.to,
    subject: `Confirm your new email — ${APP_NAME}`,
    text: [
      `Hi ${payload.name},`,
      "",
      `Someone (probably you) requested to change your ${APP_NAME} email from ${payload.to} to ${payload.newEmail}.`,
      "Confirm the change by opening this link:",
      payload.url,
      "",
      "If you didn't request this, ignore the message and change your password as a precaution.",
      "",
      `— ${APP_NAME}`,
    ].join("\n"),
  };
}

function buildMessage(payload: EmailPayload): EmailMessage {
  switch (payload.kind) {
    case "verification":
      return buildVerificationEmail(payload);
    case "reset-password":
      return buildResetPasswordEmail(payload);
    case "change-email":
      return buildChangeEmailEmail(payload);
  }
}

// Re-validate on the consumer side — an older producer could have enqueued a
// payload with a different shape.
export function parseEmailPayload(raw: unknown): EmailPayload {
  if (!Value.Check(emailPayloadSchema, raw)) {
    const errors = [...Value.Errors(emailPayloadSchema, raw)]
      .map((e) => `${e.path}: ${e.message}`)
      .join("; ");
    throw new Error(`Invalid email job payload: ${errors}`);
  }
  return raw;
}

export async function processEmail(
  payload: EmailPayload,
): Promise<EmailSendResult> {
  const message = buildMessage(payload);
  const result = await sendEmail(message);

  logger.info(
    { jobName: EMAIL_JOB_NAME, kind: payload.kind, result: result.kind },
    "email job processed",
  );

  return result;
}
