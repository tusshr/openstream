import { describe, expect, test } from "bun:test";

import {
  buildChangeEmailEmail,
  buildResetPasswordEmail,
  buildVerificationEmail,
  EMAIL_JOB_NAME,
  parseEmailPayload,
  processEmail,
} from "@/modules/jobs/email";

const verificationPayload = {
  kind: "verification",
  to: "alice@example.com",
  name: "Alice",
  url: "https://openstream.app/verify?token=abc",
} as const;

const resetPayload = {
  kind: "reset-password",
  to: "alice@example.com",
  name: "Alice",
  url: "https://openstream.app/reset?token=abc",
} as const;

const changeEmailPayload = {
  kind: "change-email",
  to: "alice@example.com",
  name: "Alice",
  newEmail: "alice+new@example.com",
  url: "https://openstream.app/confirm?token=abc",
} as const;

describe("buildVerificationEmail", () => {
  test("addresses the recipient, names the app, and embeds the link", () => {
    const message = buildVerificationEmail(verificationPayload);
    expect(message.to).toBe("alice@example.com");
    expect(message.subject).toContain("Verify");
    expect(message.subject).toContain("OpenStream");
    expect(message.text).toContain("Alice");
    expect(message.text).toContain(verificationPayload.url);
  });
});

describe("buildResetPasswordEmail", () => {
  test("subject says reset, body has the reset link and the safety note", () => {
    const message = buildResetPasswordEmail(resetPayload);
    expect(message.subject).toContain("Reset");
    expect(message.text).toContain(resetPayload.url);
    expect(message.text).toMatch(/didn't request/i);
  });
});

describe("buildChangeEmailEmail", () => {
  test("addresses the current email and mentions both old and new addresses", () => {
    const message = buildChangeEmailEmail(changeEmailPayload);
    expect(message.to).toBe(changeEmailPayload.to);
    expect(message.text).toContain(changeEmailPayload.to);
    expect(message.text).toContain(changeEmailPayload.newEmail);
    expect(message.text).toContain(changeEmailPayload.url);
  });
});

describe("parseEmailPayload", () => {
  test("accepts well-formed verification payload", () => {
    expect(parseEmailPayload(verificationPayload).kind).toBe("verification");
  });

  test("rejects an unknown discriminator", () => {
    expect(() =>
      parseEmailPayload({ ...verificationPayload, kind: "bogus" }),
    ).toThrow(/Invalid email job payload/);
  });

  test("rejects a non-email 'to' field", () => {
    expect(() =>
      parseEmailPayload({ ...verificationPayload, to: "not-an-email" }),
    ).toThrow(/Invalid email job payload/);
  });

  test("rejects a missing url", () => {
    expect(() =>
      parseEmailPayload({
        kind: "verification",
        to: "a@b.co",
        name: "A",
      }),
    ).toThrow(/Invalid email job payload/);
  });

  test("rejects a change-email payload missing newEmail", () => {
    expect(() =>
      parseEmailPayload({
        kind: "change-email",
        to: "a@b.co",
        name: "A",
        url: "https://example.com/x",
      }),
    ).toThrow(/Invalid email job payload/);
  });
});

describe("EMAIL_JOB_NAME", () => {
  test("is a stable identifier", () => {
    expect(EMAIL_JOB_NAME).toBe("email");
  });
});

describe("processEmail (dry-run path)", () => {
  test("returns dry-run when SMTP is unconfigured", async () => {
    // .env.test deliberately omits SMTP_HOST → email.ts falls into dry-run.
    const result = await processEmail(verificationPayload);
    expect(result.kind).toBe("dry-run");
  });

  test("dry-run works for every payload variant", async () => {
    expect((await processEmail(verificationPayload)).kind).toBe("dry-run");
    expect((await processEmail(resetPayload)).kind).toBe("dry-run");
    expect((await processEmail(changeEmailPayload)).kind).toBe("dry-run");
  });
});
