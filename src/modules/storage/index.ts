import { Elysia, t } from "elysia";

import { s3 } from "@/lib/storage";
import { authPlugin } from "@/modules/auth";

export const storage = new Elysia({ prefix: "/storage", name: "storage" })
  .use(authPlugin)
  // Upload presigned URL — client PUTs directly to S3 (never through our server)
  .get(
    "/presign/upload",
    ({ query: { key, contentType } }) => ({
      url: s3.presign(key, {
        method: "PUT",
        expiresIn: 3600,
        ...(contentType && { type: contentType }),
      }),
      key,
      expiresIn: 3600,
    }),
    {
      auth: true,
      query: t.Object({
        key: t.String({ minLength: 1 }),
        contentType: t.Optional(t.String()),
      }),
    },
  )
  // Download presigned URL — client GETs directly from S3
  .get(
    "/presign/download",
    ({ query: { key } }) => ({
      url: s3.presign(key, {
        method: "GET",
        expiresIn: 3600,
      }),
      key,
      expiresIn: 3600,
    }),
    {
      auth: true,
      query: t.Object({
        key: t.String({ minLength: 1 }),
      }),
    },
  )
  // Delete a file — server-side, authenticated
  .delete(
    "/file",
    async ({ query: { key } }) => {
      await s3.delete(key);
      return { deleted: true, key };
    },
    {
      auth: true,
      query: t.Object({
        key: t.String({ minLength: 1 }),
      }),
    },
  );
