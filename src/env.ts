import { type Static, Type } from "@sinclair/typebox";
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
  PORT: Type.Optional(Type.String({ pattern: "^[0-9]{1,5}$" })),
  S3_ACCESS_KEY_ID: Type.String({ minLength: 1 }),
  S3_SECRET_ACCESS_KEY: Type.String({ minLength: 1 }),
  S3_BUCKET: Type.String({ minLength: 1 }),
  S3_REGION: Type.Optional(Type.String({ minLength: 1 })),
  S3_ENDPOINT: Type.Optional(Type.String({ minLength: 1 })),
});

const raw = Object.fromEntries(
  Object.entries({
    NODE_ENV: process.env.NODE_ENV ?? "development",
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN,
    PORT: process.env.PORT,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_REGION: process.env.S3_REGION,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
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
