import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { createEnv, type StandardSchemaV1 } from "@t3-oss/env-core";

const toStandardSchema = <T extends TSchema>(
  schema: T,
): StandardSchemaV1<unknown, Static<T>> => ({
  "~standard": {
    version: 1,
    vendor: "typebox",
    validate: (value: unknown) => {
      const errors = [...Value.Errors(schema, value)];

      if (errors.length === 0) {
        return {
          value: value as Static<T>,
        };
      }

      return {
        issues: errors.map((error) => ({
          message: error.message,
          path: error.path ? error.path.split("/").filter(Boolean) : undefined,
        })),
      };
    },
  },
});

const optional = <T extends TSchema>(schema: T) =>
  Type.Union([schema, Type.Undefined()]);

const nodeEnv = Type.Union([
  Type.Literal("development"),
  Type.Literal("test"),
  Type.Literal("production"),
]);

export const env = createEnv({
  server: {
    NODE_ENV: toStandardSchema(nodeEnv),
    DATABASE_URL: toStandardSchema(Type.String({ minLength: 1 })),
    REDIS_URL: toStandardSchema(Type.String({ minLength: 1 })),
    ALLOWED_ORIGIN: toStandardSchema(optional(Type.String({ minLength: 1 }))),
    PORT: toStandardSchema(optional(Type.String({ pattern: "^[0-9]{1,5}$" }))),
    S3_ACCESS_KEY_ID: toStandardSchema(Type.String({ minLength: 1 })),
    S3_SECRET_ACCESS_KEY: toStandardSchema(Type.String({ minLength: 1 })),
    S3_BUCKET: toStandardSchema(Type.String({ minLength: 1 })),
    S3_REGION: toStandardSchema(optional(Type.String({ minLength: 1 }))),
    S3_ENDPOINT: toStandardSchema(optional(Type.String({ minLength: 1 }))),
  },
  runtimeEnvStrict: {
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
  },
  emptyStringAsUndefined: true,
});
