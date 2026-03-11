import { describe, expect, it } from "bun:test";

import { slugify, uniqueSlug } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips special characters", () => {
    expect(slugify("Java for Absolute Begainers!")).toBe(
      "java-for-absolute-begainers",
    );
  });

  it("normalises unicode accents to their base letters", () => {
    // NFKD decomposes é → e + combining-acute, ö → o + combining-diaeresis;
    // the regex then strips the combining marks, leaving the base letters.
    expect(slugify("Héllo Wörld")).toBe("hello-world");
  });

  it("collapses multiple spaces and hyphens", () => {
    expect(slugify("a   b---c")).toBe("a-b-c");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("--hello--")).toBe("hello");
  });

  it("replaces underscores with hyphens", () => {
    expect(slugify("hello_world")).toBe("hello-world");
  });

  it("returns 'untitled' for empty or whitespace-only input", () => {
    expect(slugify("")).toBe("untitled");
    expect(slugify("   ")).toBe("untitled");
    expect(slugify("!!!")).toBe("untitled");
  });

  it("truncates to 100 characters", () => {
    const long = "a".repeat(200);
    expect(slugify(long).length).toBeLessThanOrEqual(100);
  });
});

describe("uniqueSlug", () => {
  const noConflicts = async (_prefix: string) => [];
  const withConflicts =
    (...taken: string[]) =>
    async (_prefix: string) =>
      taken;

  it("returns base slug when no conflicts exist", async () => {
    expect(await uniqueSlug("java-for-beginners", noConflicts)).toBe(
      "java-for-beginners",
    );
  });

  it("returns base-1 when base slug is taken", async () => {
    expect(
      await uniqueSlug(
        "java-for-beginners",
        withConflicts("java-for-beginners"),
      ),
    ).toBe("java-for-beginners-1");
  });

  it("returns base-2 when base and base-1 are taken", async () => {
    expect(
      await uniqueSlug(
        "java-for-beginners",
        withConflicts("java-for-beginners", "java-for-beginners-1"),
      ),
    ).toBe("java-for-beginners-2");
  });

  it("reuses a gap when a middle suffix was deleted", async () => {
    // base and base-2 exist but base-1 was deleted — should reuse base-1
    expect(
      await uniqueSlug(
        "java-for-beginners",
        withConflicts("java-for-beginners", "java-for-beginners-2"),
      ),
    ).toBe("java-for-beginners-1");
  });

  it("does not confuse similar-but-different slugs", async () => {
    // 'java-for-beginners-advanced' is NOT a numbering conflict
    expect(
      await uniqueSlug(
        "java-for-beginners",
        withConflicts("java-for-beginners", "java-for-beginners-advanced"),
      ),
    ).toBe("java-for-beginners-1");
  });
});
