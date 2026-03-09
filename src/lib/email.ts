import nodemailer, { type Transporter } from "nodemailer";

import { env } from "@/env";
import { logger } from "@/lib/logger";

export type EmailMessage = {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
};

export type EmailSendResult =
  | { readonly kind: "sent"; readonly messageId: string }
  | { readonly kind: "dry-run" };

let cachedTransport: Transporter | null = null;

function isConfigured(): boolean {
  return env.SMTP_HOST !== undefined && env.SMTP_FROM !== undefined;
}

function getTransport(): Transporter {
  if (cachedTransport) return cachedTransport;

  if (!isConfigured()) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST and SMTP_FROM before sending mail.",
    );
  }

  const port = env.SMTP_PORT ? Number(env.SMTP_PORT) : 587;
  const secure =
    env.SMTP_SECURE !== undefined ? env.SMTP_SECURE === "true" : port === 465;

  const authConfigured =
    env.SMTP_USER !== undefined && env.SMTP_PASS !== undefined;

  cachedTransport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure,
    ...(authConfigured
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }
      : {}),
  });

  return cachedTransport;
}

export async function sendEmail(
  message: EmailMessage,
): Promise<EmailSendResult> {
  if (!isConfigured()) {
    logger.info(
      {
        smtp: "dry-run",
        to: message.to,
        subject: message.subject,
        text: message.text,
      },
      "email: dry-run (SMTP not configured)",
    );
    return { kind: "dry-run" };
  }

  const transport = getTransport();
  const info = await transport.sendMail({
    from: env.SMTP_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    ...(message.html !== undefined ? { html: message.html } : {}),
  });

  logger.info(
    { to: message.to, subject: message.subject, messageId: info.messageId },
    "email: sent",
  );

  return { kind: "sent", messageId: info.messageId };
}

export function __resetEmailTransport(): void {
  cachedTransport = null;
}
