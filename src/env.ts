import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const EnvSchema = Type.Object({
  NODE_ENV: Type.Union([
    Type.Literal("development"),
    Type.Literal("test"),
    Type.Literal("production"),
  ]),
  DATABASE_URL: Type.String({ minLength: 1 }),
  REDIS_URL: Type.String({ minLength: 1 }),
  ALLOWED_ORIGIN: Type.Optional(Type.String({ minLength: 1 })),
  APP_URL: Type.Optional(Type.String({ minLength: 1 })),
  PORT: Type.Optional(Type.String({ pattern: "^[0-9]{1,5}$" })),
  S3_ACCESS_KEY_ID: Type.String({ minLength: 1 }),
  S3_SECRET_ACCESS_KEY: Type.String({ minLength: 1 }),
  S3_BUCKET: Type.String({ minLength: 1 }),
  S3_REGION: Type.Optional(Type.String({ minLength: 1 })),
  S3_ENDPOINT: Type.Optional(Type.String({ minLength: 1 })),

  // SMTP — all optional. When SMTP_HOST is absent the email worker logs the
  // would-be message instead of sending. That keeps local dev usable without
  // an SMTP relay, and tests hermetic. Production must set them.
  SMTP_HOST: Type.Optional(Type.String({ minLength: 1 })),
  SMTP_PORT: Type.Optional(Type.String({ pattern: "^[0-9]{1,5}$" })),
  SMTP_USER: Type.Optional(Type.String({ minLength: 1 })),
  SMTP_PASS: Type.Optional(Type.String({ minLength: 1 })),
  SMTP_FROM: Type.Optional(Type.String({ minLength: 1 })),
  SMTP_SECURE: Type.Optional(
    Type.Union([Type.Literal("true"), Type.Literal("false")]),
  ),
});

const raw = Object.fromEntries(
  Object.entries({
    NODE_ENV: process.env.NODE_ENV ?? "development",
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN,
    APP_URL: process.env.APP_URL,
    PORT: process.env.PORT,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_REGION: process.env.S3_REGION,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM: process.env.SMTP_FROM,
    SMTP_SECURE: process.env.SMTP_SECURE,
  }).map(([k, v]) => [k, v === "" ? undefined : v]),
);

const errors = [...Value.Errors(EnvSchema, raw)];
if (errors.length > 0) {
  const summary = errors
    .map((e) => `- ${e.path || "unknown"}: ${e.message}`)
    .join("\n");
  throw new Error(
    [
      "Invalid environment configuration.",
      "Update your .env.local file with valid values for:",
      summary,
    ].join("\n"),
  );
}

export const env = Value.Decode(EnvSchema, raw) as Static<typeof EnvSchema>;

// ALLOWED_ORIGIN is optional in the schema so local dev works without it, but
// in production an unset origin makes the cors plugin allow ALL origins with
// credentials — which reopens the cross-origin `fetch()` CSRF vector that the
// `x-requested-with` header check relies on cors to close. Fail fast instead.
if (env.NODE_ENV === "production" && env.ALLOWED_ORIGIN === undefined) {
  throw new Error(
    "ALLOWED_ORIGIN must be set in production. Without it, CORS allows all " +
      "origins with credentials, defeating CSRF protection.",
  );
}
