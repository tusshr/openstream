import { s3 } from "@/lib/storage";

import {
  type DeleteResponse,
  PRESIGN_TTL_SECONDS,
  type PresignedResponse,
  type PresignUploadBody,
  type UploadPurpose,
} from "./model";

type UploadPolicy = {
  readonly allowedMimes: readonly string[];
  readonly maxBytes: number;
};

const UPLOAD_POLICY: Record<UploadPurpose, UploadPolicy> = {
  "profile-image": {
    allowedMimes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 5 * 1024 * 1024,
  },
  document: {
    allowedMimes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
      "text/csv",
      "text/markdown",
    ],
    maxBytes: 25 * 1024 * 1024,
  },
  media: {
    allowedMimes: [
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "audio/mpeg",
      "audio/mp4",
      "audio/webm",
    ],
    maxBytes: 500 * 1024 * 1024,
  },
};

const KEY_PREFIX = "users";

export type ActingUser = {
  readonly id: string;
  readonly role: string;
};

// Framework-agnostic tagged results. The controller maps each kind to an HTTP
// status code; the service stays unit-testable without Elysia, and adding a
// new failure mode is just another variant in the union.
export type ServiceOk<T> = { readonly kind: "ok"; readonly data: T };

export type PresignUploadResult =
  | ServiceOk<PresignedResponse>
  | {
      readonly kind: "unsupported-media-type";
      readonly purpose: UploadPurpose;
      readonly contentType: string;
      readonly allowedMimes: readonly string[];
    };

export type PresignDownloadResult =
  | ServiceOk<PresignedResponse>
  | { readonly kind: "forbidden"; readonly reason: string };

export type DeleteFileResult =
  | ServiceOk<DeleteResponse>
  | { readonly kind: "forbidden"; readonly reason: string };

// Allow letters, digits, dot, hyphen, underscore. Collapse other runs to a
// single underscore. Strip leading dots/underscores so we never produce hidden
// files or path-traversal segments. Cap at 100 chars to keep keys short.
function slugifyFileName(fileName: string): string {
  const cleaned = fileName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[._]+/, "")
    .replace(/[._]+$/, "")
    .slice(0, 100);

  return cleaned.length > 0 ? cleaned : "file";
}

function buildObjectKey(
  userId: string,
  purpose: UploadPurpose,
  fileName: string,
): string {
  return `${KEY_PREFIX}/${userId}/${purpose}/${crypto.randomUUID()}/${slugifyFileName(fileName)}`;
}

function isAdmin(user: ActingUser): boolean {
  return user.role === "admin";
}

// Returns null if the key belongs to the user (or the user is admin), and a
// short reason string otherwise. The route schema already validates the key
// shape; this is defense-in-depth and the seam the unit tests exercise.
function checkKeyOwnership(key: string, user: ActingUser): string | null {
  if (isAdmin(user)) return null;

  const segments = key.split("/");
  if (segments.length < 2 || segments[0] !== KEY_PREFIX) {
    return "Key prefix does not identify a user-owned object.";
  }
  if (segments[1] !== user.id) {
    return "Key does not belong to the caller.";
  }
  return null;
}

function largestUploadCap(): number {
  return Math.max(
    ...Object.values(UPLOAD_POLICY).map((policy) => policy.maxBytes),
  );
}

export class StorageService {
  presignUpload(
    body: PresignUploadBody,
    user: ActingUser,
  ): PresignUploadResult {
    const policy = UPLOAD_POLICY[body.purpose];

    if (!policy.allowedMimes.includes(body.contentType)) {
      return {
        kind: "unsupported-media-type",
        purpose: body.purpose,
        contentType: body.contentType,
        allowedMimes: policy.allowedMimes,
      };
    }

    const key = buildObjectKey(user.id, body.purpose, body.fileName);

    const url = s3.presign(key, {
      method: "PUT",
      expiresIn: PRESIGN_TTL_SECONDS,
      type: body.contentType,
    });

    return {
      kind: "ok",
      data: {
        url,
        key,
        expiresInSeconds: PRESIGN_TTL_SECONDS,
        maxBytes: policy.maxBytes,
      },
    };
  }

  presignDownload(key: string, user: ActingUser): PresignDownloadResult {
    const denied = checkKeyOwnership(key, user);
    if (denied !== null) return { kind: "forbidden", reason: denied };

    const url = s3.presign(key, {
      method: "GET",
      expiresIn: PRESIGN_TTL_SECONDS,
    });

    return {
      kind: "ok",
      data: {
        url,
        key,
        expiresInSeconds: PRESIGN_TTL_SECONDS,
        maxBytes: largestUploadCap(),
      },
    };
  }

  async deleteFile(key: string, user: ActingUser): Promise<DeleteFileResult> {
    const denied = checkKeyOwnership(key, user);
    if (denied !== null) return { kind: "forbidden", reason: denied };

    await s3.delete(key);
    return { kind: "ok", data: { deleted: true, key } };
  }
}

export const storageService = new StorageService();

// Exported for unit testing. Not part of the runtime API.
export const __testing = {
  slugifyFileName,
  buildObjectKey,
  checkKeyOwnership,
  UPLOAD_POLICY,
};
