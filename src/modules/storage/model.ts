import { t, validationDetail } from "elysia";

import { FieldErrorSchema } from "@/lib/api/models";

export const PRESIGN_TTL_SECONDS = 300;

export const UPLOAD_PURPOSES = ["profile-image", "document", "media"] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

const PurposeSchema = t.Union(
  UPLOAD_PURPOSES.map((value) => t.Literal(value)),
  {
    description:
      "What the file is for. Controls allowed MIME types and size cap.",
    error: validationDetail(
      `'purpose' must be one of: ${UPLOAD_PURPOSES.join(", ")}.`,
    ),
  },
);

const FileNameSchema = t.String({
  minLength: 1,
  maxLength: 255,
  description: "Original upload filename. Used only to derive a display slug.",
  error: validationDetail(
    "'fileName' is required and must be 1–255 characters.",
  ),
});

const ContentTypeSchema = t.String({
  minLength: 1,
  maxLength: 127,
  description: "MIME type. Must match the purpose's allowlist.",
  error: validationDetail(
    "'contentType' must be a non-empty MIME type string.",
  ),
});

const StorageKeySchema = t.String({
  minLength: 1,
  maxLength: 1024,
  pattern: "^users/[^/]+/[^/]+/[^/]+/[^/]+$",
  description:
    "Server-generated object key. Must match users/{userId}/{purpose}/{uuid}/{slug}.",
  error: validationDetail(
    "'key' is invalid. Use a key previously returned by /presign/upload.",
  ),
});

export const PresignUploadBodySchema = t.Object(
  {
    fileName: FileNameSchema,
    contentType: ContentTypeSchema,
    purpose: PurposeSchema,
  },
  {
    description: "Request a presigned upload URL.",
    error: validationDetail(
      "Invalid upload payload. Provide 'fileName', 'contentType', and 'purpose'.",
    ),
  },
);

export const KeyQuerySchema = t.Object(
  { key: StorageKeySchema },
  {
    error: validationDetail("Query is invalid. Provide a valid 'key'."),
  },
);

export const PresignedResponseSchema = t.Object(
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

export const DeleteResponseSchema = t.Object({
  deleted: t.Literal(true),
  key: t.String({ minLength: 1 }),
});

export const ForbiddenResponseSchema = t.Object({
  error: t.Object({
    code: t.Literal("FORBIDDEN"),
    message: t.String({ minLength: 1 }),
  }),
});

export const UnsupportedMediaTypeResponseSchema = t.Object({
  error: t.Object({
    code: t.Literal("UNSUPPORTED_MEDIA_TYPE"),
    message: t.String({ minLength: 1 }),
    details: t.Optional(t.Array(FieldErrorSchema)),
  }),
});

export type PresignUploadBody = typeof PresignUploadBodySchema.static;
export type KeyQuery = typeof KeyQuerySchema.static;
export type PresignedResponse = typeof PresignedResponseSchema.static;
export type DeleteResponse = typeof DeleteResponseSchema.static;
export type ForbiddenResponse = typeof ForbiddenResponseSchema.static;
export type UnsupportedMediaTypeResponse =
  typeof UnsupportedMediaTypeResponseSchema.static;
