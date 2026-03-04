import { t, validationDetail } from "elysia";

export const PRESIGN_TTL_SECONDS = 300;

export const UPLOAD_PURPOSES = ["profile-image", "document", "media"] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

const purposeSchema = t.Union(
  UPLOAD_PURPOSES.map((value) => t.Literal(value)),
  {
    description:
      "What the file is for. Controls allowed MIME types and size cap.",
    error: validationDetail(
      `'purpose' must be one of: ${UPLOAD_PURPOSES.join(", ")}.`,
    ),
  },
);

const fileNameSchema = t.String({
  minLength: 1,
  maxLength: 255,
  description: "Original upload filename. Used only to derive a display slug.",
  error: validationDetail(
    "'fileName' is required and must be 1–255 characters.",
  ),
});

const contentTypeSchema = t.String({
  minLength: 1,
  maxLength: 127,
  description: "MIME type. Must match the purpose's allowlist.",
  error: validationDetail(
    "'contentType' must be a non-empty MIME type string.",
  ),
});

const storageKeySchema = t.String({
  minLength: 1,
  maxLength: 1024,
  pattern: "^users/[^/]+/[^/]+/[^/]+/[^/]+$",
  description:
    "Server-generated object key. Must match users/{userId}/{purpose}/{uuid}/{slug}.",
  error: validationDetail(
    "'key' is invalid. Use a key previously returned by /presign/upload.",
  ),
});

export const presignUploadBodySchema = t.Object(
  {
    fileName: fileNameSchema,
    contentType: contentTypeSchema,
    purpose: purposeSchema,
  },
  {
    description: "Request a presigned upload URL.",
    error: validationDetail(
      "Invalid upload payload. Provide 'fileName', 'contentType', and 'purpose'.",
    ),
  },
);

export const keyQuerySchema = t.Object(
  { key: storageKeySchema },
  {
    error: validationDetail("Query is invalid. Provide a valid 'key'."),
  },
);

export const presignedResponseSchema = t.Object(
  {
    url: t.String({ format: "uri" }),
    key: t.String({ minLength: 1 }),
    expiresInSeconds: t.Number({ minimum: 1 }),
    maxBytes: t.Number({ minimum: 1 }),
  },
  {
    description:
      "Short-lived S3 URL. Clients must respect maxBytes; the server will reject objects larger than this on a follow-up confirm step.",
  },
);

export const deleteResponseSchema = t.Object({
  deleted: t.Literal(true),
  key: t.String({ minLength: 1 }),
});

export const forbiddenResponseSchema = t.Object({
  error: t.Literal("Forbidden"),
  message: t.String({ minLength: 1 }),
});

export const unsupportedMediaTypeResponseSchema = t.Object({
  error: t.Literal("Unsupported Media Type"),
  message: t.String({ minLength: 1 }),
  allowedMimes: t.Array(t.String({ minLength: 1 })),
});

export type PresignUploadBody = typeof presignUploadBodySchema.static;
export type KeyQuery = typeof keyQuerySchema.static;
export type PresignedResponse = typeof presignedResponseSchema.static;
export type DeleteResponse = typeof deleteResponseSchema.static;
export type ForbiddenResponse = typeof forbiddenResponseSchema.static;
export type UnsupportedMediaTypeResponse =
  typeof unsupportedMediaTypeResponseSchema.static;
