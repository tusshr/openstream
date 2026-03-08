import { Elysia, status } from "elysia";

import { audit } from "@/lib/audit";
import { dataOf, ok } from "@/lib/response";
import { authMacro } from "@/modules/auth";

import {
  deleteResponseSchema,
  type ForbiddenResponse,
  forbiddenResponseSchema,
  keyQuerySchema,
  presignedResponseSchema,
  presignUploadBodySchema,
  type UnsupportedMediaTypeResponse,
  unsupportedMediaTypeResponseSchema,
} from "./model";
import { type ActingUser, storageService } from "./service";

// `role` on better-auth's user is `string | null | undefined`. The `?:` plus
// `| undefined` is required under exactOptionalPropertyTypes — without the
// explicit `| undefined`, the call site couldn't pass the property at all.
type AuthedUser = { id: string; role?: string | null | undefined };

function toActingUser(user: AuthedUser): ActingUser {
  return { id: user.id, role: user.role ?? "user" };
}

export const storage = new Elysia({ prefix: "/storage", name: "storage" })
  .use(authMacro)
  .model({
    "storage.upload.body": presignUploadBodySchema,
    "storage.key.query": keyQuerySchema,
    "storage.presigned.response": dataOf(presignedResponseSchema),
    "storage.delete.response": dataOf(deleteResponseSchema),
    "storage.forbidden.response": forbiddenResponseSchema,
    "storage.unsupported.response": unsupportedMediaTypeResponseSchema,
  })
  .post(
    "/presign/upload",
    ({ body, user }) => {
      const result = storageService.presignUpload(body, toActingUser(user));
      if (result.kind === "unsupported-media-type") {
        const failure: UnsupportedMediaTypeResponse = {
          error: "Unsupported Media Type",
          message: `contentType '${result.contentType}' is not allowed for purpose '${result.purpose}'.`,
          allowedMimes: [...result.allowedMimes],
        };
        return status(415, failure);
      }
      return ok(result.data);
    },
    {
      auth: true,
      body: "storage.upload.body",
      response: {
        200: "storage.presigned.response",
        415: "storage.unsupported.response",
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
          error: "Forbidden",
          message: result.reason,
        };
        return status(403, failure);
      }
      return ok(result.data);
    },
    {
      auth: true,
      query: "storage.key.query",
      response: {
        200: "storage.presigned.response",
        403: "storage.forbidden.response",
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
          error: "Forbidden",
          message: result.reason,
        };
        return status(403, failure);
      }

      // Successful delete is a state-changing event on a tenant resource.
      // We audit AFTER the S3 delete returns ok so the row only exists
      // when the actual object has been removed.
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
      query: "storage.key.query",
      response: {
        200: "storage.delete.response",
        403: "storage.forbidden.response",
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
