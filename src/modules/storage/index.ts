import { Elysia } from "elysia";

import { audit } from "@/lib/audit";
import { collectionOf, dataOf, HttpProblem, ok } from "@/lib/response";
import { authMacro } from "@/modules/auth";
import { rateLimit, tooManyRequestsResponseSchema } from "@/plugins/rate-limit";

import {
  DeleteResponseSchema,
  FileItemSchema,
  ForbiddenResponseSchema,
  KeyQuerySchema,
  ListFilesQuerySchema,
  PresignedResponseSchema,
  PresignUploadBodySchema,
  UnsupportedMediaTypeResponseSchema,
} from "./model";
import { storageService, type ActingUser } from "./service";

type AuthedUser = { id: string; role?: string | null | undefined };

function toActingUser(user: AuthedUser): ActingUser {
  return { id: user.id, role: user.role ?? "student" };
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
    "storage.files.list.query": ListFilesQuerySchema,
    "storage.files.list.response": collectionOf(FileItemSchema),
    "rate-limit.response": tooManyRequestsResponseSchema,
  })
  .post(
    "/presign/upload",
    ({ body, user }) => {
      const result = storageService.presignUpload(body, toActingUser(user));
      if (result.kind === "unsupported-media-type") {
        throw new HttpProblem(
          415,
          "UNSUPPORTED_MEDIA_TYPE",
          `contentType '${result.contentType}' is not allowed for purpose '${result.purpose}'.`,
          {
            errors: [
              {
                field: "contentType",
                rule: "allowedMimes",
                message: `Allowed types: ${[...result.allowedMimes].join(", ")}`,
                rejectedValue: result.contentType,
              },
            ],
          },
        );
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
        security: [{ sessionCookie: [], csrfHeader: [] }],
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
        throw new HttpProblem(403, "FORBIDDEN", result.reason);
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
  .get(
    "/files",
    async ({ query, user }) => {
      const limit = query.limit ?? 50;
      const result = await storageService.listFiles(user.id, {
        ...(query.cursor ? { cursor: query.cursor } : {}),
        limit,
      });
      return {
        data: result.data.items,
        meta: {
          hasMore: result.data.hasMore,
          nextCursor: result.data.nextCursor,
          previousCursor: null,
          limit: result.data.limit,
        },
      };
    },
    {
      auth: true,
      beforeHandle: rateLimit({
        key: "storage.files.list",
        max: 60,
        windowSec: 60,
      }),
      query: "storage.files.list.query",
      response: {
        200: "storage.files.list.response",
        429: "rate-limit.response",
      },
      detail: {
        summary: "List files",
        description:
          "Returns a cursor-paginated list of the caller's uploaded files. Pass `cursor` from the previous response's `meta.nextCursor` to fetch the next page.",
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
        throw new HttpProblem(403, "FORBIDDEN", result.reason);
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
        security: [{ sessionCookie: [], csrfHeader: [] }],
      },
    },
  );
