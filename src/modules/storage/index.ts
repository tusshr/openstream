import { Elysia, status } from "elysia";

import { audit } from "@/lib/audit";
import { dataOf, ok } from "@/lib/response";
import { authMacro } from "@/modules/auth";
import { rateLimit, tooManyRequestsResponseSchema } from "@/plugins/rate-limit";

import {
  DeleteResponseSchema,
  type ForbiddenResponse,
  ForbiddenResponseSchema,
  KeyQuerySchema,
  PresignedResponseSchema,
  PresignUploadBodySchema,
  type UnsupportedMediaTypeResponse,
  UnsupportedMediaTypeResponseSchema,
} from "./model";
import { type ActingUser, storageService } from "./service";

type AuthedUser = { id: string; role?: string | null | undefined };

function toActingUser(user: AuthedUser): ActingUser {
  return { id: user.id, role: user.role ?? "user" };
}

export const storage = new Elysia({ prefix: "/storage", name: "storage" })
  .use(authMacro)
  .model({
    "storage.upload.body": PresignUploadBodySchema,
    "storage.key.query": KeyQuerySchema,
    "storage.presigned.response": dataOf(PresignedResponseSchema),
    "storage.delete.response": dataOf(DeleteResponseSchema),
    "storage.forbidden.response": ForbiddenResponseSchema,
    "storage.unsupported.response": UnsupportedMediaTypeResponseSchema,
    "rate-limit.response": tooManyRequestsResponseSchema,
  })
  .post(
    "/presign/upload",
    ({ body, user }) => {
      const result = storageService.presignUpload(body, toActingUser(user));
      if (result.kind === "unsupported-media-type") {
        const failure: UnsupportedMediaTypeResponse = {
          error: {
            code: "UNSUPPORTED_MEDIA_TYPE",
            message: `contentType '${result.contentType}' is not allowed for purpose '${result.purpose}'.`,
            details: [
              {
                field: "contentType",
                rule: "allowedMimes",
                message: `Allowed types: ${[...result.allowedMimes].join(", ")}`,
                rejectedValue: result.contentType,
              },
            ],
          },
        };
        return status(415, failure);
      }
      return ok(result.data);
    },
    {
      auth: true,
      beforeHandle: rateLimit({
        key: "storage.presign.upload",
        max: 30,
        windowSec: 60,
      }),
      body: "storage.upload.body",
      response: {
        200: "storage.presigned.response",
        415: "storage.unsupported.response",
        429: "rate-limit.response",
      },
      detail: {
        summary: "Create presigned upload URL",
        description:
          "Returns a short-lived S3 URL the client uses to PUT directly. The server generates the object key from purpose + acting user; the client must echo the key back for download or delete. Responds 415 when contentType is not in the purpose's allowlist.",
        tags: ["Storage"],
        security: [{ sessionCookie: [] }],
      },
    },
  )
  .get(
    "/presign/download",
    ({ query, user }) => {
      const result = storageService.presignDownload(
        query.key,
        toActingUser(user),
      );
      if (result.kind === "forbidden") {
        const failure: ForbiddenResponse = {
          error: { code: "FORBIDDEN", message: result.reason },
        };
        return status(403, failure);
      }
      return ok(result.data);
    },
    {
      auth: true,
      beforeHandle: rateLimit({
        key: "storage.presign.download",
        max: 120,
        windowSec: 60,
      }),
      query: "storage.key.query",
      response: {
        200: "storage.presigned.response",
        403: "storage.forbidden.response",
        429: "rate-limit.response",
      },
      detail: {
        summary: "Create presigned download URL",
        description:
          "Returns a short-lived S3 URL the client uses to GET directly. Responds 403 if the key does not belong to the caller. Admin role bypasses the ownership check.",
        tags: ["Storage"],
        security: [{ sessionCookie: [] }],
      },
    },
  )
  .delete(
    "/files",
    async ({ query, user, request }) => {
      const result = await storageService.deleteFile(
        query.key,
        toActingUser(user),
      );
      if (result.kind === "forbidden") {
        const failure: ForbiddenResponse = {
          error: { code: "FORBIDDEN", message: result.reason },
        };
        return status(403, failure);
      }

      await audit({
        request,
        actorId: user.id,
        action: "storage.file.delete",
        resourceType: "storage.object",
        resourceId: query.key,
      });

      return ok(result.data);
    },
    {
      auth: true,
      beforeHandle: rateLimit({
        key: "storage.files.delete",
        max: 30,
        windowSec: 60,
      }),
      query: "storage.key.query",
      response: {
        200: "storage.delete.response",
        403: "storage.forbidden.response",
        429: "rate-limit.response",
      },
      detail: {
        summary: "Delete file",
        description:
          "Deletes a file from S3 by its object key (passed as ?key=). Responds 403 if the key does not belong to the caller. Idempotent: deleting a non-existent key still returns 200.",
        tags: ["Storage"],
        security: [{ sessionCookie: [] }],
      },
    },
  );
