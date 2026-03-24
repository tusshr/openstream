import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

// H5 proof against a real Postgres: course ids are numeric Snowflakes stored as
// text. When several courses share a publishedAt, the keyset tie-break must
// order them NUMERICALLY (2, 10, 100) — a plain text comparison would order
// them "10", "100", "2" and skip/duplicate rows across pages. Skips when no
// real DB is reachable. Run with Postgres up:
//   bun test tests/courses-pagination.test.ts

const { db } = await import("@/db");
const { user, educatorProfiles, courses } = await import("@/db/schema");
const { courseService } = await import("@/modules/courses/service");

let dbUp = false;
try {
  await db.execute(sql`select 1`);
  dbUp = true;
} catch {
  dbUp = false;
}

const USER_ID = "pgtest-user";
const EP_ID = "pgtest-ep";
const COURSE_IDS = ["2", "10", "100"]; // different digit-lengths on purpose
const PUBLISHED_AT = new Date("2099-01-01T00:00:00.000Z"); // most-recent → page 1

async function cleanup(): Promise<void> {
  // FK order: courses -> educator_profiles -> user
  await db.delete(courses).where(eq(courses.educatorId, EP_ID));
  await db.delete(educatorProfiles).where(eq(educatorProfiles.id, EP_ID));
  await db.delete(user).where(eq(user.id, USER_ID));
}

describe.skipIf(!dbUp)("course catalog cursor pagination (real DB)", () => {
  beforeAll(async () => {
    await cleanup();
    const now = new Date();
    await db.insert(user).values({
      id: USER_ID,
      name: "PG Tester",
      email: "pgtest-pagination@openstream.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(educatorProfiles).values({ id: EP_ID, userId: USER_ID });
    await db.insert(courses).values(
      COURSE_IDS.map((id, i) => ({
        id,
        educatorId: EP_ID,
        title: `PG Pagination ${id}`,
        slug: `pgtest-pagination-${i}`,
        status: "published" as const,
        publishedAt: PUBLISHED_AT,
      })),
    );
  });

  afterAll(cleanup);

  test("paginates same-publishedAt courses in numeric id order", async () => {
    const collected: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < COURSE_IDS.length; i++) {
      const page = await courseService.list({
        limit: 1,
        ...(cursor ? { cursor } : {}),
      });
      collected.push(...page.rows.map((r) => r.id));
      cursor = page.nextCursor ?? undefined;
    }

    // numeric order, NOT the lexicographic "10","100","2"
    expect(collected).toEqual(["2", "10", "100"]);
  });
});
