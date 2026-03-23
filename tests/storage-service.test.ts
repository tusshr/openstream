import { describe, expect, mock, test } from "bun:test";

// The service imports `@/lib/storage` (Bun S3Client). Mock it before importing
// the service so no real S3 client is constructed during tests.
mock.module("@/lib/storage", () => ({
  s3: {
    presign: (key: string, options: { method: string }) =>
      `https://example.invalid/${options.method.toLowerCase()}/${encodeURIComponent(key)}`,
    delete: async () => undefined,
  },
}));

const { __testing, StorageService } = await import("@/modules/storage/service");

const { slugifyFileName, buildObjectKey, checkKeyOwnership } = __testing;

const alice = { id: "alice", role: "user" } as const;
const bob = { id: "bob", role: "user" } as const;
const root = { id: "root", role: "admin" } as const;

describe("slugifyFileName", () => {
  test("preserves safe characters", () => {
    expect(slugifyFileName("Report-2025.Q4_v1.pdf")).toBe(
      "Report-2025.Q4_v1.pdf",
    );
  });

  test("collapses path traversal sequences", () => {
    expect(slugifyFileName("../../../etc/passwd")).toBe("etc_passwd");
  });

  test("strips leading dots so no hidden file is produced", () => {
    expect(slugifyFileName(".env")).toBe("env");
    expect(slugifyFileName("...hidden")).toBe("hidden");
  });

  test("replaces whitespace and unicode with underscores", () => {
    expect(slugifyFileName("my essay (final).docx")).toBe(
      "my_essay_final_.docx",
    );
  });

  test("falls back to 'file' when nothing survives sanitization", () => {
    expect(slugifyFileName("   ")).toBe("file");
    expect(slugifyFileName("...")).toBe("file");
    expect(slugifyFileName("/")).toBe("file");
  });

  test("caps long names at 100 characters", () => {
    const long = `${"a".repeat(500)}.pdf`;
    const slug = slugifyFileName(long);
    expect(slug.length).toBe(100);
  });
});

describe("buildObjectKey", () => {
  test("produces the canonical users/{userId}/{purpose}/{uuid}/{slug} shape", () => {
    const key = buildObjectKey("alice", "profile-image", "avatar.png");
    const segments = key.split("/");
    expect(segments).toHaveLength(5);
    expect(segments[0]).toBe("users");
    expect(segments[1]).toBe("alice");
    expect(segments[2]).toBe("profile-image");
    expect(segments[3]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(segments[4]).toBe("avatar.png");
  });

  test("generates distinct keys for repeat uploads", () => {
    const first = buildObjectKey("alice", "document", "notes.pdf");
    const second = buildObjectKey("alice", "document", "notes.pdf");
    expect(first).not.toBe(second);
  });
});

describe("checkKeyOwnership", () => {
  test("accepts a user's own key", () => {
    const key = buildObjectKey("alice", "profile-image", "avatar.png");
    expect(checkKeyOwnership(key, alice)).toBeNull();
  });

  test("rejects another user's key", () => {
    const aliceKey = buildObjectKey("alice", "profile-image", "avatar.png");
    expect(checkKeyOwnership(aliceKey, bob)).not.toBeNull();
  });

  test("rejects malformed keys (no user prefix)", () => {
    expect(checkKeyOwnership("not-a-real-key", alice)).not.toBeNull();
    expect(checkKeyOwnership("evil/alice/x/y/z", alice)).not.toBeNull();
  });

  test("admin bypasses ownership", () => {
    const aliceKey = buildObjectKey("alice", "profile-image", "avatar.png");
    expect(checkKeyOwnership(aliceKey, root)).toBeNull();
    expect(checkKeyOwnership("malformed-key", root)).toBeNull();
  });
});

describe("StorageService.presignUpload", () => {
  const service = new StorageService();

  test("returns ok with a server-generated key under the caller's namespace", () => {
    const result = service.presignUpload(
      {
        fileName: "avatar.png",
        contentType: "image/png",
        purpose: "profile-image",
      },
      alice,
    );

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.data.key.startsWith("users/alice/profile-image/")).toBe(true);
    expect(result.data.maxBytes).toBeGreaterThan(0);
    expect(result.data.expiresInSeconds).toBeGreaterThan(0);
  });

  test("rejects a MIME type that is not in the purpose's allowlist", () => {
    const result = service.presignUpload(
      {
        fileName: "evil.html",
        contentType: "text/html",
        purpose: "profile-image",
      },
      alice,
    );

    expect(result.kind).toBe("unsupported-media-type");
    if (result.kind !== "unsupported-media-type") return;
    expect(result.allowedMimes).toContain("image/png");
    expect(result.allowedMimes).not.toContain("text/html");
  });

  test("allows the same MIME under a different purpose only when configured", () => {
    const docResult = service.presignUpload(
      {
        fileName: "spreadsheet.csv",
        contentType: "text/csv",
        purpose: "document",
      },
      alice,
    );
    const imageResult = service.presignUpload(
      {
        fileName: "spreadsheet.csv",
        contentType: "text/csv",
        purpose: "profile-image",
      },
      alice,
    );

    expect(docResult.kind).toBe("ok");
    expect(imageResult.kind).toBe("unsupported-media-type");
  });
});

describe("StorageService.presignDownload", () => {
  const service = new StorageService();

  test("the file owner can presign a download", () => {
    const aliceKey = buildObjectKey("alice", "document", "notes.pdf");
    const result = service.presignDownload(aliceKey, alice);
    expect(result.kind).toBe("ok");
  });

  // Phase 0 regression — IDOR fix.
  test("another user CANNOT presign a download for someone else's key", () => {
    const aliceKey = buildObjectKey("alice", "document", "notes.pdf");
    const result = service.presignDownload(aliceKey, bob);
    expect(result.kind).toBe("forbidden");
  });

  test("admin can presign a download for any key", () => {
    const aliceKey = buildObjectKey("alice", "document", "notes.pdf");
    const result = service.presignDownload(aliceKey, root);
    expect(result.kind).toBe("ok");
  });
});

describe("StorageService.deleteFile", () => {
  const service = new StorageService();

  test("the file owner can delete", async () => {
    const aliceKey = buildObjectKey("alice", "media", "lesson.mp4");
    const result = await service.deleteFile(aliceKey, alice);
    expect(result.kind).toBe("ok");
  });

  // Phase 0 regression — IDOR fix.
  test("another user CANNOT delete someone else's key", async () => {
    const aliceKey = buildObjectKey("alice", "media", "lesson.mp4");
    const result = await service.deleteFile(aliceKey, bob);
    expect(result.kind).toBe("forbidden");
  });

  test("admin can delete any key", async () => {
    const aliceKey = buildObjectKey("alice", "media", "lesson.mp4");
    const result = await service.deleteFile(aliceKey, root);
    expect(result.kind).toBe("ok");
  });
});
